"""Booking requests: full days, accept, decline with reason → hand-off, timeout → proposed time, parent's answer, credit kept.
App on :3000 (plain .env.local)."""
import asyncio, json, random, subprocess, urllib.request
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:3000"
R = random.randint(10000, 99999)
PW = "Passw0rd123"
TA, TB = f"معلمة أ {R}", f"معلمة ب {R}"
C_EMAIL = f"reqc{R}@test.sa"
TEAMS = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_REQ%40thread.v2/0"
CRON_KEY = next(l.split("=", 1)[1].strip() for l in open(".env.local") if l.startswith("HASH_SECRET="))

def step(m): print("✓", m, flush=True)
def sql(q):
    r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
def cron():
    req = urllib.request.Request(BASE + "/api/cron/jobs", method="POST", headers={"x-cron-key": CRON_KEY})
    return json.loads(urllib.request.urlopen(req).read())

async def join_teacher(b, name, email):
    t = await (await b.new_context()).new_page()
    await t.goto(f"{BASE}/teachers/join")
    await t.fill("#f-full_name", name); await t.fill("#f-email", email); await t.fill("#f-phone", "0551230000")
    await t.fill("#f-password", PW); await t.check("input[name=subjects][value=math]")
    await t.fill("#f-qualification", "بكالوريوس رياضيات"); await t.fill("#bio", "معلمة رياضيات لاختبار طلبات الحجز في المنصة.")
    await t.fill("#f-teams_link", TEAMS); await t.set_input_files("#cv", "tests/cv.pdf"); await t.check("input[name=consent]")
    await t.click("button[type=submit]"); await t.wait_for_url(f"{BASE}/teacher")
    await t.goto(f"{BASE}/teacher/availability")
    for d in ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]:
        await t.locator("label", has_text=d).first.click()
    await t.select_option("#start", "08:00"); await t.select_option("#end", "23:00")
    await t.click("button:has-text('أضيفي الفترة')"); await expect(t.get_by_text("تمت إضافة الفترة")).to_be_visible()
    return t

async def request(c, teacher, day_index, minute_index):
    await c.goto(f"{BASE}/parent/book"); await c.click("a:has-text('الرياضيات')")
    await c.locator("a[href*='date=']").nth(day_index).click(); await c.wait_for_load_state("networkidle")
    await c.locator("a[href*='minute=']").nth(minute_index).click(); await c.wait_for_load_state("networkidle")
    await c.locator("label", has_text=teacher).click(); await c.fill("#description", "اختبار الطلبات")
    await c.click("button:has-text('أرسل طلب الحجز')"); await c.wait_for_url("**/parent/sessions/*?requested=1")
    return c.url.split("/sessions/")[1].split("?")[0]

def latest(bid):
    return sql(f"""WITH RECURSIVE ch AS (SELECT id, replaced_by FROM bookings WHERE id='{bid}'
                   UNION ALL SELECT b.id, b.replaced_by FROM bookings b JOIN ch ON b.id = ch.replaced_by)
                   SELECT id FROM ch WHERE replaced_by IS NULL""")

async def remaining(c):
    await c.goto(f"{BASE}/parent/book")
    txt = await c.get_by_text("متبقي").first.inner_text()
    return int(txt.split("متبقي")[1].split("من")[0].strip())

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ta = await join_teacher(b, TA, f"reqa{R}@test.sa")
        tb = await join_teacher(b, TB, f"reqb{R}@test.sa")
        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")
        assert 2.9 < float(sql("SELECT extract(epoch FROM s.expires_at - now())/86400 FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE u.email='admin@ghiras.test' ORDER BY s.created_at DESC LIMIT 1")) <= 3
        for name in (TA, TB):
            await a.goto(f"{BASE}/admin/teachers")
            await a.locator("details", has_text=name).locator("button:has-text('اعتماد المعلمة')").click()
            await expect(a.locator("details", has_text=name).get_by_text("معتمدة").first).to_be_visible()
        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", "أم سارة الطلبات"); await a.fill("#f-email", C_EMAIL); await a.fill("#f-phone", "0505550000")
        await a.fill("#f-student_name", "سارة"); await a.select_option("#grade", "6"); await a.select_option("#plan", "ALL_SUBJECTS")
        await a.fill("#f-payment_note", "اختبار الطلبات"); await a.click("button:has-text('إنشاء الحساب')")
        temp = (await a.get_by_role("status").inner_text()).split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        c = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await c.goto(f"{BASE}/login"); await c.fill("#f-email", C_EMAIL); await c.fill("#f-password", temp)
        await c.click("button[type=submit]"); await c.wait_for_url(f"{BASE}/parent")
        assert 29.9 < float(sql(f"SELECT extract(epoch FROM s.expires_at - now())/86400 FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE u.email='{C_EMAIL}' ORDER BY s.created_at DESC LIMIT 1")) <= 30
        step("sessions: owner signed in for 3 days, families for 30 (sliding)")

        # Only A and B take math requests during this test (other test teachers paused, restored at the end)
        paused = sql(f"""WITH x AS (UPDATE teacher_profiles SET accepting = false WHERE accepting AND 'math' = ANY(subjects)
                          AND user_id NOT IN (SELECT id FROM users WHERE full_name IN ('{TA}','{TB}')) RETURNING user_id)
                         SELECT coalesce(string_agg(user_id::text, ','), '') FROM x""")

        # ---------- 1) A day with no room is shown as fully booked and can't be picked
        ids = sql(f"SELECT string_agg(id::text, ',') FROM users WHERE full_name IN ('{TA}','{TB}')").split(",")
        await c.goto(f"{BASE}/parent/book"); await c.click("a:has-text('الرياضيات')")
        first_open = await c.locator("a[href*='date=']").nth(4).get_attribute("href")
        day = first_open.split("date=")[1].split("&")[0]
        for tid in ids:
            sql(f"INSERT INTO availability_exceptions (teacher_id, during, reason) VALUES ('{tid}', tstzrange(('{day}'::date)::timestamp AT TIME ZONE 'Asia/Riyadh', (('{day}'::date + 1))::timestamp AT TIME ZONE 'Asia/Riyadh'), 'اختبار')")
        # other math teachers from earlier runs also count as room: block them too for that day
        for tid in sql("SELECT string_agg(user_id::text, ',') FROM teacher_profiles WHERE 'math' = ANY(subjects)").split(","):
            if tid and tid not in ids:
                sql(f"INSERT INTO availability_exceptions (teacher_id, during, reason) VALUES ('{tid}', tstzrange(('{day}'::date)::timestamp AT TIME ZONE 'Asia/Riyadh', (('{day}'::date + 1))::timestamp AT TIME ZONE 'Asia/Riyadh'), 'اختبار')")
        await c.reload()
        assert await c.locator(f"a[href*='date={day}']").count() == 0
        await expect(c.get_by_text("محجوز بالكامل").first).to_be_visible()
        await c.screenshot(path="/tmp/s_calendar_full.png", full_page=True)
        step("calendar: a day with no free time shows 'محجوز بالكامل' and isn't clickable")

        # ---------- 2) Request → teacher A declines (reason required) → handed to teacher B at the same time
        r0 = await remaining(c)
        bid = await request(c, TA, 1, 2)
        assert await remaining(c) == r0 - 1                                   # held while pending
        await ta.goto(f"{BASE}/teacher/sessions/{bid}")
        await ta.click("button:has-text('اعتذار')")
        await ta.fill("#reason", "لا"); await ta.click("button:has-text('إرسال الاعتذار')")
        assert await ta.locator("#reason").evaluate("e => !e.checkValidity()")          # too short: the form won't send
        assert sql(f"SELECT status FROM bookings WHERE id='{bid}'") == "requested"
        await ta.fill("#reason", f"عندي موعد طبي في هذا الوقت {R}"); await ta.click("button:has-text('إرسال الاعتذار')")
        await expect(ta.get_by_text("وصل اعتذاركِ")).to_be_visible()
        nxt = latest(bid)
        row = sql(f"SELECT status, (SELECT full_name FROM users WHERE id = teacher_id), starts_at = (SELECT starts_at FROM bookings WHERE id='{bid}') FROM bookings WHERE id='{nxt}'").split("|")
        assert row == ["requested", TB, "t"], row
        assert sql(f"SELECT status||'|'||decline_kind FROM bookings WHERE id='{bid}'") == "declined|teacher"
        await c.goto(f"{BASE}/parent/sessions/{bid}"); await c.wait_for_url(f"**/parent/sessions/{nxt}")
        await expect(c.get_by_text(f"بانتظار تأكيد {TB}")).to_be_visible()
        await ta.goto(f"{BASE}/teacher/sessions/{bid}"); await expect(ta.get_by_text("اعتذرتِ عن هذا الطلب")).to_be_visible()
        step("decline needs a reason; request moves to another free teacher at the same time; parent follows it")

        await a.goto(f"{BASE}/admin/requests")
        card = a.locator(".panel", has_text=f"عندي موعد طبي في هذا الوقت {R}")
        await expect(card).to_be_visible(); await card.locator("button:has-text('تمت المراجعة')").click()
        await expect(a.get_by_text(f"عندي موعد طبي في هذا الوقت {R}")).to_have_count(0)
        step("admin sees the decline reason and marks it reviewed")

        # ---------- 3) Teacher B doesn't answer in 3h → nearest alternative proposed to a teacher → parent accepts
        sql(f"UPDATE bookings SET respond_by = now() - interval '1 minute' WHERE id='{nxt}'")
        cron()
        prop = latest(bid)
        row = sql(f"SELECT status, proposal_stage, attempt FROM bookings WHERE id='{prop}'").split("|")
        assert row == ["proposed", "teacher", "3"], row
        assert sql(f"SELECT decline_kind FROM bookings WHERE id='{nxt}'") == "timeout"
        pt = sql(f"SELECT full_name FROM users WHERE id=(SELECT teacher_id FROM bookings WHERE id='{prop}')")
        tp = ta if pt == TA else tb
        await c.goto(f"{BASE}/parent/sessions/{prop}"); await expect(c.get_by_text("نجهّز لك موعداً بديلاً")).to_be_visible()
        await tp.goto(f"{BASE}/teacher/sessions/{prop}")
        await expect(tp.get_by_text("اقتراح موعد بديل بانتظار موافقتكِ")).to_be_visible()
        await tp.click("button:has-text('قبول الحصة')"); await expect(tp.get_by_text("أرسلنا الموعد لولي الأمر")).to_be_visible()
        await c.goto(f"{BASE}/parent")
        await expect(c.get_by_text("يحتاج قرارك (1)")).to_be_visible()
        await c.goto(f"{BASE}/parent/sessions/{prop}")
        await expect(c.get_by_text("هل يناسبك هذا الموعد البديل؟")).to_be_visible()
        await c.screenshot(path="/tmp/s_proposal_parent.png", full_page=True)
        await c.click("button:has-text('تأكيد هذا الموعد')"); await expect(c.get_by_text("تم تأكيد الموعد")).to_be_visible()
        assert sql(f"SELECT status FROM bookings WHERE id='{prop}'") == "scheduled"
        assert await c.locator(f"a[href='{TEAMS}']").count() >= 1
        assert await remaining(c) == r0 - 1
        step("timeout → nearest free time proposed; teacher approves, parent confirms → scheduled with Teams link; one credit used")

        # ---------- 4) Parent declines a proposal → asked to pick a day; the credit comes back
        r1 = await remaining(c)
        bid2 = await request(c, TA, 2, 4)
        await ta.goto(f"{BASE}/teacher/sessions/{bid2}"); await ta.click("button:has-text('اعتذار')")
        await ta.fill("#reason", "ارتباط عائلي"); await ta.click("button:has-text('إرسال الاعتذار')"); await expect(ta.get_by_text("وصل اعتذاركِ")).to_be_visible()
        moved = latest(bid2)
        await tb.goto(f"{BASE}/teacher/sessions/{moved}"); await tb.click("button:has-text('اعتذار')")
        await tb.fill("#reason", "لدي حصة أخرى"); await tb.click("button:has-text('إرسال الاعتذار')"); await expect(tb.get_by_text("وصل اعتذاركِ")).to_be_visible()
        prop2 = latest(bid2)
        assert sql(f"SELECT status||'|'||proposal_stage FROM bookings WHERE id='{prop2}'") == "proposed|teacher"
        pt2 = sql(f"SELECT full_name FROM users WHERE id=(SELECT teacher_id FROM bookings WHERE id='{prop2}')")
        tp2 = ta if pt2 == TA else tb
        await tp2.goto(f"{BASE}/teacher/sessions/{prop2}"); await tp2.click("button:has-text('قبول الحصة')")
        await expect(tp2.get_by_text("أرسلنا الموعد لولي الأمر")).to_be_visible()
        await c.goto(f"{BASE}/parent/sessions/{prop2}")
        await c.click("button:has-text('لا يناسبني')"); await c.wait_for_url("**/parent/book?pick=1")
        await expect(c.get_by_text("حصتك محفوظة في رصيدك")).to_be_visible()
        assert sql(f"SELECT status||'|'||decline_kind FROM bookings WHERE id='{prop2}'") == "not_taken|parent"
        assert await remaining(c) == r1
        await c.goto(f"{BASE}/parent"); await expect(c.get_by_text("اختر موعداً آخر")).to_be_visible()
        step("parent declines the proposal → back to choosing a day, credit restored, reminder on the dashboard")

        # ---------- 5) Nothing is deleted; closed rows can't be revived
        assert int(sql(f"SELECT count(*) FROM bookings WHERE chain_id = (SELECT chain_id FROM bookings WHERE id='{bid2}')")) == 3
        r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", f"UPDATE bookings SET status='scheduled' WHERE id='{bid2}'"], capture_output=True, text=True)
        assert "GHIRAS_PROTECTED" in r.stderr
        step("every step kept as its own row; a closed request can't be brought back")
        if paused: sql(f"UPDATE teacher_profiles SET accepting = true WHERE user_id IN ({','.join(repr(x) for x in paused.split(','))})")
        await b.close()
    print("\nALL REQUEST CHECKS PASSED")

asyncio.run(main())
