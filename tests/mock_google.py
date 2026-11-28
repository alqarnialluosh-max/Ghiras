"""Minimal Google mock: OAuth consent (auto-approves), token endpoint, Meet REST spaces.create. Port 4040."""
import base64, json, threading, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

SCOPE = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/meetings.space.created"
STATE = {"spaces": [], "refreshes": 0, "revoked": False, "refuse_open": False}
LOCK = threading.Lock()
def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
ID_TOKEN = f"{b64({'alg': 'none'})}.{b64({'email': 'meet@ghirasedu.site'})}.sig"

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj, headers=None):
        b = json.dumps(obj).encode(); self.send_response(code)
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/_test/state": return self.send(200, STATE)
        if u.path == "/o/oauth2/v2/auth":
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            assert q.get("access_type") == "offline" and "meetings.space.created" in q.get("scope", "")
            self.send_response(302)
            self.send_header("Location", f"{q['redirect_uri']}?{urlencode({'code': 'CODE123', 'state': q['state']})}"); self.end_headers(); return
        self.send(404, {})
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); raw = self.rfile.read(n).decode() if n else ""
        u = urlparse(self.path)
        if u.path == "/_test/state":
            with LOCK: STATE.update(json.loads(raw)); return self.send(200, {"ok": True})
        if u.path == "/token":
            f = {k: v[0] for k, v in parse_qs(raw).items()}
            if f.get("client_id") != "g-client" or f.get("client_secret") != "g-secret": return self.send(401, {"error": "invalid_client"})
            if f.get("grant_type") == "authorization_code":
                if f.get("code") != "CODE123": return self.send(400, {"error": "invalid_grant"})
                return self.send(200, {"access_token": "ya29.first", "refresh_token": "1//REFRESH", "expires_in": 3600, "scope": SCOPE, "id_token": ID_TOKEN})
            if f.get("grant_type") == "refresh_token":
                if STATE["revoked"] or f.get("refresh_token") != "1//REFRESH": return self.send(400, {"error": "invalid_grant", "error_description": "Token has been expired or revoked."})
                with LOCK: STATE["refreshes"] += 1
                return self.send(200, {"access_token": f"ya29.{uuid.uuid4().hex[:8]}", "expires_in": 3600, "scope": SCOPE})
            return self.send(400, {"error": "unsupported_grant_type"})
        if u.path == "/v2/spaces":
            if not (self.headers.get("Authorization") or "").startswith("Bearer ya29."): return self.send(401, {"error": {"message": "unauthenticated"}})
            body = json.loads(raw or "{}")
            if STATE["refuse_open"] and body.get("config", {}).get("accessType") == "OPEN":
                return self.send(400, {"error": {"message": "accessType OPEN not allowed", "status": "INVALID_ARGUMENT"}})
            code = uuid.uuid4().hex[:10]
            sp = {"name": f"spaces/{code}", "meetingUri": f"https://meet.google.com/{code[:3]}-{code[3:7]}-{code[7:]}", "meetingCode": code, "config": body.get("config", {})}
            with LOCK: STATE["spaces"].append(sp)
            return self.send(200, sp)
        self.send(404, {})

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4040), H).serve_forever()
