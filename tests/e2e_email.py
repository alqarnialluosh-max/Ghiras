"""Email (Resend) test against tests/mock_resend.py. App on :3003 with RESEND_* pointing at the mock (see README)."""
import asyncio, json, random, re, subprocess, time, urllib.request
from playwright.async_api import async_playwright, expect

BASE, MOCK = "http://localhost:3003", "http://127.0.0.1:4030"
R = random.randint(10000, 99999)
PW, PW2 = "Passw0rd123", "NewPassw0rd456"
P_EMAIL, T_EMAIL, C_EMAIL = f"mailp{R}@test.sa", f"mailt{R}@test.sa", f"mailc{R}@test.sa"
TNAME = f"معلمة بريد {R}"
OWNER_ALERTS = "owner-alerts@ghiras.test"
TEAMS = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_MAIL%40thread.v2/0"
CRON_KEY = next(l.split("=", 1)[1].strip() for l in open(".env.local") if l.startswith("HASH_SECRET="))

def step(m): print("✓", m, flush=True)
def sql(q): return subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True).stdout.strip()
def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read())
def mails(to, subject_part=""):
    return [m for m in mock("/_test/state")["emails"] if to in m["to"] and subject_part in m["subject"]]
def wait_mail(to, subject_part, n=1, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        got = mails(to, subject_part)
        if len(got) >= n: return got[-1]
        time.sleep(0.4)
    raise AssertionError(f"no email '{subject_part}' to {to}; have: {[m['subject'] for m in mock('/_test/state')['emails'] if to in m['to']]}")
def link(mail, path):
    m = re.search(r'href="https?://[^"/]+(' + re.escape(path) + r'\?token=[^"]+)"', mail["html"])
    assert m, "link not found"; return BASE + m.group(1).replace("&amp;", "&")
def cron():
    req = urllib.request.Request(BASE + "/api/cron/jobs", method="POST", headers={"x-cron-key": CRON_KEY})
    return json.loads(urllib.request.urlopen(req).read())

async def main():
    mock("/_test/state", {"emails": [], "fail": None, "keys": {}})
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])

        # ---------- 1) Sign-up sends a verification link; paying and booking wait for it
        pctx = await b.new_context(); pg = await pctx.new_page()
        await pg.goto(f"{BASE}/register")
        await pg.fill("#f-full_name", "هند الشهري"); await pg.fill("#f-email", P_EMAIL); await pg.fill("#f-phone", "0501231234")
        await pg.fill("#f-password", PW); await pg.check("input[name=consent]"); await pg.click("button[type=submit]")
        await pg.wait_for_url("**/parent/welcome"); await pg.click("button:has-text('لاحقاً')"); await pg.wait_for_url("**/parent?welcome=1")
        verify1 = wait_mail(P_EMAIL, "أكّد بريدك")
        assert verify1["from"].startswith("غراس") and 'dir="rtl"' in verify1["html"] and verify1["text"]
        await expect(pg.get_by_role("region", name="تأكيد البريد")).to_be_visible()
        await pg.goto(f"{BASE}/parent/subscribe")
        await expect(pg.get_by_text("أكّد بريدك قبل الدفع")).to_be_visible()
        assert await pg.locator("button:has-text('انتقل للدفع')").count() == 0
        await pg.goto(f"{BASE}/parent/book")
        await expect(pg.get_by_text("أكّد بريدك قبل الحجز")).to_be_visible()
        step("sign-up sends an Arabic RTL verification email; subscribe & book wait for it")

        stored = sql(f"SELECT params::text FROM email_outbox WHERE to_email='{P_EMAIL}' AND template='verify_email' LIMIT 1")
        tok = link(verify1, "/verify-email").split("token=")[1]
        assert "token" not in stored and "http" not in stored
        assert sql(f"SELECT count(*) FROM email_tokens WHERE token_hash = '{tok}'") == "0"
        step("raw token is never stored (only its hash; outbox keeps no link)")

        await pg.goto(f"{BASE}/parent")
        await pg.click("button:has-text('أرسل الرابط مرة أخرى')")
        await expect(pg.get_by_text("أرسلنا رابط التأكيد")).to_be_visible()
        verify2 = wait_mail(P_EMAIL, "أكّد بريدك", n=2)
        await pg.goto(link(verify2, "/verify-email"))
        await expect(pg.get_by_text("تم تأكيد بريدك")).to_be_visible()
        assert sql(f"SELECT email_verified_at IS NOT NULL FROM users WHERE email='{P_EMAIL}'") == "t"
        await pg.goto(link(verify2, "/verify-email"))
        await expect(pg.get_by_text("الرابط غير صالح")).to_be_visible()
        await pg.goto(f"{BASE}/parent")
        await expect(pg.get_by_role("region", name="تأكيد البريد")).to_have_count(0)
        step("resend works; link verifies once, reuse is refused; banner disappears")

        # ---------- 2) Forgot / reset password
        other = await (await b.new_context()).new_page()
        await other.goto(f"{BASE}/forgot-password")
        await other.fill("#f-email", f"nobody{R}@test.sa"); await other.click("button[type=submit]")
        generic = await other.get_by_role("status").inner_text()
        await other.goto(f"{BASE}/forgot-password")
        await other.fill("#f-email", P_EMAIL); await other.click("button[type=submit]")
        assert await other.get_by_role("status").inner_text() == generic
        reset = wait_mail(P_EMAIL, "إعادة تعيين كلمة المرور")
        assert not mails(f"nobody{R}@test.sa")
        step("forgot-password: same answer for unknown emails (no account discovery), link sent to real one")

        await other.goto(link(reset, "/reset-password"))
        await other.fill("#f-password", PW2); await other.fill("#f-password2", "Different123")
        await other.click("button[type=submit]"); await expect(other.get_by_text("كلمتا المرور غير متطابقتين")).to_be_visible()
        await other.fill("#f-password", PW2); await other.fill("#f-password2", PW2); await other.click("button[type=submit]")
        await other.wait_for_url("**/login?reset=1"); await expect(other.get_by_text("تم تغيير كلمة المرور")).to_be_visible()
        await pg.goto(f"{BASE}/parent"); await pg.wait_for_url("**/login**")   # the old session was signed out
        await other.fill("#f-email", P_EMAIL); await other.fill("#f-password", PW); await other.click("button[type=submit]")
        await expect(other.get_by_text("البريد أو كلمة المرور غير صحيحة")).to_be_visible()
        await other.fill("#f-password", PW2); await other.click("button[type=submit]"); await other.wait_for_url(f"{BASE}/parent")
        await other.goto(link(reset, "/reset-password")); await expect(other.get_by_text("الرابط غير صالح")).to_be_visible()
        step("reset: new password works, old one doesn't, all sessions signed out, link single-use")

        # ---------- 3) Teacher application → confirmation + owner alert; approval → email
        t = await (await b.new_context()).new_page()
        await t.goto(f"{BASE}/teachers/join")
        await t.fill("#f-full_name", TNAME); await t.fill("#f-email", T_EMAIL); await t.fill("#f-phone", "0552223344")
        await t.fill("#f-password", PW); await t.check("input[name=subjects][value=math]")
        await t.fill("#f-qualification", "بكالوريوس رياضيات"); await t.fill("#bio", "معلمة رياضيات لاختبار رسائل البريد في المنصة.")
        await t.fill("#f-teams_link", TEAMS); await t.set_input_files("#cv", "tests/cv.pdf"); await t.check("input[name=consent]")
        await t.click("button[type=submit]"); await t.wait_for_url(f"{BASE}/teacher")
        wait_mail(T_EMAIL, "وصلنا طلب انضمامكِ"); wait_mail(OWNER_ALERTS, TNAME)
        tverify = wait_mail(T_EMAIL, "أكّد بريدك"); await t.goto(link(tverify, "/verify-email"))
        await t.goto(f"{BASE}/teacher/availability")
        for d in ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]:
            await t.locator("label", has_text=d).first.click()
        await t.select_option("#start", "08:00"); await t.select_option("#end", "23:00")
        await t.click("button:has-text('أضيفي الفترة')"); await expect(t.get_by_text("تمت إضافة الفترة")).to_be_visible()

        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")
        await a.goto(f"{BASE}/admin/teachers")
        await a.locator("details", has_text=TNAME).locator("button:has-text('اعتماد المعلمة')").click()
        wait_mail(T_EMAIL, "تم اعتمادكِ")
        step("teacher: application received + owner alert, approval email")

        # ---------- 4) Owner-created client: verified already, activation email, booking emails to both
        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", "سلمى البريد"); await a.fill("#f-email", C_EMAIL); await a.fill("#f-phone", "0509871234")
        await a.fill("#f-student_name", "ريم"); await a.select_option("#grade", "4"); await a.select_option("#plan", "ALL_SUBJECTS")
        await a.fill("#f-payment_note", "اختبار البريد"); await a.click("button:has-text('إنشاء الحساب')")
        temp = (await a.get_by_role("status").inner_text()).split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        wait_mail(C_EMAIL, "تم تفعيل"); wait_mail(OWNER_ALERTS, "اشتراك جديد مدفوع")
        c = await (await b.new_context()).new_page()
        await c.goto(f"{BASE}/login"); await c.fill("#f-email", C_EMAIL); await c.fill("#f-password", temp)
        await c.click("button[type=submit]"); await c.wait_for_url(f"{BASE}/parent")
        await expect(c.get_by_role("region", name="تأكيد البريد")).to_have_count(0)
        await c.goto(f"{BASE}/parent/book")
        await c.click("a:has-text('الرياضيات')")
        await c.locator("a[href*='date=']").nth(2).click(); await c.wait_for_load_state("networkidle")
        await c.locator("a[href*='minute=']").first.click(); await c.wait_for_load_state("networkidle")
        await c.locator("label", has_text=TNAME).click(); await c.fill("#description", "حصة اختبار البريد")
        await c.click("button:has-text('أرسل طلب الحجز')"); await c.wait_for_url("**/parent/sessions/*?requested=1")
        bid = c.url.split("/sessions/")[1].split("?")[0]
        tm = wait_mail(T_EMAIL, "طلب حصة جديد"); rm = wait_mail(C_EMAIL, "استلمنا طلب حصة")
        assert f"/teacher/sessions/{bid}" in tm["html"] and "3 ساعات" in tm["text"] and f"/parent/sessions/{bid}" in rm["html"]
        await t.goto(f"{BASE}/teacher/sessions/{bid}"); await t.click("button:has-text('قبول الحصة')")
        await expect(t.get_by_text("تم قبول الحصة")).to_be_visible()
        pm = wait_mail(C_EMAIL, "تم حجز حصة")
        assert f"/parent/sessions/{bid}" in pm["html"] and TNAME in pm["text"]
        step("owner-made client is pre-verified; activation + owner alert; request → teacher, receipt → parent, confirmation after accept")

        # ---------- 5) Reminder ~2h before, sent once
        tid = sql(f"SELECT id FROM users WHERE email='{T_EMAIL}'")
        sql(f"""INSERT INTO bookings (subscription_id,parent_id,student_id,teacher_id,subject,track,starts_at,ends_at,teams_link,created_by)
                SELECT subscription_id,parent_id,student_id,teacher_id,subject,track,
                       date_trunc('minute', now()) + interval '70 minutes', date_trunc('minute', now()) + interval '130 minutes', teams_link, created_by
                  FROM bookings WHERE id='{bid}'""")
        cron(); cron()
        wait_mail(C_EMAIL, "تذكير"); wait_mail(T_EMAIL, "تذكير")
        assert len(mails(C_EMAIL, "تذكير")) == 1 and len(mails(T_EMAIL, "تذكير")) == 1
        step("reminder to both ~2h before; running the job twice doesn't repeat it")

        # ---------- 6) Report → parent email, once
        sql(f"""INSERT INTO bookings (subscription_id,parent_id,student_id,teacher_id,subject,track,starts_at,ends_at,teams_link,created_by)
                SELECT subscription_id,parent_id,student_id,teacher_id,subject,track, now() - interval '5 hours', now() - interval '4 hours', teams_link, created_by
                  FROM bookings WHERE id='{bid}'""")
        past = sql(f"SELECT id FROM bookings WHERE teacher_id='{tid}' AND starts_at < now() ORDER BY created_at DESC LIMIT 1")
        for i in range(2):
            await t.goto(f"{BASE}/teacher/sessions/{past}")
            await t.fill("#r-covered", f"الضرب في عدد من رقمين {i}"); await t.click("button:has-text('احفظي')")
            await expect(t.get_by_text("ووصل التقرير لولي الأمر")).to_be_visible()
        wait_mail(C_EMAIL, "تقرير حصة"); time.sleep(1)
        assert len(mails(C_EMAIL, "تقرير حصة")) == 1
        step("report-ready email to the parent, not repeated when the teacher edits")

        # ---------- 7) Provider outage → queued with error → retried; owner log
        mock("/_test/state", {"fail": 500})
        await a.goto(f"{BASE}/admin/emails")
        await expect(a.get_by_text("مفعّل", exact=True)).to_be_visible()
        await a.fill("#to", "test-inbox@ghiras.test"); await a.click("button:has-text('أرسل')")
        await expect(a.get_by_text("لم تُرسل الرسالة")).to_be_visible()
        assert sql("SELECT status FROM email_outbox WHERE to_email='test-inbox@ghiras.test' ORDER BY created_at DESC LIMIT 1") == "queued"
        mock("/_test/state", {"fail": None})
        sql("UPDATE email_outbox SET send_after = now() WHERE to_email='test-inbox@ghiras.test' AND status='queued'")
        await a.reload(); await a.click("button:has-text('أرسل المنتظرة الآن')")
        wait_mail("test-inbox@ghiras.test", "رسالة تجريبية")
        assert sql("SELECT status FROM email_outbox WHERE to_email='test-inbox@ghiras.test' ORDER BY created_at DESC LIMIT 1") == "sent"
        await a.reload(); await expect(a.get_by_text("تأكيد حجز (ولي أمر)").first).to_be_visible()
        await a.screenshot(path="/tmp/s_emails.png", full_page=True)
        r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", "DELETE FROM email_outbox WHERE true"], capture_output=True, text=True)
        assert r.returncode != 0
        step("outage: email waits and is retried; owner log shows every email; log rows can't be deleted")

        await b.close()
    print("\nALL EMAIL CHECKS PASSED")

asyncio.run(main())
