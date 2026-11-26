"""Team accounts, permissions, support tickets (routing, SLA auto-escalation, manual escalation) and approvals.
App on :3000 (plain .env.local)."""
import asyncio, json, random, subprocess, urllib.request
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:3000"
R = random.randint(10000, 99999)
CRON_KEY = next(l.split("=", 1)[1].strip() for l in open(".env.local") if l.startswith("HASH_SECRET="))

def step(m): print("✓", m, flush=True)
def sql(q, ok=True):
    r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True)
    if ok: assert r.returncode == 0, r.stderr
    return r if not ok else r.stdout.strip()
def cron():
    req = urllib.request.Request(BASE + "/api/cron/jobs", method="POST", headers={"x-cron-key": CRON_KEY})
    return json.loads(urllib.request.urlopen(req).read())

async def login(b, email, pw, landing="**/admin"):
    pg = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
    await pg.goto(f"{BASE}/login"); await pg.fill("#f-email", email); await pg.fill("#f-password", pw)
    await pg.click("button[type=submit]"); await pg.wait_for_url(landing)
    return pg

async def add_staff(a, name, email, role_label):
    await a.goto(f"{BASE}/admin/staff")
    form = a.locator("section", has_text="إضافة عضو للفريق")
    await form.locator("#f-full_name").fill(name); await form.locator("#f-email").fill(email)
    await form.locator("label", has_text=role_label).first.click()
    await form.locator("button:has-text('إضافة للفريق')").click()
    msg = await a.get_by_role("status").first.inner_text()
    assert "كلمة المرور المؤقتة" in msg, msg
    return msg.split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        a = await login(b, "admin@ghiras.test", "AdminPass12345")

        # ---------- 1) Owner builds the team
        pw_m = await add_staff(a, f"مديرة {R}", f"mgr{R}@ghiras.test", "مدير/ة")
        pw_t = await add_staff(a, f"تقنية {R}", f"tech{R}@ghiras.test", "مسؤول/ة التقنية")
        pw_s = await add_staff(a, f"دعم {R}", f"sup{R}@ghiras.test", "دعم فني")
        # only these three should receive routed tickets in this test (earlier runs' staff paused, restored at the end)
        paused = sql(f"""WITH x AS (UPDATE users SET status = 'suspended' WHERE role = 'staff' AND status = 'active'
                          AND email NOT IN ('mgr{R}@ghiras.test','tech{R}@ghiras.test','sup{R}@ghiras.test') RETURNING id)
                         SELECT coalesce(string_agg(id::text, ','), '') FROM x""")
        assert sql(f"SELECT role||'|'||staff_role||'|'||(email_verified_at IS NOT NULL) FROM users WHERE email='sup{R}@ghiras.test'") == "staff|support|true"
        await a.screenshot(path="/tmp/s_staff.png", full_page=True)
        step("owner adds a manager, a tech lead and a support agent (temp passwords shown once)")

        # ---------- 2) Support sees only their sections; other pages are refused
        s = await login(b, f"sup{R}@ghiras.test", pw_s)
        nav = await s.locator("nav").first.inner_text()
        assert "الدعم الفني" in nav and "المحاسبة" not in nav and "فريق العمل" not in nav and "الإعدادات" not in nav
        await s.goto(f"{BASE}/admin/accounting"); await s.wait_for_url("**/admin?denied=1")
        await expect(s.get_by_text("لا تملك صلاحية لهذه الصفحة")).to_be_visible()
        await s.goto(f"{BASE}/admin/staff"); await s.wait_for_url("**/admin")
        assert 2.9 < float(sql(f"SELECT extract(epoch FROM s.expires_at - now())/86400 FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE u.email='sup{R}@ghiras.test' ORDER BY s.created_at DESC LIMIT 1")) <= 3
        step("support: only permitted sections in the menu; accounting and team pages refused; 3-day session")

        # a family to work with (owner-created client)
        await a.goto(f"{BASE}/admin/clients/new")
        C = f"teamc{R}@test.sa"
        await a.fill("#f-full_name", "ولي أمر الدعم"); await a.fill("#f-email", C); await a.fill("#f-phone", "0507770000")
        await a.fill("#f-student_name", "خالد"); await a.select_option("#grade", "3"); await a.select_option("#plan", "ALL_SUBJECTS")
        await a.fill("#f-payment_note", "اختبار الدعم"); await a.click("button:has-text('إنشاء الحساب')")
        await expect(a.get_by_role("status")).to_contain_text("كلمة المرور المؤقتة")
        ref = sql(f"SELECT s.reference FROM subscriptions s JOIN users u ON u.id = s.parent_id WHERE u.email='{C}'")

        # ---------- 3) Medium ticket stays with support; critical goes straight to the tech lead
        await s.goto(f"{BASE}/admin/tickets/new")
        await s.fill("#f-subject", "لا يظهر زر الدخول للحصة"); await s.fill("#description", "ولي الأمر يقول إن الزر لا يظهر")
        await s.select_option("#category", "technical"); await s.fill("#f-requester", C)
        await s.locator("label", has_text="متوسطة").click(); await s.click("button:has-text('فتح التذكرة')")
        await s.wait_for_url("**/admin/tickets/*?created=1")
        t1 = s.url.split("/tickets/")[1].split("?")[0]
        assert sql(f"SELECT level||'|'||(assigned_to = (SELECT id FROM users WHERE email='sup{R}@ghiras.test')) FROM tickets WHERE id='{t1}'") == "0|true"

        await s.goto(f"{BASE}/admin/tickets/new")
        await s.fill("#f-subject", f"الطلاب لا يستطيعون دخول Teams {R}"); await s.select_option("#category", "teams")
        await s.locator("label", has_text="حرجة").click(); await s.click("button:has-text('فتح التذكرة')")
        await s.wait_for_url("**/admin/tickets/*?created=1")
        t2 = s.url.split("/tickets/")[1].split("?")[0]
        await expect(s.get_by_text(f"وأُسندت إلى تقنية {R}")).to_be_visible()
        assert sql(f"SELECT level||'|'||due_at::date FROM tickets WHERE id='{t2}'").startswith("1|")
        hrs = float(sql(f"SELECT extract(epoch FROM due_at - created_at)/3600 FROM tickets WHERE id='{t2}'"))
        assert 0.9 < hrs < 1.1, hrs
        step("medium ticket stays with support; critical goes to the tech lead with a 1-hour deadline")

        # ---------- 4) Tech lead works it; deadline passes → auto-escalates to the manager; manager escalates to the owner
        t = await login(b, f"tech{R}@ghiras.test", pw_t)
        await expect(t.get_by_text("تذاكر مسندة إليك")).to_be_visible()
        await t.goto(f"{BASE}/admin/tickets/{t2}")
        await t.fill("#comment", "أفحص سياسة الاجتماعات في Teams"); await t.select_option("#status", "in_progress")
        await t.click("button:has-text('حفظ')"); await expect(t.get_by_text("تم الحفظ")).to_be_visible()
        sql(f"UPDATE tickets SET due_at = now() - interval '1 minute' WHERE id='{t2}'")
        cron()
        assert sql(f"SELECT level||'|'||(assigned_to = (SELECT id FROM users WHERE email='mgr{R}@ghiras.test')) FROM tickets WHERE id='{t2}'") == "2|true"
        assert sql(f"SELECT count(*) FROM ticket_events WHERE ticket_id='{t2}' AND kind='auto_escalate'") == "1"
        m = await login(b, f"mgr{R}@ghiras.test", pw_m)
        await m.goto(f"{BASE}/admin/tickets/{t2}")
        await expect(m.get_by_text("تصعيد تلقائي")).to_be_visible()
        await m.fill("#reason", "يحتاج قراراً من المالك بخصوص ترخيص مايكروسوفت"); await m.click("button:has-text('تصعيد')")
        await expect(m.get_by_text("صُعّدت التذكرة")).to_be_visible()
        assert sql(f"SELECT level FROM tickets WHERE id='{t2}'") == "3"
        await m.screenshot(path="/tmp/s_ticket.png", full_page=True)
        step("tech lead updates it; deadline passes → auto-escalated to the manager; manager escalates to the owner")

        # ---------- 5) Approvals: support requests a compensation session; manager approves → applied
        before = int(sql(f"SELECT sessions_total FROM subscriptions WHERE reference='{ref}'"))
        await s.goto(f"{BASE}/admin/tickets/{t1}")
        await s.select_option("#kind", "extra_session"); await s.fill("#reference", ref)
        await s.fill("#a-reason", "انقطع اتصال المعلمة وانتهت الحصة مبكراً"); await s.click("button:has-text('إرسال للاعتماد')")
        await expect(s.get_by_text("أُرسل الطلب للاعتماد")).to_be_visible()
        await s.goto(f"{BASE}/admin/approvals"); assert await s.locator("button:has-text('اعتماد وتنفيذ')").count() == 0
        await m.goto(f"{BASE}/admin/approvals")
        card = m.locator("article", has_text=ref).first
        await card.locator("button:has-text('اعتماد وتنفيذ')").click()
        await expect(m.get_by_text("اعتُمد الطلب ونُفّذ")).to_be_visible()
        assert int(sql(f"SELECT sessions_total FROM subscriptions WHERE reference='{ref}'")) == before + 1
        assert sql(f"SELECT count(*) FROM ticket_events WHERE ticket_id='{t1}' AND kind='approval'") == "2"
        r = sql(f"UPDATE approvals SET status='rejected' WHERE subscription_id=(SELECT id FROM subscriptions WHERE reference='{ref}')", ok=False)
        assert "GHIRAS_PROTECTED" in r.stderr
        r = sql(f"UPDATE approvals SET decided_by = requested_by WHERE status='pending'", ok=False)
        step("support requests a compensation session, can't approve; manager approves → +1 session; decisions are final")

        # ---------- 6) Owner widens support's permissions, then suspends the account
        await a.goto(f"{BASE}/admin/staff")
        row = a.locator("details", has_text=f"sup{R}@ghiras.test")
        await row.locator("summary").click()
        await row.locator("label", has_text="تخصيص الصلاحيات").click()
        await row.locator("label", has_text="عرض المحاسبة والمستحقات").click()
        await row.locator("button:has-text('حفظ')").click(); await expect(row.get_by_text("حُفظت الصلاحيات")).to_be_visible()
        await s.goto(f"{BASE}/admin/accounting"); await expect(s).to_have_url(f"{BASE}/admin/accounting")
        await a.reload(); row = a.locator("details", has_text=f"sup{R}@ghiras.test"); await row.locator("summary").click()
        await row.locator("button:has-text('إيقاف الحساب')").click()
        await s.goto(f"{BASE}/admin"); await s.wait_for_url("**/login**")
        step("owner customises support's permissions (accounting opens), then suspends the account (signed out at once)")

        # ---------- 7) Owner adds a teacher directly (approved)
        await a.goto(f"{BASE}/admin/staff")
        tf = a.locator("section", has_text="إضافة معلمة مباشرة")
        await tf.locator("#f-full_name").fill(f"معلمة مباشرة {R}"); await tf.locator("#f-email").fill(f"direct{R}@test.sa")
        await tf.locator("#f-phone").fill("0551119999"); await tf.locator("label", has_text="العلوم").click()
        await tf.locator("#f-qualification").fill("بكالوريوس أحياء")
        await tf.locator("#t-bio").fill("معلمة علوم بخبرة في تبسيط المفاهيم للمرحلة الابتدائية.")
        await tf.locator("button:has-text('إضافة المعلمة معتمدة')").click()
        await expect(tf.get_by_text("أُضيفت المعلمة")).to_be_visible()
        assert sql(f"SELECT u.status||'|'||(p.approved_at IS NOT NULL) FROM users u JOIN teacher_profiles p ON p.user_id=u.id WHERE u.email='direct{R}@test.sa'") == "active|true"
        step("owner adds a teacher directly, already approved")

        # ---------- 8) Records are permanent
        assert "GHIRAS_PROTECTED" in sql(f"DELETE FROM tickets WHERE id='{t1}'", ok=False).stderr
        assert "GHIRAS_PROTECTED" in sql(f"UPDATE ticket_events SET body='x' WHERE ticket_id='{t1}'", ok=False).stderr
        step("tickets and their history can't be deleted or edited")
        if paused: sql(f"UPDATE users SET status='active' WHERE id IN ({','.join(repr(x) for x in paused.split(','))})")
        await b.close()
    print("\nALL TEAM CHECKS PASSED")

asyncio.run(main())
