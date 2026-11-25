"""Minimal Microsoft identity + Graph mock: client-credentials token, calendar events with Teams links."""
import json, threading, urllib.parse, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"fail": False, "events": {}, "cancelled": [], "tokens": 0}
LOCK = threading.Lock()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def body(self):
        n = int(self.headers.get("Content-Length") or 0); return self.rfile.read(n).decode() if n else ""
    def authed(self):
        if self.headers.get("Authorization") != "Bearer graph-token": self.send(401, {"error": {"message": "InvalidAuthenticationToken"}}); return False
        return True
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/_test/state": return self.send(200, STATE)
        if "/events/" in u.path:
            if not self.authed(): return
            ev = STATE["events"].get(urllib.parse.unquote(u.path.rsplit("/", 1)[1]))
            return self.send(200 if ev else 404, ev or {"error": {"message": "not found"}})
        self.send(404, {})
    def do_POST(self):
        u = urllib.parse.urlparse(self.path); raw = self.body()
        if u.path == "/_test/state":
            with LOCK: STATE.update(json.loads(raw)); return self.send(200, {"ok": True})
        if u.path.endswith("/oauth2/v2.0/token"):
            f = dict(urllib.parse.parse_qsl(raw))
            if f.get("client_id") != "ms-client" or f.get("client_secret") != "ms-secret" or f.get("grant_type") != "client_credentials":
                return self.send(400, {"error": "invalid_client", "error_description": "bad credentials"})
            STATE["tokens"] += 1
            return self.send(200, {"access_token": "graph-token", "expires_in": 3600, "token_type": "Bearer"})
        if u.path.endswith("/cancel"):
            if not self.authed(): return
            eid = urllib.parse.unquote(u.path.split("/events/")[1].rsplit("/", 1)[0])
            STATE["cancelled"].append(eid); return self.send(202, {})
        if u.path.endswith("/events"):
            if not self.authed(): return
            if STATE["fail"]: return self.send(503, {"error": {"message": "Service unavailable (mock)"}})
            data = json.loads(raw)
            assert data.get("isOnlineMeeting") is True and data.get("onlineMeetingProvider") == "teamsForBusiness"
            with LOCK:
                for ev in STATE["events"].values():           # transactionId idempotency like Graph
                    if ev["transactionId"] == data["transactionId"]: return self.send(201, ev)
                eid = "AAMk" + uuid.uuid4().hex
                ev = {"id": eid, "transactionId": data["transactionId"], "subject": data["subject"], "start": data["start"],
                      "onlineMeeting": {"joinUrl": f"https://teams.microsoft.com/l/meetup-join/mock-{eid[-8:]}"}}
                STATE["events"][eid] = ev
            return self.send(201, ev)
        self.send(404, {})

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4020), H).serve_forever()
