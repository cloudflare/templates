"""Run the real dashboard, authenticate, open its PTY, and execute a tool round trip.

Run inside the image with test/ mounted at /test. All model calls use a local stub.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer

import requests
from websockets.sync.client import connect

spec = importlib.util.spec_from_file_location("model_stub", "/test/hermes-smoke.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Model = module.Model
server = ThreadingHTTPServer(("127.0.0.1", 0), Model)
threading.Thread(target=server.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory() as tmp:
    env = {**os.environ, "HERMES_HOME": f"{tmp}/home", "MODEL": "openai/gpt-4.1-mini",
           "CUSTOM_BASE_URL": f"http://127.0.0.1:{server.server_port}/v1",
           "OPENAI_API_KEY": "provided-by-worker", "HERMES_DISABLE_LAZY_INSTALLS": "1",
           "HERMES_YOLO_MODE": "1",  # Unattended test of deterministic, local-only commands.
           "HERMES_DASHBOARD_BASIC_AUTH_USERNAME": "sandbox",
           "HERMES_DASHBOARD_BASIC_AUTH_PASSWORD": "local-smoke-only"}
    env["OPENAI_BASE_URL"] = env["CUSTOM_BASE_URL"]
    output = open(f"{tmp}/server.log", "w+")
    process = subprocess.Popen(["python3", "/opt/start-dashboard.py"], env=env, stdout=output, stderr=output)
    session = requests.Session()
    base = "http://localhost:9119"
    try:
        for _ in range(90):
            try:
                if session.get(base + "/api/status", timeout=1).ok:
                    break
            except requests.RequestException:
                pass
            if process.poll() is not None:
                output.seek(0)
                raise AssertionError(output.read())
            time.sleep(1)
        assert session.get(base + "/api/auth/me").status_code == 401
        r = session.post(base + "/auth/password-login", json={"provider": "basic", "username": "sandbox", "password": "local-smoke-only"})
        assert r.ok, r.text
        assert session.get(base + "/api/auth/me").ok
        html = session.get(base).text
        assert "/assets/" in html
        cookie = "; ".join(f"{k}={v}" for k, v in session.cookies.items())
        transcript = ""
        ticket = session.post(base + "/api/auth/ws-ticket").json()["ticket"]
        with connect(f"ws://localhost:9119/api/pty?ticket={ticket}", additional_headers={"Cookie": cookie}, origin=base, open_timeout=15) as ws:
            ws.send("\x1b[RESIZE:120;40]")
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                try:
                    frame = ws.recv(timeout=1)
                    transcript += frame.decode(errors="replace") if isinstance(frame, bytes) else frame
                    if "for commands" in transcript:
                        break
                except TimeoutError:
                    pass
            assert "Chat unavailable" not in transcript, transcript
            ws.send("Create hello.py and test it.")
            time.sleep(0.2)
            ws.send("\r")
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                try:
                    frame = ws.recv(timeout=1)
                    transcript += frame.decode(errors="replace") if isinstance(frame, bytes) else frame
                except TimeoutError:
                    pass
                if "Smoke test complete" in transcript:
                    break
            assert "Smoke test complete" in transcript, transcript[-20000:]
        assert Path("/workspace/hello.py").read_text() == "def hello():\n    return 'Hello, Cloudflare!'\n"
        assert len(Model.calls) >= 3
        print("PASS: dashboard auth, built assets, Node TUI over WebSocket, file write, terminal tool and streamed model response.")
    except Exception:
        print("Model request summaries:", [{"tools": len(c.get("tools", [])), "roles": [m["role"] for m in c["messages"]]} for c in Model.calls])
        output.flush()
        output.seek(0)
        print(output.read()[-10000:])
        raise
    finally:
        process.terminate()
        process.wait(timeout=10)
        output.close()
        server.shutdown()
