export const FIXED_PIPELINE = {
	agent: "arya",
	stt: "flux",
	llm: "@cf/openai/gpt-oss-20b",
	tts: "aura-1",
	voice: "asteria",
} as const;

export function statusPage(): Response {
	return new Response(
		`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cloudflare Docs Voice Agent</title>
  <style>
    :root { color-scheme: light; font-family: Georgia, "Times New Roman", serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #201f1d; background: radial-gradient(circle at top left, #fff3d6, transparent 42%), #f4efe5; }
    main { width: min(42rem, calc(100% - 2rem)); padding: 3rem; border: 1px solid #cfbea2; border-radius: 1.5rem; background: rgb(255 253 247 / 88%); box-shadow: 0 1.5rem 4rem rgb(71 52 25 / 14%); }
    h1 { margin: 0 0 1rem; font-size: clamp(2rem, 7vw, 4.5rem); line-height: .95; letter-spacing: -.04em; }
    p { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.6; }
    code { color: #9a3412; }
  </style>
</head>
<body>
  <main>
    <h1>Cloudflare Docs Voice Agent</h1>
    <p>The backend is running with the fixed <code>Flux -> GPT-OSS 20B -> Aura-1 / Asteria</code> pipeline.</p>
    <p>Agent connections require a server-side <code>Authorization: Bearer</code> header. Do not expose the long-lived token in browser code or URLs.</p>
  </main>
</body>
</html>`,
		{
			headers: {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			},
		},
	);
}
