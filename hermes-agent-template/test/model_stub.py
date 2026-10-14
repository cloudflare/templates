"""Deterministic model responses for the dashboard smoke test."""

import json
from http.server import BaseHTTPRequestHandler


class Model(BaseHTTPRequestHandler):
    calls = []

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
