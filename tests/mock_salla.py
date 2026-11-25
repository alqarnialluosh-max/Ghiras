"""Minimal Salla API mock for integration tests (OAuth refresh rotation + orders + products)."""
import json, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {
    "access": "A1", "refresh": "R1", "refresh_calls": [], "reject_refresh": False,
    "orders": {}, "status_updates": [], "products": [
        {"id": 111222, "name": "باقة المادة الواحدة", "sku": "", "price": {"amount": 399},
         "urls": {"customer": "https://salla.sa/ghirasedu/single/p111222"}},
        {"id": 326502731, "name": "باقة الشامل كل المواد", "sku": "", "price": {"amount": 599},
         "urls": {"customer": "https://salla.sa/ghirasedu/all/p326502731"}},
    ],
}
LOCK = threading.Lock()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)

    def authed(self):
        ok = self.headers.get("Authorization") == f"Bearer {STATE['access']}"
        if not ok: self.send(401, {"error": {"message": "Unauthorized"}})
        return ok

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n).decode() if n else ""

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/_test/state":
            return self.send(200, {k: v for k, v in STATE.items() if k != "products"})
        if u.path == "/oauth2/user/info":
            if not self.authed(): return
            return self.send(200, {"status": 200, "success": True, "data": {"merchant": {"id": 999, "name": "متجر غِراس التجريبي"}}})
        if u.path == "/admin/v2/products":
            if not self.authed(): return
            return self.send(200, {"data": STATE["products"]})
        if u.path == "/admin/v2/orders":
            if not self.authed(): return
            summ = [{"id": int(k), "status": {"slug": v["status"]["slug"]}} for k, v in STATE["orders"].items()]
            return self.send(200, {"data": summ, "pagination": {"totalPages": 1}})
        if u.path.startswith("/admin/v2/orders/"):
            if not self.authed(): return
            oid = u.path.rsplit("/", 1)[1]
            o = STATE["orders"].get(oid)
            return self.send(200 if o else 404, {"data": o} if o else {"error": {"message": "not found"}})
        self.send(404, {})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        raw = self.body()
        if u.path == "/_test/state":
            with LOCK: STATE.update(json.loads(raw))
            return self.send(200, {"ok": True})
        if u.path == "/oauth2/token":
            form = dict(urllib.parse.parse_qsl(raw))
            with LOCK:
                STATE["refresh_calls"].append(form.get("refresh_token"))
                if STATE["reject_refresh"] or form.get("refresh_token") != STATE["refresh"] or form.get("client_id") != "test-client":
                    return self.send(400, {"error": "invalid_grant"})
                n = len(STATE["refresh_calls"]) + 1
                STATE["access"], STATE["refresh"] = f"A{n}", f"R{n}"   # rotate: old refresh token is now dead
            return self.send(200, {"access_token": STATE["access"], "refresh_token": STATE["refresh"], "expires_in": 1209600, "token_type": "bearer"})
        if u.path.startswith("/admin/v2/orders/") and u.path.endswith("/status"):
            if not self.authed(): return
            oid = u.path.split("/")[-2]
            STATE["status_updates"].append({"order": oid, **json.loads(raw or "{}")})
            return self.send(201, {"status": 201, "success": True})
        self.send(404, {})

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4010), H).serve_forever()
