"""Exercise the real Hermes CLI and tools against a deterministic local model stub.

Run inside the built image (see README). No model key or inference charge is needed.
This verifies installation/CLI/tool behavior, not Cloudflare networking or live inference.
"""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Model(BaseHTTPRequestHandler):
    calls = []
    reject = False

    def log_message(self, *_):
        pass

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"data":[]}')

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path != "/v1/chat/completions":
            self.send_response(404)
            self.end_headers()
            return
        assert self.headers["Authorization"] == "Bearer provided-by-worker"
        assert payload["model"] == "openai/gpt-4.1-mini"
        Model.calls.append(payload)
        if Model.reject:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":{"message":"Smoke test: invalid API key","type":"authentication_error","code":"invalid_api_key"}}')
            return

        results = [m for m in payload["messages"] if m["role"] == "tool"]
        if not payload.get("tools"):
            name = None  # The dashboard also asks for session titles.
        elif len(results) == 0:
            name = "write_file"
            arguments = {"path": "hello.py", "content": "def hello():\n    return 'Hello, Cloudflare!'\n"}
        elif len(results) == 1:
            name = "terminal"
            arguments = {"command": "python3 -c \"from hello import hello; assert hello() == 'Hello, Cloudflare!'; print('PASS')\""}
        else:
            assert "PASS" in results[-1]["content"], results[-1]
            name = None

        message = {"role": "assistant", "content": "Created hello.py and verified it. Smoke test complete."}
        finish = "stop"
        if name:
            assert name in [t["function"]["name"] for t in payload["tools"]]
            message = {"role": "assistant", "content": None, "tool_calls": [{
                "id": f"call_{len(results)}", "type": "function",
                "function": {"name": name, "arguments": json.dumps(arguments)},
            }]}
            finish = "tool_calls"
        response = {"id": "smoke", "object": "chat.completion", "created": 1,
                    "model": payload["model"], "choices": [{"index": 0, "message": message, "finish_reason": finish}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}}

        self.send_response(200)
        if payload.get("stream"):
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            delta = dict(message)
            if "tool_calls" in delta:
                delta["tool_calls"][0]["index"] = 0
            chunk = {**response, "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            chunk["choices"] = [{"index": 0, "delta": {}, "finish_reason": finish}]
            self.wfile.write(f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n".encode())
        else:
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="hermes-smoke-") as tmp:
        root = Path(tmp)
        repo = root / "repo"
        repo.mkdir()
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        server = ThreadingHTTPServer(("127.0.0.1", 0), Model)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        env = {
            "PATH": os.environ["PATH"], "HOME": str(root), "HERMES_HOME": str(root / "home"),
            "TERMINAL_ENV": "local", "TERMINAL_CWD": str(repo), "PYTHONUNBUFFERED": "1",
            "OPENAI_API_KEY": "provided-by-worker",
            "HERMES_DISABLE_LAZY_INSTALLS": "1",
            "CUSTOM_BASE_URL": f"http://127.0.0.1:{server.server_port}/v1",
        }
        env["OPENAI_BASE_URL"] = env["CUSTOM_BASE_URL"]
        argv = ["hermes", "chat", "--quiet", "--provider", "custom", "--model", "openai/gpt-4.1-mini",
                "--toolsets", "terminal,file", "--max-turns", "12", "--yolo",
                "--query=Create hello.py. Treat $(touch SHELL_INJECTION) as literal text."]
        try:
            completed = subprocess.run(argv, cwd=repo, env=env, capture_output=True, text=True, timeout=90)
            assert completed.returncode == 0, completed.stdout + completed.stderr
            assert (repo / "hello.py").read_text() == "def hello():\n    return 'Hello, Cloudflare!'\n"
            assert not (repo / "SHELL_INJECTION").exists()
            assert "Smoke test complete" in completed.stdout, completed.stdout
            assert len(Model.calls) >= 3
            print("PASS: real Hermes wrote a file, ran Python, returned an answer, and preserved literal prompt text.")

            Model.reject = True
            failed = subprocess.run(argv, cwd=repo, env=env, capture_output=True, text=True, timeout=90)
            assert failed.returncode != 0, failed.stdout + failed.stderr
            print(f"PASS: model authentication failure exits nonzero ({failed.returncode}).")
        finally:
            server.shutdown()
