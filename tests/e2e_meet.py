"""Google Meet: owner links Google (OAuth), test meeting, sessions get their own open Meet link on confirmation.
App on :3004 with GOOGLE_* pointing at tests/mock_google.py (:4040)."""
import asyncio, json, random, subprocess, urllib.request
from playwright.async_api import async_playwright, expect

BASE, MOCK = "http://localhost:3004", "http://127.0.0.1:4040"
R = random.randint(10000, 99999)
def step(m): print("✓", m, flush=True)
def sql(q):
    r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read())

async def main():
    sql("UPDATE google_connections SET revoked_at = now(), revoke_reason = 'test reset' WHERE revoked_at IS NULL")
    mock("/_test/state", {"spaces": [], "refreshes": 0, "revoked": False, "refuse_open": False})
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")

        # ---------- 1) Link Google from the owner portal
        await a.goto(f"{BASE}/admin/teams")
        await expect(a.get_by_text("جاهز للربط")).to_be_visible()
        # a forged callback (wrong state) is refused
        await a.goto(f"{BASE}/api/google/callback?code=CODE123&state=forged"); await a.wait_for_url("**/admin/teams?google_error=*")
        await expect(a.get_by_text("انتهت صلاحية طلب الربط")).to_be_visible()
        assert sql("SELECT count(*) FROM google_connections WHERE revoked_at IS NULL") == "0"
        await a.click("a:has-text('ربط Google Meet')"); await a.wait_for_url("**/admin/teams?google_connected=1")
        await expect(a.get_by_text("رُبط حساب Google")).to_be_visible()
        await expect(a.get_by_text("meet@ghirasedu.site").first).to_be_visible()
        enc = sql("SELECT refresh_token_enc FROM google_connections WHERE revoked_at IS NULL")
        assert enc and "1//REFRESH" not in enc
        step("owner links Google (forged callback refused); refresh token stored encrypted")

        await a.click("button:has-text('اختبار الربط')")
        await expect(a.get_by_role("status").filter(has_text="الربط يعمل")).to_contain_text("https://meet.google.com/")
        assert mock("/_test/state")["spaces"][-1]["config"]["accessType"] == "OPEN"
        await a.screenshot(path="/tmp/s_meetings.png", full_page=True)
        step("test creates an open Meet space (anyone with the link joins directly)")

        # ---------- 2) A teacher without any permanent link can be booked; accepting creates the session's Meet link
        await a.goto(f"{BASE}/admin/staff")
        tf = a.locator("section", has_text="إضافة معلمة مباشرة")
        await tf.locator("#f-full_name").fill(f"معلمة ميت {R}"); await tf.locator("#f-email").fill(f"meet{R}@test.sa")
        await tf.locator("#f-phone").fill("0553334444"); await tf.locator("label", has_text="الرياضيات").click()
        await tf.locator("#f-qualification").fill("بكالوريوس رياضيات")
        await tf.locator("#t-bio").fill("معلمة رياضيات لاختبار روابط Google Meet التلقائية.")
        await tf.locator("button:has-text('إضافة المعلمة معتمدة')").click()
        tmsg = await tf.get_by_role("status").inner_text()
        tpw = tmsg.split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        t = await (await b.new_context()).new_page()
        await t.goto(f"{BASE}/login"); await t.fill("#f-email", f"meet{R}@test.sa"); await t.fill("#f-password", tpw)
        await t.click("button[type=submit]"); await t.wait_for_url(f"{BASE}/teacher")
        await expect(t.get_by_text("أضيفي رابط اجتماعك الدائم")).to_have_count(0)    # not needed when Meet is linked
        await t.goto(f"{BASE}/teacher/availability")
        for d in ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]:
            await t.locator("label", has_text=d).first.click()
        await t.select_option("#start", "08:00"); await t.select_option("#end", "23:00")
        await t.click("button:has-text('أضيفي الفترة')"); await expect(t.get_by_text("تمت إضافة الفترة")).to_be_visible()

        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", "ولي أمر ميت"); await a.fill("#f-email", f"meetc{R}@test.sa"); await a.fill("#f-phone", "0508881111")
        await a.fill("#f-student_name", "نورة"); await a.select_option("#grade", "5"); await a.select_option("#plan", "ALL_SUBJECTS")
        await a.fill("#f-payment_note", "اختبار ميت"); await a.click("button:has-text('إنشاء الحساب')")
        cpw = (await a.get_by_role("status").inner_text()).split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        c = await (await b.new_context()).new_page()
        await c.goto(f"{BASE}/login"); await c.fill("#f-email", f"meetc{R}@test.sa"); await c.fill("#f-password", cpw)
        await c.click("button[type=submit]"); await c.wait_for_url(f"{BASE}/parent")
        await c.goto(f"{BASE}/parent/book"); await c.click("a:has-text('الرياضيات')")
        await c.locator("a[href*='date=']").nth(2).click(); await c.wait_for_load_state("networkidle")
        await c.locator("a[href*='minute=']").first.click(); await c.wait_for_load_state("networkidle")
        await c.locator("label", has_text=f"معلمة ميت {R}").click(); await c.fill("#description", "حصة اختبار ميت")
        await c.click("button:has-text('أرسل طلب الحجز')"); await c.wait_for_url("**/parent/sessions/*?requested=1")
        bid = c.url.split("/sessions/")[1].split("?")[0]
        await t.goto(f"{BASE}/teacher/sessions/{bid}"); await t.click("button:has-text('قبول الحصة')")
        await expect(t.get_by_text("تم قبول الحصة")).to_be_visible()
        row = sql(f"SELECT teams_source||'|'||meeting_provider||'|'||teams_link FROM bookings WHERE id='{bid}'").split("|")
        assert row[0] == "auto" and row[1] == "google" and row[2].startswith("https://meet.google.com/"), row
        await c.goto(f"{BASE}/parent/sessions/{bid}")
        assert await c.locator(f"a[href='{row[2]}']").count() >= 1
        await c.screenshot(path="/tmp/s_meet_session.png", full_page=True)
        step("teacher needs no permanent link; on acceptance the session gets its own Meet link, shown to the parent")

        # ---------- 3) Disconnect: back to 'ready to link', history kept
        await a.goto(f"{BASE}/admin/teams"); await a.click("button:has-text('فصل الحساب')")
        await expect(a.get_by_text("جاهز للربط")).to_be_visible()
        assert sql("SELECT count(*) FROM google_connections") != "0" and sql("SELECT count(*) FROM google_connections WHERE revoked_at IS NULL") == "0"
        step("owner can disconnect; the connection record is kept, not deleted")
        await b.close()
    print("\nALL MEET CHECKS PASSED")

asyncio.run(main())
