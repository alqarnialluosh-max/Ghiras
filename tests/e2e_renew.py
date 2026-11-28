"""Auto-renewal (phase 1) + post-purchase flow + remaining sessions/end date. Plain app on :3000."""
import asyncio, random, subprocess, urllib.request
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:3000"
R = random.randint(10000, 99999)
CRON_KEY = next(l.split("=", 1)[1].strip() for l in open(".env.local") if l.startswith("HASH_SECRET="))
def step(m): print("✓", m, flush=True)
def sql(q):
    r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
def cron():
    urllib.request.urlopen(urllib.request.Request(BASE + "/api/cron/jobs", method="POST", headers={"x-cron-key": CRON_KEY})).read()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")

        # ---------- 1) Parent buys: disclosure before payment, page refreshes itself, activation → "pick sessions"
        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", f"ولي أمر تجديد {R}"); await a.fill("#f-email", f"renew{R}@test.sa"); await a.fill("#f-phone", "0507776666")
        await a.fill("#f-student_name", "سارة"); await a.select_option("#grade", "4"); await a.select_option("#plan", "SINGLE_SESSION"); await a.select_option("#subject", "math")
        await a.fill("#f-payment_note", "اختبار تجديد"); await a.click("button:has-text('إنشاء الحساب')")
        pw = (await a.get_by_role("status").inner_text()).split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        pid = sql(f"SELECT id FROM users WHERE email='renew{R}@test.sa'")
        c = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await c.goto(f"{BASE}/login"); await c.fill("#f-email", f"renew{R}@test.sa"); await c.fill("#f-password", pw)
        await c.click("button[type=submit]"); await c.wait_for_url(f"{BASE}/parent")
        # one-off plan: no renewal toggle
        await expect(c.get_by_text("التجديد التلقائي:")).to_have_count(0)

        await c.goto(f"{BASE}/parent/subscribe?plan=ALL_SUBJECTS")
        await expect(c.get_by_text("الاشتراك يتجدد تلقائياً كل شهر")).to_be_visible()
        await c.locator("button:has-text('انتقل للدفع')").click()
        await asyncio.sleep(2)
        await c.goto(f"{BASE}/parent")
        await expect(c.get_by_text("ستتحدث هذه الصفحة تلقائياً")).to_be_visible()
        sid = sql(f"SELECT id FROM subscriptions WHERE parent_id='{pid}' AND plan_code='ALL_SUBJECTS' AND status='pending_payment'")
        assert sql(f"SELECT auto_renew FROM subscriptions WHERE id='{sid}'") == "t"
        ref = sql(f"SELECT reference FROM subscriptions WHERE id='{sid}'")
        # owner confirms the payment (same function the Salla webhook uses) → the parent's open page updates by itself
        await a.goto(f"{BASE}/admin/subscriptions?q={ref}")
        d = a.locator("details", has_text=ref); await d.locator("summary").click()
        await d.locator("input[name=order_id]").fill(f"RN{R}"); await d.locator("button:has-text('تفعيل يدوي')").click()
        card = c.locator("article", has_text="كل المواد")
        await expect(card.get_by_text("من 9 حصص متبقية")).to_be_visible(timeout=25000)   # no manual reload
        await expect(c.get_by_text("أكمل الدفع في سلة")).to_have_count(0)
        await expect(card.get_by_text("ينتهي")).to_be_visible()
        await expect(card.get_by_text("مفعّل", exact=True)).to_be_visible()
        await c.screenshot(path="/tmp/s_parent_active.png", full_page=True)
        await c.click("a:has-text('اختر مواعيد الحصص')"); await c.wait_for_url("**/parent/book?sub=*")
        step("disclosure before paying; page refreshes itself on activation; banner → booking; remaining 9 + end date shown")

        # ---------- 2) 3 days before the end → renewal prepared + email with the payment link
        sql(f"UPDATE subscriptions SET starts_at = now() - interval '28 days', ends_at = now() + interval '2 days' WHERE id='{sid}'")
        cron()
        rid = sql(f"SELECT id FROM subscriptions WHERE renewal_of='{sid}' AND status='pending_payment'")
        assert rid, "renewal not created"
        mail = sql(f"SELECT params->>'link' FROM email_outbox WHERE dedupe_key='renewal_due:{rid}'")
        assert mail.startswith("https://salla.sa/"), mail
        cron(); assert sql(f"SELECT count(*) FROM subscriptions WHERE renewal_of='{sid}'") == "1"   # idempotent
        await c.goto(f"{BASE}/parent")
        await expect(c.get_by_text("تجديد: ")).to_be_visible()
        step("renewal created 3 days before the end with the Salla link emailed; running the job again changes nothing")

        # ---------- 3) Parent turns renewal off → unpaid renewal voided (kept); on again → prepared again
        await c.locator("article", has_text="كل المواد").locator("button:has-text('إيقاف التجديد')").click()
        await expect(c.get_by_text("أُوقف التجديد التلقائي")).to_be_visible()
        assert sql(f"SELECT status FROM subscriptions WHERE id='{rid}'") == "void"
        assert sql(f"SELECT auto_renew FROM subscriptions WHERE id='{sid}'") == "f"
        cron()
        assert sql(f"SELECT count(*) FROM email_outbox WHERE dedupe_key='plan_ending:{sid}'") == "1"
        await c.locator("article", has_text="كل المواد").locator("button:has-text('تشغيل التجديد')").click()
        await expect(c.get_by_text("شُغّل التجديد التلقائي")).to_be_visible()
        cron()
        rid2 = sql(f"SELECT id FROM subscriptions WHERE renewal_of='{sid}' AND status='pending_payment'")
        assert rid2 and rid2 != rid
        step("turning off voids the unpaid renewal (kept) + 'plan ending' notice; turning on prepares it again")

        # ---------- 4) Paying the renewal early: new month starts when the current one ends (no lost days)
        ref2 = sql(f"SELECT reference FROM subscriptions WHERE id='{rid2}'")
        await a.goto(f"{BASE}/admin/subscriptions?q={ref2}")
        d = a.locator("details", has_text=ref2); await d.locator("summary").click()
        await d.locator("input[name=order_id]").fill(f"RN2{R}"); await d.locator("button:has-text('تفعيل يدوي')").click()
        for _ in range(30):
            if sql(f"SELECT status FROM subscriptions WHERE id='{rid2}'") == "active": break
            await asyncio.sleep(0.5)
        gap = sql(f"SELECT abs(extract(epoch from (r.starts_at - p.ends_at))) < 2 FROM subscriptions r JOIN subscriptions p ON p.id = r.renewal_of WHERE r.id='{rid2}'")
        assert gap == "t", gap
        await c.goto(f"{BASE}/parent")
        await expect(c.get_by_text("جُدّد للشهر القادم")).to_be_visible()
        await expect(c.get_by_text("يبدأ ").first).to_be_visible()
        await c.screenshot(path="/tmp/s_parent_renewed.png", full_page=True)
        step("renewal paid early starts exactly when the current month ends; parent sees 'renewed' + start date")
        await b.close()
    print("\nALL RENEW CHECKS PASSED")

asyncio.run(main())
