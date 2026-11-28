"""Per-product prices and teacher rates (frozen per session), teacher bonuses, payouts, new Salla links. App on :3000."""
import asyncio, random, subprocess
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:3000"
R = random.randint(10000, 99999)
def step(m): print("✓", m, flush=True)
def sql(q, ok=True):
    r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True)
    if ok: assert r.returncode == 0, r.stderr
    return r if not ok else r.stdout.strip()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        a = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")

        # ---------- 1) New Salla links in place
        links = sql("SELECT string_agg(code||'='||salla_url, ' ' ORDER BY code) FROM plans")
        assert "ALL_SUBJECTS=https://salla.sa/ghirasedu/payment/p544254289" in links
        assert "SINGLE_SUBJECT=https://salla.sa/ghirasedu/payment/p84178834" in links
        assert "SINGLE_SESSION=https://salla.sa/ghirasedu/payment/p447142854" in links
        step("new Salla payment links set for the three products")

        # a teacher with a confirmed past session on the all-subjects plan
        tid = sql("SELECT u.id FROM users u JOIN teacher_profiles p ON p.user_id=u.id WHERE u.status='active' AND p.approved_at IS NOT NULL ORDER BY u.created_at DESC LIMIT 1")
        sub = sql("SELECT id FROM subscriptions WHERE status='active' AND plan_code='ALL_SUBJECTS' ORDER BY created_at DESC LIMIT 1")
        st, par = sql(f"SELECT student_id||'|'||parent_id FROM subscriptions WHERE id='{sub}'").split("|")
        def past_session(days):
            return sql(f"""INSERT INTO bookings (subscription_id,parent_id,student_id,teacher_id,subject,track,starts_at,ends_at,teams_link,created_by,status)
                VALUES ('{sub}','{par}','{st}','{tid}','math','followup', date_trunc('hour', now()) - interval '{days} days',
                        date_trunc('hour', now()) - interval '{days} days' + interval '1 hour', '', '{par}', 'scheduled') RETURNING id""").split("\n")[0]
        old_rate = sql("SELECT teacher_rate_sar FROM plans WHERE code='ALL_SUBJECTS'")
        b1 = past_session(1 + R % 5)
        assert sql(f"SELECT teacher_rate_sar FROM bookings WHERE id='{b1}'") == old_rate     # frozen at confirmation

        # ---------- 2) Owner changes the client price and the teacher rate of a product
        await a.goto(f"{BASE}/admin/plans")
        card = a.locator("section", has_text="ALL_SUBJECTS")
        await card.locator("input[name=teacher_rate_sar]").fill("42.5")
        await card.locator("button:has-text('حفظ')").click()
        await expect(card.get_by_text("أجر المعلمة على الحصص التي تُؤكد من الآن")).to_be_visible()
        assert sql("SELECT teacher_rate_sar FROM plans WHERE code='ALL_SUBJECTS'") == "42.50"
        assert sql(f"SELECT teacher_rate_sar FROM bookings WHERE id='{b1}'") == old_rate     # past session keeps its rate
        b2 = past_session(1 + (R + 1) % 5 + 6)
        assert sql(f"SELECT teacher_rate_sar FROM bookings WHERE id='{b2}'") == "42.50"      # new sessions use the new rate
        assert "GHIRAS_PROTECTED" in sql(f"UPDATE bookings SET teacher_rate_sar = 1 WHERE id='{b1}'", ok=False).stderr
        await a.screenshot(path="/tmp/s_plans.png", full_page=True)
        step("owner edits a product's teacher rate: new sessions use it, confirmed sessions keep theirs (frozen in DB)")

        # ---------- 3) Bonus → shown to the teacher → paid with the month's payout → posted to accounting
        sql(f"UPDATE bookings SET status='completed' WHERE id IN ('{b1}','{b2}')")
        month = sql(f"SELECT to_char(starts_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') FROM bookings WHERE id='{b1}'")
        if sql(f"SELECT count(*) FROM payouts WHERE teacher_id='{tid}' AND to_char(period_start,'YYYY-MM')='{month}'") != "0":
            print("  (month already paid in an earlier run; skipping payout part)"); await b.close(); return
        await a.goto(f"{BASE}/admin/teachers/{tid}")
        await a.fill("#b-amount", "150"); await a.fill("#b-month", month); await a.fill("#b-reason", f"تقييمات ممتازة {R}")
        await a.click("button:has-text('إضافة المكافأة')"); await expect(a.get_by_text("أُضيفت مكافأة 150")).to_be_visible()
        # a mistaken bonus is voided, never deleted
        await a.fill("#b-amount", "999"); await a.fill("#b-month", month); await a.fill("#b-reason", f"خطأ إدخال {R}")
        await a.click("button:has-text('إضافة المكافأة')"); await expect(a.get_by_text("أُضيفت مكافأة 999")).to_be_visible()
        await a.reload()
        row = a.locator("li", has_text=f"خطأ إدخال {R}")
        await row.locator("input[name=reason]").fill("أُدخلت بالخطأ"); await row.locator("button:has-text('إلغاء')").click()
        await expect(a.locator("li", has_text=f"خطأ إدخال {R}").get_by_text("ملغاة")).to_be_visible()
        assert "GHIRAS_PROTECTED" in sql(f"DELETE FROM teacher_bonuses WHERE reason='خطأ إدخال {R}'", ok=False).stderr
        expected = float(sql(f"""SELECT coalesce(sum(teacher_rate_sar),0) FROM bookings WHERE teacher_id='{tid}' AND status IN ('completed','student_absent')
                                 AND to_char(starts_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM')='{month}'""")) + float(sql(
            f"SELECT coalesce(sum(amount_sar),0) FROM teacher_bonuses WHERE teacher_id='{tid}' AND voided_at IS NULL AND to_char(period_month,'YYYY-MM')='{month}'"))
        mrow = a.locator("tr", has_text=month).first
        await expect(mrow).to_contain_text("150")
        await mrow.locator("button:has-text('تسجيل الدفع')").click(); await expect(a.locator("tr", has_text=month).first.get_by_text("مدفوع")).to_be_visible()
        paid = sql(f"SELECT amount_sar||'|'||bonus_sar FROM payouts WHERE teacher_id='{tid}' AND to_char(period_start,'YYYY-MM')='{month}'").split("|")
        assert abs(float(paid[0]) - expected) < 0.01 and float(paid[1]) >= 150, (paid, expected)
        assert sql(f"SELECT payout_id IS NOT NULL FROM teacher_bonuses WHERE reason='تقييمات ممتازة {R}'") == "t"
        led = sql(f"SELECT description FROM ledger_entries WHERE source='teacher_payout' AND source_id=(SELECT id::text FROM payouts WHERE teacher_id='{tid}' AND to_char(period_start,'YYYY-MM')='{month}')")
        assert "مكافأة" in led, led
        r = sql(f"UPDATE teacher_bonuses SET voided_at=now() WHERE reason='تقييمات ممتازة {R}'", ok=False)
        assert r.returncode != 0
        step("bonus added (a mistaken one voided, not deleted); payout = sessions at their rates + bonus; ledger shows it; paid bonus locked")

        # ---------- 4) The teacher sees her rates per product and her bonus
        email = sql(f"SELECT email FROM users WHERE id='{tid}'")
        sql(f"UPDATE users SET password_hash=(SELECT password_hash FROM users WHERE email='admin@ghiras.test') WHERE id='{tid}'")
        t = await (await b.new_context()).new_page()
        await t.goto(f"{BASE}/login"); await t.fill("#f-email", email); await t.fill("#f-password", "AdminPass12345")
        await t.click("button[type=submit]"); await t.wait_for_url(f"{BASE}/teacher")
        await t.goto(f"{BASE}/teacher/earnings")
        await expect(t.get_by_text("42.5 ريال")).to_be_visible()
        await expect(t.get_by_text(f"تقييمات ممتازة {R}")).to_be_visible()
        await t.screenshot(path="/tmp/s_teacher_earnings.png", full_page=True)
        step("teacher sees pay per product and her bonus on 'مستحقاتي'")
        sql("UPDATE plans SET teacher_rate_sar = 35 WHERE code='ALL_SUBJECTS'")
        await b.close()
    print("\nALL PRICING CHECKS PASSED")

asyncio.run(main())
