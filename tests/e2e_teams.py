"""Automatic Teams meetings test against tests/mock_graph.py (app on :3002 with MS_* pointing at the mock)."""
import asyncio, json, random, subprocess, urllib.request
from playwright.async_api import async_playwright, expect

BASE, MOCK = "http://localhost:3002", "http://127.0.0.1:4020"
R = random.randint(1000, 9999)
PW = "Passw0rd123"
TNAME = f"معلمة تيمز {R}"

def step(m): print("✓", m, flush=True)
def sql(q): return subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True).stdout.strip()
def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read())

async def book(pg, t, dayIndex, minuteIndex=0):
    await pg.goto(f"{BASE}/parent/book")
    await pg.click("a:has-text('الرياضيات')")
    await pg.locator("a[href*='date=']").nth(dayIndex).click(); await pg.wait_for_load_state("networkidle")
    await pg.locator("a[href*='minute=']").nth(minuteIndex).click(); await pg.wait_for_load_state("networkidle")
    await pg.locator("label", has_text=TNAME).click()
    await pg.fill("#description", "حصة اختبار تيمز")
    await pg.click("button:has-text('أرسل طلب الحجز')")
    await pg.wait_for_url("**/parent/sessions/*?requested=1")
    bid = pg.url.split("/sessions/")[1].split("?")[0]
    # the teacher accepts → the session is confirmed and gets its Teams meeting
    await t.goto(f"{BASE}/teacher/sessions/{bid}"); await t.click("button:has-text('قبول الحصة')")
    await expect(t.get_by_text("تم قبول الحصة")).to_be_visible()
    await pg.goto(f"{BASE}/parent/sessions/{bid}")
    return bid

async def main():
    mock("/_test/state", {"fail": False, "events": {}, "cancelled": [], "tokens": 0})
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        # Teacher WITHOUT a permanent Teams link (allowed in auto mode)
        t = await (await b.new_context()).new_page()
        await t.goto(f"{BASE}/teachers/join")
        await t.fill("#f-full_name", TNAME); await t.fill("#f-email", f"teams{R}@test.sa"); await t.fill("#f-phone", "0551112233")
        await t.fill("#f-password", PW); await t.check("input[name=subjects][value=math]")
        await t.fill("#f-qualification", "بكالوريوس رياضيات"); await t.fill("#bio", "معلمة رياضيات لاختبار روابط تيمز التلقائية في المنصة.")
        await t.set_input_files("#cv", "tests/cv.pdf"); await t.check("input[name=consent]")
        await t.click("button[type=submit]"); await t.wait_for_url(f"{BASE}/teacher")
        await expect(t.get_by_text("أضيفي رابط اجتماعك الدائم")).to_have_count(0)
        await t.goto(f"{BASE}/teacher/profile")
        await expect(t.get_by_text("يُنشأ رابط اجتماع خاص لكل حصة تلقائياً")).to_be_visible()
        await t.goto(f"{BASE}/teacher/availability")
        for d in ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]:
            await t.locator("label", has_text=d).first.click()
        await t.select_option("#start", "08:00"); await t.select_option("#end", "23:00")
        await t.click("button:has-text('أضيفي الفترة')"); await expect(t.get_by_text("تمت إضافة الفترة")).to_be_visible()
        step("teacher without a permanent link: no warning, auto-mode notice shown")

        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")
        await a.goto(f"{BASE}/admin/teachers")
        await a.locator("details", has_text=TNAME).locator("button:has-text('اعتماد المعلمة')").click()
        await expect(a.locator("details", has_text=TNAME).get_by_text("معتمدة").first).to_be_visible()

        # Owner creates a client with an active all-subjects plan
        C = f"teamsparent{R}@test.sa"
        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", "ولي أمر تيمز"); await a.fill("#f-email", C); await a.fill("#f-phone", "0507778888")
        await a.fill("#f-student_name", "يوسف"); await a.select_option("#grade", "6"); await a.select_option("#plan", "ALL_SUBJECTS")
        await a.fill("#f-payment_note", "اختبار تيمز"); await a.click("button:has-text('إنشاء الحساب')")
        msg = await a.get_by_role("status").inner_text()
        temp = msg.split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        pg = await (await b.new_context()).new_page()
        await pg.goto(f"{BASE}/login"); await pg.fill("#f-email", C); await pg.fill("#f-password", temp)
        await pg.click("button[type=submit]"); await pg.wait_for_url(f"{BASE}/parent")
        step("approved teacher is bookable without a permanent link")

        # 1) Booking → own Teams meeting immediately
        bid = await book(pg, t, 1)
        row = sql(f"SELECT teams_source, teams_link, teams_event_id FROM bookings WHERE id='{bid}'").split("|")
        assert row[0] == "auto" and row[1].startswith("https://teams.microsoft.com/l/meetup-join/mock-") and row[2].startswith("AAMk"), row
        assert await pg.locator(f"a[href='{row[1]}']").count() >= 1
        st = mock("/_test/state")
        assert any(e["transactionId"] == bid for e in st["events"].values())
        step("booking got its own Teams meeting (transactionId = booking id) and the link shows to the parent")

        await t.goto(f"{BASE}/teacher/sessions/{bid}")
        assert await t.locator(f"a[href='{row[1]}']").count() >= 1
        step("teacher sees the same per-session link")

        # 2) Graph outage → session shows 'preparing', then recovers via retry
        mock("/_test/state", {"fail": True})
        bid2 = await book(pg, t, 2)
        await expect(pg.get_by_text("يجري تجهيز رابط الاجتماع الخاص بهذه الحصة")).to_be_visible()
        assert sql(f"SELECT teams_source FROM bookings WHERE id='{bid2}'") == "pending"
        step("Microsoft outage: booking still succeeds; page says the link is being prepared")
        mock("/_test/state", {"fail": False})
        await a.goto(f"{BASE}/admin/teams")
        await expect(a.get_by_text("Teams", exact=True).first).to_be_visible()
        await a.click("button:has-text('أنشئ الروابط الناقصة الآن')")
        await expect(a.get_by_role("status")).to_contain_text("أُنشئ رابط مستقل لـ")
        # other suites may leave upcoming sessions too; what matters is that every attempt succeeded
        import re
        tried, made = map(int, re.findall(r"\d+", await a.get_by_role("status").inner_text())[:2])
        assert tried == made >= 1, (tried, made)
        assert sql(f"SELECT teams_source FROM bookings WHERE id='{bid2}'") == "auto"
        await pg.goto(f"{BASE}/parent/sessions/{bid2}")
        await expect(pg.get_by_text("يجري تجهيز رابط الاجتماع الخاص بهذه الحصة")).to_have_count(0)
        step("retry created the missing link once Microsoft was back")

        # 3) Idempotency: re-running the job does not create duplicates
        before = len(mock("/_test/state")["events"])
        await a.goto(f"{BASE}/admin/teams"); await a.click("button:has-text('أنشئ الروابط الناقصة الآن')")
        await expect(a.get_by_role("status")).to_contain_text("حاولنا")
        assert len(mock("/_test/state")["events"]) == before
        step("retry job is idempotent (no duplicate meetings)")

        # 4) Reschedule → old meeting cancelled, new one created
        old_event = sql(f"SELECT teams_event_id FROM bookings WHERE id='{bid}'")
        await a.goto(f"{BASE}/admin/bookings/{bid}")
        # a fresh slot per run so repeated runs on the same day don't collide (the conflict guard would rightly refuse)
        off, hour = random.randint(5, 25), random.randint(8, 21)
        day = sql(f"SELECT to_char((now() AT TIME ZONE 'Asia/Riyadh')::date + {off}, 'YYYY-MM-DD')")
        await a.fill("input[name=date]", day); await a.fill("input[name=time]", f"{hour:02d}:00")
        await a.fill("input[name=note]", "اختبار إعادة الجدولة")
        await a.click("button:has-text('أعد الجدولة')"); await a.wait_for_url("**/admin/bookings/*?rescheduled=1")
        new_id = a.url.split("/bookings/")[1].split("?")[0]
        assert old_event in mock("/_test/state")["cancelled"]
        assert sql(f"SELECT teams_source FROM bookings WHERE id='{new_id}'") == "auto"
        step("reschedule cancelled the old Teams meeting and created a new one")

        # 5) Owner test button
        await a.goto(f"{BASE}/admin/teams")
        await a.click("button:has-text('اختبار Teams')")
        await expect(a.get_by_role("status")).to_contain_text("الربط يعمل")
        await a.screenshot(path="/tmp/s_teams.png", full_page=True)
        step("owner 'test connection' creates + cancels a test meeting")
        await b.close()
    print("\nALL TEAMS CHECKS PASSED")

asyncio.run(main())
