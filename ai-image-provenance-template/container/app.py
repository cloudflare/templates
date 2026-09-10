"""Verify C2PA manifests and read EXIF/XMP metadata."""

from __future__ import annotations

import io
import json
import logging
import os
from typing import Any

import c2pa
import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import ExifTags, Image

TRUST_ANCHORS_URL = os.getenv(
    "C2PA_TRUST_ANCHORS_URL",
    "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem",
)
MAX_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))

app = FastAPI(title="C2PA and metadata verifier", docs_url=None, redoc_url=None)
_trust_anchors: str | None = None

FIELD_NAMES = {
    "Make": "camera_make",
    "Model": "camera_model",
    "LensModel": "lens_model",
    "DateTimeOriginal": "capture_time",
    "ExposureTime": "exposure_time",
    "FNumber": "aperture",
    "ISOSpeedRatings": "iso",
    "PhotographicSensitivity": "iso",
    "FocalLength": "focal_length",
    "GPSInfo": "gps",
    "Software": "software",
}

AI_MARKERS = {
    "midjourney": "Midjourney",
    "dall-e": "DALL-E",
    "dalle": "DALL-E",
    "stable diffusion": "Stable Diffusion",
    "comfyui": "ComfyUI",
    "firefly": "Firefly",
    "ideogram": "Ideogram",
    "flux": "FLUX",
    "ai-generated": "AI-generated",
}

AI_DIGITAL_SOURCE_MARKERS = (
    "trainedalgorithmicmedia",
    "compositewithtrainedalgorithmicmedia",
)

INVALID_MANIFEST_ERRORS = (
    c2pa.C2paError.Assertion,
    c2pa.C2paError.AssertionNotFound,
    c2pa.C2paError.Decoding,
    c2pa.C2paError.Json,
    c2pa.C2paError.Manifest,
    c2pa.C2paError.ManifestNotFound,
    c2pa.C2paError.ResourceNotFound,
    c2pa.C2paError.Signature,
    c2pa.C2paError.Verify,
)


async def load_trust_anchors() -> str:
    global _trust_anchors
    if _trust_anchors:
        return _trust_anchors
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.get(TRUST_ANCHORS_URL)
        response.raise_for_status()
        _trust_anchors = response.text
    return _trust_anchors


def manifest_location(payload: bytes, content_type: str) -> str:
    settings = c2pa.Settings.from_dict(
        {
            "verify": {
                "verify_after_reading": False,
                "remote_manifest_fetch": False,
                "ocsp_fetch": False,
            }
        }
    )
    with c2pa.Context(settings) as context:
        try:
            reader = c2pa.Reader.try_create(
                content_type, io.BytesIO(payload), context=context
            )
        except c2pa.C2paError as error:
            if str(error).startswith("Remote: must fetch remote manifests"):
                return "remote"
            raise
        if reader is None:
            return "none"
        reader.close()
        return "embedded"


def active_manifest(report: dict[str, Any]) -> dict[str, Any]:
    manifests = report.get("manifests")
    label = report.get("active_manifest")
    if not isinstance(manifests, dict) or not isinstance(label, str):
        return {}
    manifest = manifests.get(label)
    return manifest if isinstance(manifest, dict) else {}


def declares_ai_generation(manifest: dict[str, Any]) -> bool:
    manifest_text = json.dumps(manifest).lower()
    return any(marker in manifest_text for marker in AI_DIGITAL_SOURCE_MARKERS)


def verify_manifest(payload: bytes, content_type: str, trust_anchors: str) -> dict[str, Any]:
    settings = c2pa.Settings.from_dict(
        {
            "verify": {
                "verify_trust": True,
                "remote_manifest_fetch": False,
                "ocsp_fetch": False,
            },
            "trust": {"trust_anchors": trust_anchors},
        }
    )
    with c2pa.Context(settings) as context:
        reader = c2pa.Reader.try_create(
            content_type, io.BytesIO(payload), context=context
        )
        if reader is None:
            return {"status": "not_found"}
        with reader:
            report = json.loads(reader.detailed_json())

    manifests = report.get("manifests")
    manifest = active_manifest(report)
    signature = manifest.get("signature") if isinstance(manifest.get("signature"), dict) else {}
    claim = manifest.get("claim") if isinstance(manifest.get("claim"), dict) else {}
    state = str(report.get("validation_state", "")).lower()

    if not manifests:
        status = "not_found"
    elif state == "trusted":
        status = "verified"
    elif state == "valid":
        status = "present_unverified"
    else:
        status = "invalid"

    result: dict[str, Any] = {
        "status": status,
        "issuer": signature.get("issuer") or signature.get("common_name"),
        "claim_generator": claim.get("claim_generator"),
    }
    if status == "verified":
        result["declares_ai_generation"] = declares_ai_generation(manifest)
    return result


def metadata_signal(payload: bytes) -> dict[str, Any]:
    capture_hints: list[str] = []
    ai_hints: list[str] = []
    values: dict[str, Any] = {}
    embedded_text: list[str] = []
    has_generation_parameters = False

    try:
        with Image.open(io.BytesIO(payload)) as image:
            exif = image.getexif()
            ifds = [exif]
            try:
                ifds.append(exif.get_ifd(ExifTags.IFD.Exif))
            except (KeyError, TypeError, ValueError):
                pass
            for ifd in ifds:
                for tag, value in ifd.items():
                    name = ExifTags.TAGS.get(tag, str(tag))
                    if value is not None and name in FIELD_NAMES and name != "GPSInfo":
                        values[name] = value
            try:
                if exif.get_ifd(ExifTags.IFD.GPSInfo):
                    values["GPSInfo"] = True
            except (KeyError, TypeError, ValueError):
                pass
            xmp = image.info.get("xmp") or image.info.get("XML:com.adobe.xmp")
            if xmp:
                embedded_text.append(
                    xmp.decode("latin1", errors="ignore")
                    if isinstance(xmp, bytes)
                    else str(xmp)
                )
            for key, value in image.info.items():
                normalized_key = key.lower()
                if normalized_key in {"parameters", "prompt", "negative_prompt", "workflow"}:
                    has_generation_parameters = True
                if normalized_key not in {"exif", "icc_profile"}:
                    embedded_text.append(f"{key} {value}")
    except Exception:
        logging.exception("Could not read image metadata")
        return {"status": "error", "capture_hints": [], "ai_hints": []}

    if values.get("Make") or values.get("Model"):
        capture_hints.append("camera")
    if values.get("DateTimeOriginal"):
        capture_hints.append("capture_time")
    if any(
        values.get(name) is not None
        for name in (
            "ExposureTime",
            "FNumber",
            "ISOSpeedRatings",
            "PhotographicSensitivity",
            "FocalLength",
        )
    ):
        capture_hints.append("exposure")
    if values.get("GPSInfo"):
        capture_hints.append("gps")

    metadata_text = f"{' '.join(embedded_text)} {' '.join(str(value) for value in values.values())}".lower()
    for marker, label in AI_MARKERS.items():
        if marker in metadata_text and label not in ai_hints:
            ai_hints.append(label)
    if has_generation_parameters:
        ai_hints.append("generation_parameters")
    if any(marker in metadata_text for marker in AI_DIGITAL_SOURCE_MARKERS):
        ai_hints.append("digital_source_type")

    status = "found" if capture_hints or ai_hints else "not_found"
    return {"status": status, "capture_hints": capture_hints, "ai_hints": ai_hints}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/verify")
async def verify(
    file: UploadFile = File(...),
    enable_c2pa: bool = Form(True),
    enable_metadata: bool = Form(True),
) -> dict[str, Any]:
    payload = await file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, f"image exceeds the {MAX_BYTES} byte limit")

    metadata = (
        metadata_signal(payload)
        if enable_metadata
        else {"status": "disabled", "capture_hints": [], "ai_hints": []}
    )
    if not enable_c2pa:
        return {"c2pa": {"status": "disabled"}, "metadata": metadata}
    content_type = file.content_type or "application/octet-stream"

    try:
        location = manifest_location(payload, content_type)
        if location == "none":
            return {"c2pa": {"status": "not_found"}, "metadata": metadata}
        if location == "remote":
            return {
                "c2pa": {"status": "present_unverified"},
                "metadata": metadata,
            }
        c2pa_result = verify_manifest(
            payload,
            content_type,
            await load_trust_anchors(),
        )
    except INVALID_MANIFEST_ERRORS as error:
        logging.warning("C2PA manifest is invalid: %s", error)
        c2pa_result = {"status": "invalid"}
    except Exception:
        logging.exception("C2PA verification failed")
        c2pa_result = {"status": "error"}

    return {"c2pa": c2pa_result, "metadata": metadata}
