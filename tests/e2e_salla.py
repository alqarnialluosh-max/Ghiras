"""Salla integration test against tests/mock_salla.py (app on :3001 with SALLA_* pointing at the mock)."""
import asyncio, hashlib, hmac, json, random, subprocess, time, urllib.request
from playwright.async_api import async_playwright, expect

BASE, MOCK = "http://localhost:3001", "http://127.0.0.1:4010"
SECRET = b"dev-salla-secret"
R = random.randint(1000, 9999)
P_EMAIL, PW = f"sallap{R}@test.sa", "Passw0rd123"

def step(m): print("✓", m, flush=True)
def sql(q): return subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True).stdout.strip()
def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read())
def webhook(payload):
    body = json.dumps(payload, ensure_ascii=False).encode()
    sig = hmac.new(SECRET, body, hashlib.sha256).hexdigest()
    return json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/webhooks/salla", data=body, headers={"x-salla-signature": sig})).read())

async def main():
    mock("/_test/state", {"access": "A1", "refresh": "R1", "refresh_calls": [], "reject_refresh": False, "orders": {}, "status_updates": []})
    # 1) merchant installs the app → Easy Mode authorize event (token expires within a day → forces a refresh on first use)
    r = webhook({"event": "app.store.authorize", "merchant": 999, "data": {
        "access_token": "A1", "refresh_token": "R1", "expires": int(time.time()) + 3600, "scope": "orders.read_write products.read offline_access"}})
    assert r["result"] == "authorized", r
    assert sql("SELECT count(*) FROM salla_connections WHERE revoked_at IS NULL") == "1"
    tok = sql("SELECT access_token_enc FROM salla_connections WHERE revoked_at IS NULL")
    assert "A1" not in tok and tok.startswith("v1.")
    step("app.store.authorize saved the connection; tokens encrypted at rest")

    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")

        await a.goto(f"{BASE}/admin/salla")
        await expect(a.get_by_text("مربوط", exact=True)).to_be_visible()
        await expect(a.get_by_text("باقة المادة الواحدة").first).to_be_visible()
        st = mock("/_test/state")
        assert st["refresh_calls"] == ["R1"] and st["access"] == "A2", st
        step("first API call refreshed the expiring token once; rotated token stored")

        # Concurrency: several parallel page loads must not reuse a dead refresh token
        sql("UPDATE salla_connections SET expires_at = now() + interval '1 hour' WHERE revoked_at IS NULL")
        pages = [await a.context.new_page() for _ in range(4)]
        await asyncio.gather(*[pg.goto(f"{BASE}/admin/salla") for pg in pages])
        st = mock("/_test/state")
        assert st["refresh_calls"] == ["R1", "R2"], st["refresh_calls"]
        for pg in pages: await pg.close()
        step("4 parallel requests → exactly one refresh (row lock works)")

        # Link Salla product → plan from the products table
        row = a.locator("tr", has_text="باقة المادة الواحدة")
        await row.locator("select[name=plan]").select_option("SINGLE_SUBJECT")
        await row.locator("button:has-text('ربط')").click()
        await expect(a.locator("tr", has_text="باقة المادة الواحدة").locator("span.chip", has_text="باقة مادة واحدة")).to_be_visible()
        assert sql("SELECT salla_product_id FROM plans WHERE code='SINGLE_SUBJECT'") == "111222"
        step("product linked to plan from the Salla products list")

        # Parent subscribes (pending) — but the webhook never arrives
        ctx = await b.new_context()
        await ctx.route("https://salla.sa/**", lambda r: r.fulfill(status=200, body="salla", content_type="text/html"))
        pg = await ctx.new_page()
        await pg.goto(f"{BASE}/register"); await pg.fill("#f-full_name", "ولي أمر سلة"); await pg.fill("#f-email", P_EMAIL)
        await pg.fill("#f-phone", "0501231234"); await pg.fill("#f-password", PW); await pg.check("input[name=consent]")
        await pg.click("button[type=submit]"); await pg.wait_for_url("**/parent**")
        await pg.goto(f"{BASE}/parent/students"); sec = pg.locator("section", has_text="إضافة طالب")
        await sec.locator("#f-full_name").fill("لمى"); await sec.locator("select[name=grade]").select_option("4")
        await pg.click("button:has-text('أضف الطالب')"); await expect(pg.get_by_text("تمت إضافة لمى")).to_be_visible()
        await pg.goto(f"{BASE}/parent/subscribe?plan=SINGLE_SUBJECT")
        await pg.select_option("#subject", "math")
        await pg.click("button:has-text('انتقل للدفع')"); await pg.wait_for_url("https://salla.sa/**")
        step("parent redirected to the linked Salla product")

        oid = str(7000000 + R)
        mock("/_test/state", {"orders": {oid: {"id": int(oid), "reference_id": 1, "status": {"slug": "under_review"},
            "customer": {"email": P_EMAIL, "mobile": "501231234", "mobile_code": "+966"},
            "amounts": {"total": {"amount": 399}}, "items": [{"product": {"id": 111222}}]}}})
        await a.goto(f"{BASE}/admin/salla")
        await a.click("button:has-text('مزامنة الآن')")
        await expect(a.get_by_role("status")).to_contain_text("فُعّل 1")
        st = mock("/_test/state")
        assert {"order": oid, "slug": "completed"} in st["status_updates"], st["status_updates"]
        step("missed webhook recovered by sync → subscription activated + Salla order set to completed")

        await pg.goto(f"{BASE}/parent")
        await expect(pg.get_by_text("لمى").first).to_be_visible()
        assert sql(f"SELECT s.status FROM subscriptions s JOIN users u ON u.id=s.parent_id WHERE u.email='{P_EMAIL}'") == "active"
        inc = sql(f"SELECT count(*) FROM ledger_entries WHERE salla_order_id='{oid}' AND source='subscription'")
        assert inc == "1"
        step("parent sees active subscription; income posted to the ledger")

        # Sync again → nothing new, no duplicate status push
        await a.goto(f"{BASE}/admin/salla"); await a.click("button:has-text('مزامنة الآن')")
        await expect(a.get_by_role("status")).to_contain_text("فُعّل 0")
        assert len([u for u in mock("/_test/state")["status_updates"] if u["order"] == oid]) == 1
        step("second sync is idempotent (no double activation / status push)")

        # Live webhook path also pushes the status
        await pg.goto(f"{BASE}/parent/subscribe?plan=SINGLE_SUBJECT"); await pg.select_option("#subject", "science")
        await pg.click("button:has-text('انتقل للدفع')"); await pg.wait_for_url("https://salla.sa/**")
        oid2 = str(8000000 + R)
        r = webhook({"event": "order.created", "merchant": 999, "data": {"id": int(oid2), "status": {"slug": "under_review"},
            "customer": {"email": P_EMAIL}, "amounts": {"total": {"amount": 399}}, "items": [{"product": {"id": 111222}}]}})
        assert r["result"] == "matched", r
        for _ in range(20):
            if any(u["order"] == oid2 for u in mock("/_test/state")["status_updates"]): break
            await asyncio.sleep(0.25)
        else: raise AssertionError("status not pushed after webhook")
        step("live order webhook → activated + Salla status pushed in the background")

        # Refresh token rejected → connection marked broken, owner told to reinstall
        mock("/_test/state", {"reject_refresh": True})
        sql("UPDATE salla_connections SET expires_at = now() + interval '1 hour' WHERE revoked_at IS NULL")
        await a.goto(f"{BASE}/admin/salla")
        await expect(a.get_by_text("غير مربوط", exact=True)).to_be_visible()
        assert sql("SELECT revoke_reason FROM salla_connections ORDER BY connected_at DESC LIMIT 1") == "refresh_failed"
        step("rejected refresh → connection marked broken (reinstall prompt shown)")

        # Reinstall (Salla issues fresh tokens), then uninstall event
        mock("/_test/state", {"access": "A9", "refresh": "R9", "reject_refresh": False})
        webhook({"event": "app.store.authorize", "merchant": 999, "data": {"access_token": "A9", "refresh_token": "R9", "expires": int(time.time()) + 864000}})
        assert sql("SELECT count(*) FROM salla_connections WHERE revoked_at IS NULL") == "1"
        r = webhook({"event": "app.uninstalled", "merchant": 999, "data": {}})
        assert r["result"] == "revoked" and sql("SELECT count(*) FROM salla_connections WHERE revoked_at IS NULL") == "0"
        assert "GHIRAS_PROTECTED" in subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-c", "DELETE FROM salla_connections"], capture_output=True, text=True).stderr
        step("reinstall + app.uninstalled handled; connection history can't be deleted")

        # Cron endpoint is protected
        try:
            urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/cron/salla-sync", data=b"", headers={"x-cron-key": "nope"})); raise SystemExit("cron open!")
        except urllib.error.HTTPError as e: assert e.code == 403
        step("cron endpoint rejects requests without the internal key")

        await a.screenshot(path="/tmp/s_salla.png", full_page=True)
        await b.close()
    print("\nALL SALLA CHECKS PASSED")

asyncio.run(main())
