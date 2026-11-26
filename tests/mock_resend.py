"""Minimal Resend mock: POST /emails with Bearer auth and Idempotency-Key; test hooks under /_test."""
import json, threading, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"emails": [], "fail": None, "keys": {}}
LOCK = threading.Lock()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def body(self):
        n = int(self.headers.get("Content-Length") or 0); return self.rfile.read(n).decode() if n else ""
    def do_GET(self):
        if self.path == "/_test/state": return self.send(200, STATE)
        self.send(404, {})
    def do_POST(self):
        raw = self.body()
        if self.path == "/_test/state":
            with LOCK: STATE.update(json.loads(raw)); return self.send(200, {"ok": True})
        if self.path != "/emails": return self.send(404, {})
        if self.headers.get("Authorization") != "Bearer re_test_key":
            return self.send(401, {"name": "validation_error", "message": "API key is invalid"})
        if STATE["fail"]: return self.send(STATE["fail"], {"name": "application_error", "message": "mock failure"})
        msg = json.loads(raw); key = self.headers.get("Idempotency-Key")
        with LOCK:
            if key and key in STATE["keys"]: return self.send(200, {"id": STATE["keys"][key]})
            eid = str(uuid.uuid4()); msg["id"] = eid; msg["idempotency_key"] = key
            STATE["emails"].append(msg)
            if key: STATE["keys"][key] = eid
        self.send(200, {"id": eid})

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4030), H).serve_forever()
