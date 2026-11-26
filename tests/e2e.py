import asyncio, json, hmac, hashlib, time, urllib.request, subprocess, random
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:3000"
R = random.randint(1000, 9999)
T_EMAIL, P_EMAIL = f"teacher{R}@test.sa", f"parent{R}@test.sa"
TNAME = f"نورة العتيبي {R}"
PW = "Passw0rd123"
TEAMS = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_TEST%40thread.v2/0"

def sql(q):
    return subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True)

def step(m): print("✓", m, flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        shots = []

        # ---- Teacher signs up
        tctx = await b.new_context(viewport={"width": 1280, "height": 900})
        t = await tctx.new_page()
        await t.goto(f"{BASE}/teachers/join")
        await t.fill("#f-full_name", TNAME)
        await t.fill("#f-email", T_EMAIL)
        await t.fill("#f-phone", "0551234567")
        await t.fill("#f-password", PW)
        await t.check("input[name=subjects][value=math]")
        await t.check("input[name=subjects][value=science]")
        await t.fill("#f-qualification", "بكالوريوس رياضيات")
        await t.fill("#f-years_experience", "6")
        await t.fill("#bio", "معلمة رياضيات بخبرة ست سنوات في تأسيس طلاب الابتدائي والمتوسط بأسلوب مبسط.")
        await t.check("input[name=consent]")
        # no CV → rejected (bypass the browser's required check to test the server)
        await t.evaluate("() => document.querySelector('#cv').removeAttribute('required')")
        await t.click("button[type=submit]")
        await expect(t.get_by_text("إرفاق السيرة الذاتية مطلوب")).to_be_visible()
        # fake file renamed to .pdf → rejected by content check
        await t.fill("#f-password", PW)
        await t.set_input_files("#cv", "tests/fake.pdf")
        await t.check("input[name=consent]")
        await t.click("button[type=submit]")
        await expect(t.get_by_text("يجب أن يكون الملف بصيغة PDF")).to_be_visible()
        step("teacher join rejects missing CV and fake files")
        await t.fill("#f-password", PW)
        await t.set_input_files("#cv", "tests/cv.pdf")
        await t.check("input[name=consent]")
        await t.click("button[type=submit]")
        await t.wait_for_url(f"{BASE}/teacher")
        await expect(t.get_by_text("طلبك قيد المراجعة")).to_be_visible()
        step("teacher registered (pending)")
        await t.goto(f"{BASE}/teacher/earnings")
        await expect(t.get_by_text("يتحدد أجر الحصة بعد المقابلة والقبول")).to_be_visible()
        assert "35" not in await t.inner_text("main")
        pub = await (await tctx.request.get(f"{BASE}/terms")).text()
        assert "يُحدَّد أجر الحصة" in pub and "35 ريال" not in pub and "<strong>35" not in pub
        step("pay rate hidden: public terms + pending teacher see no amounts")

        await t.goto(f"{BASE}/teacher/profile")
        await t.fill("#f-teams_link", TEAMS)
        await t.click("button[type=submit]:has-text('احفظي الملف')")
        await expect(t.get_by_text("تم حفظ ملفك")).to_be_visible()
        step("teacher saved Teams link")

        await t.goto(f"{BASE}/teacher/availability")
        for i in range(7):
            await t.locator("label", has_text=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][i]).first.click()
        await t.select_option("#start", "08:00")
        await t.select_option("#end", "23:00")
        await t.click("button:has-text('أضيفي الفترة')")
        await expect(t.get_by_text("تمت إضافة الفترة")).to_be_visible()
        step("teacher availability added (7 days, 8am–11pm)")
        await t.screenshot(path="/tmp/s_teacher_avail.png", full_page=True)

        # ---- Admin approves
        actx = await b.new_context(viewport={"width": 1280, "height": 900})
        a = await actx.new_page()
        await a.goto(f"{BASE}/login")
        await a.fill("#f-email", "admin@ghiras.test")
        await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]")
        await a.wait_for_url(f"{BASE}/admin")
        await a.goto(f"{BASE}/admin/teachers")
        await a.locator("details", has_text=TNAME).locator("button:has-text('اعتماد المعلمة')").click()
        await expect(a.locator("details", has_text=TNAME).get_by_text("معتمدة").first).to_be_visible()
        step("admin approved teacher")
        cv_link = a.locator("details", has_text=TNAME).locator("a:has-text('تحميل السيرة الذاتية')").first
        href = await cv_link.get_attribute("href")
        resp = await a.request.get(BASE + href)
        assert resp.status == 200 and (await resp.body()).startswith(b"%PDF"), resp.status
        CV_HREF = href
        step("owner downloads the teacher's CV")
        await t.goto(f"{BASE}/teacher/earnings")
        await expect(t.get_by_text("شروط الأجر (خاصة بك)")).to_be_visible()
        await expect(t.locator("strong", has_text="35 ريال")).to_be_visible()
        step("approved teacher sees her private pay terms")

        # ---- Configure Salla link for the plan (as admin would in /admin/plans)
        await a.goto(f"{BASE}/admin/plans")
        form = a.locator("section", has_text="باقة كل المواد")
        await form.locator("input[name=salla_url]").fill("https://example-salla.test/ghiras-all")
        await form.locator("input[name=salla_product_id]").fill("111")
        await form.locator("button:has-text('حفظ')").click()
        await expect(form.get_by_text("تم حفظ الباقة")).to_be_visible()
        step("admin set Salla link + product id")

        # ---- Parent signs up, adds student, subscribes
        pctx = await b.new_context(viewport={"width": 1280, "height": 900})
        await pctx.route("https://example-salla.test/**", lambda r: r.fulfill(status=200, body="<h1>Salla checkout (mock)</h1>", content_type="text/html"))
        pg = await pctx.new_page()
        await pg.goto(f"{BASE}/")
        line = "8 حصص + الحصة الأولى مجاناً = 9 حصص"
        await expect(pg.locator("#pricing-h").locator("xpath=ancestor::section[1]")).to_contain_text(line)
        faq = pg.locator("details", has_text="كم حصة في باقة كل المواد")
        await faq.locator("summary").click()
        await expect(faq).to_contain_text(line)
        await expect(pg.get_by_text("نموذج لتقرير حصة")).to_be_visible()
        await expect(pg.get_by_text("كيف نختار معلماتنا")).to_be_visible()
        step("landing: card and FAQ agree on 8+1=9; sample report + teacher selection shown")
        await pg.goto(f"{BASE}/register")
        await pg.fill("#f-full_name", "محمد القحطاني")
        await pg.fill("#f-email", P_EMAIL)
        await pg.fill("#f-phone", "0509876543")
        await pg.fill("#f-password", PW)
        await pg.check("input[name=consent]")
        await pg.click("button[type=submit]")
        await pg.wait_for_url(f"{BASE}/parent/welcome")
        step("parent registered → survey shown")
        await pg.click("button:has-text('صديق أو قريب')"); await pg.click("button:has-text('التالي')")
        await pg.click("button:has-text('سد الفجوات والتأسيس')"); await pg.click("button:has-text('التالي')")
        await pg.click("button:has-text('الرياضيات')"); await pg.click("button:has-text('أخرى')")
        await pg.fill("#other-needs", "الكسور تحديداً"); await pg.click("button:has-text('التالي')")
        await pg.click("button:has-text('فهم أعمق بدل الحفظ')"); await pg.click("button:has-text('إنهاء')")
        await pg.wait_for_url(f"{BASE}/parent?welcome=1")
        assert await pg.locator("text=أخبرنا عن هدفك").count() == 0
        step("survey saved, dashboard nudge gone")

        await pg.goto(f"{BASE}/parent/students")
        await pg.locator("section", has_text="إضافة طالب").locator("#f-full_name").fill("سارة")
        await pg.locator("section", has_text="إضافة طالب").locator("select[name=grade]").select_option("5")
        await pg.locator("section", has_text="إضافة طالب").locator("textarea").fill("تحتاج تأسيس في الكسور")
        await pg.click("button:has-text('أضف الطالب')")
        await expect(pg.get_by_text("تمت إضافة سارة")).to_be_visible()
        step("student added")

        await pg.goto(f"{BASE}/parent/subscribe?plan=ALL_SUBJECTS")
        await pg.screenshot(path="/tmp/s_subscribe.png", full_page=True)
        await pg.click("button:has-text('انتقل للدفع')")
        await pg.wait_for_url("https://example-salla.test/ghiras-all")
        step("parent redirected to Salla")

        # ---- Salla webhook (signed)
        payload = {"event": "order.created", "merchant": 1, "data": {
            "id": 98765000 + R, "reference_id": 5555, "status": {"slug": "under_review"},
            "customer": {"email": P_EMAIL.upper(), "mobile": "509876543", "mobile_code": "+966"},
            "amounts": {"total": {"amount": 599}}, "items": [{"product": {"id": 111}, "sku": ""}]}}
        body = json.dumps(payload).encode()
        bad = urllib.request.Request(f"{BASE}/api/webhooks/salla", data=body, headers={"x-salla-signature": "bad", "content-type": "application/json"})
        try:
            urllib.request.urlopen(bad); raise SystemExit("bad signature accepted!")
        except urllib.error.HTTPError as e:
            assert e.code == 401
        step("webhook with bad signature rejected (401)")
        sig = hmac.new(b"dev-salla-secret", body, hashlib.sha256).hexdigest()
        req = urllib.request.Request(f"{BASE}/api/webhooks/salla", data=body, headers={"x-salla-signature": sig, "content-type": "application/json"})
        res = json.loads(urllib.request.urlopen(req).read())
        assert res["result"] == "matched", res
        res2 = json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/webhooks/salla", data=body, headers={"x-salla-signature": sig})).read())
        assert res2["result"] == "ignored", res2
        step("signed webhook matched & activated; replay ignored (idempotent)")

        await pg.goto(f"{BASE}/parent")
        await expect(pg.get_by_text("9 حصص متبقية").or_(pg.get_by_text("من 9 حصص متبقية"))).to_be_visible()
        await pg.screenshot(path="/tmp/s_parent_home.png", full_page=True)
        step("parent sees active subscription with 9 sessions")

        # ---- Book: time first, then teacher
        await pg.goto(f"{BASE}/parent/book")
        await pg.click("a:has-text('الرياضيات')")
        await pg.locator("a[href*='date=']").nth(1).click()
        await pg.wait_for_load_state("networkidle")
        await pg.locator("a[href*='minute=']").first.click()
        await pg.wait_for_load_state("networkidle")
        await expect(pg.get_by_text(TNAME)).to_be_visible()
        await pg.locator("label", has_text=TNAME).click()
        await pg.fill("#description", "مراجعة الكسور العشرية وحل واجب صفحة 42")
        await pg.screenshot(path="/tmp/s_book.png", full_page=True)
        await pg.click("button:has-text('أكّد الحجز')")
        await pg.wait_for_url("**/parent/sessions/*?booked=1")
        await expect(pg.get_by_text("تم الحجز")).to_be_visible()
        href = await pg.locator(f"a[href='{TEAMS}']").first.get_attribute("href")
        assert href == TEAMS
        await pg.screenshot(path="/tmp/s_session_parent.png", full_page=True)
        step("booking created; session page shows Teams link + description")

        # ---- Same slot again must fail (student overlap) — try via second booking of same time
        booked_url = pg.url
        bid = booked_url.split("/sessions/")[1].split("?")[0]
        r = sql(f"""INSERT INTO bookings (subscription_id,parent_id,student_id,teacher_id,subject,track,starts_at,ends_at,teams_link,created_by)
                    SELECT subscription_id,parent_id,student_id,teacher_id,subject,track,starts_at + interval '30 minutes',ends_at + interval '30 minutes',teams_link,created_by FROM bookings WHERE id='{bid}'""")
        assert "bookings_no_teacher_overlap" in r.stderr or "bookings_no_student_overlap" in r.stderr, r.stderr
        step("overlapping booking rejected by DB constraint")
        r = sql(f"DELETE FROM bookings WHERE id='{bid}'")
        assert "GHIRAS_PROTECTED" in r.stderr
        step("booking cannot be deleted")

        # ---- Teacher sees it with student notes
        await t.goto(f"{BASE}/teacher/sessions/{bid}")
        await expect(t.get_by_text("تحتاج تأسيس في الكسور")).to_be_visible()
        await expect(t.get_by_text("مراجعة الكسور العشرية")).to_be_visible()
        await expect(t.get_by_text("هدف الأسرة من غِراس")).to_be_visible()
        await expect(t.get_by_text("الكسور تحديداً")).to_be_visible()
        await t.screenshot(path="/tmp/s_session_teacher.png", full_page=True)
        step("teacher sees session, description, encrypted student notes (decrypted for her)")

        # ---- Isolation: another parent can't see this session
        octx = await b.new_context()
        o = await octx.new_page()
        await o.goto(f"{BASE}/register")
        await o.fill("#f-full_name", "ولي أمر آخر"); await o.fill("#f-email", f"other{R}@test.sa")
        await o.fill("#f-phone", "0501112223"); await o.fill("#f-password", PW); await o.check("input[name=consent]")
        await o.click("button[type=submit]"); await o.wait_for_url("**/parent**")
        resp = await o.goto(f"{BASE}/parent/sessions/{bid}")
        assert resp.status == 404, resp.status
        resp = await o.goto(f"{BASE}/admin")
        assert "/parent" in o.url
        r404 = await o.request.get(BASE + CV_HREF)
        assert r404.status == 404, r404.status
        step("other parent gets 404 on foreign session; blocked from /admin; can't download CVs")

        # ---- Admin screens
        for path, name in [("/admin", "admin_home"), ("/admin/subscriptions", "admin_subs"), ("/admin/payments?all=1", "admin_pay"), ("/admin/audit", "admin_audit")]:
            await a.goto(BASE + path); await a.screenshot(path=f"/tmp/s_{name}.png", full_page=True)
        step("admin screens rendered")


        # ================= OWNER PORTAL =================
        # A past completed session for the teacher → should count as payable (35 SAR)
        tid = sql(f"SELECT id FROM users WHERE email='{T_EMAIL}'").stdout.strip()
        r = sql(f"""INSERT INTO bookings (subscription_id,parent_id,student_id,teacher_id,subject,track,starts_at,ends_at,teams_link,created_by,status)
                    SELECT subscription_id,parent_id,student_id,teacher_id,subject,track, now() - interval '3 hours', now() - interval '2 hours', teams_link, created_by, 'completed'
                    FROM bookings WHERE id='{bid}'""")
        assert r.returncode == 0, r.stderr
        past = sql(f"SELECT id FROM bookings WHERE teacher_id='{tid}' AND starts_at < now() ORDER BY created_at DESC LIMIT 1").stdout.strip()

        # Teacher writes the structured report; parent sees it
        await t.goto(f"{BASE}/teacher/sessions/{past}")
        await t.click("label:has-text('فهم جيد ويحتاج تثبيتاً')")
        await t.fill("#r-covered", "جمع الكسور مختلفة المقامات")
        await t.fill("#r-strengths", "سريعة في توحيد المقامات")
        await t.fill("#r-homework", "خمس مسائل من صفحة 42")
        await t.click("button:has-text('احفظي')")
        await expect(t.get_by_text("ووصل التقرير لولي الأمر")).to_be_visible()
        assert sql(f"SELECT report->>'homework' FROM bookings WHERE id='{past}'").stdout.strip() == "خمس مسائل من صفحة 42"
        assert sql(f"SELECT report ? 'struggles' FROM bookings WHERE id='{past}'").stdout.strip() == "f"  # empty fields not stored
        await pg.goto(f"{BASE}/parent/sessions/{past}")
        await expect(pg.get_by_text("تقرير الحصة")).to_be_visible()
        await expect(pg.get_by_text("سريعة في توحيد المقامات")).to_be_visible()
        await expect(pg.get_by_text("فهم جيد ويحتاج تثبيتاً")).to_be_visible()
        await pg.screenshot(path="/tmp/s_parent_report.png", full_page=True)
        step("teacher's structured report reaches the parent (empty fields skipped)")

        await a.goto(f"{BASE}/admin")
        await expect(a.get_by_text("لوحة المالك").first).to_be_visible()
        await expect(a.get_by_text("إيراد الشهر")).to_be_visible()
        await a.screenshot(path="/tmp/s_owner_home.png", full_page=True)
        step("owner dashboard renders money, subscribers, activation")

        await a.goto(f"{BASE}/admin/teachers/stats")
        row = a.locator("tr", has_text=TNAME).first
        await expect(row).to_contain_text("35")
        await a.screenshot(path="/tmp/s_owner_teachers.png", full_page=True)
        step("teacher stats: completed session counted, 35 SAR owed")

        await a.goto(f"{BASE}/admin/teachers/{tid}")
        await a.click("button:has-text('تسجيل الدفع')")
        await expect(a.locator("span.chip", has_text="مدفوع").first).to_be_visible()
        bal = sql(f"SELECT coalesce(sum(amount_sar),0) FROM payouts WHERE teacher_id='{tid}'").stdout.strip()
        assert float(bal) == 35.0, bal
        step("payout recorded from teacher page; balance cleared")

        C_EMAIL = f"client{R}@test.sa"
        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", f"أم فيصل {R}"); await a.fill("#f-email", C_EMAIL); await a.fill("#f-phone", "0533334444")
        await a.fill("#f-student_name", "فيصل"); await a.select_option("#grade", "7")
        await a.select_option("#plan", "SINGLE_SUBJECT")
        await a.select_option("#subject", "math")
        await a.fill("#f-payment_note", "تحويل بنكي - اختبار")
        await a.click("button:has-text('إنشاء الحساب')")
        msg = a.get_by_role("status")
        await expect(msg).to_contain_text("كلمة المرور المؤقتة")
        text = await msg.inner_text()
        temp = text.split("كلمة المرور المؤقتة:")[1].split("·")[0].strip()
        step("owner created client account + active subscription")

        cctx = await b.new_context(); cp = await cctx.new_page()
        await cp.goto(f"{BASE}/login"); await cp.fill("#f-email", C_EMAIL); await cp.fill("#f-password", temp); await cp.click("button[type=submit]")
        await cp.wait_for_url(f"{BASE}/parent")
        await expect(cp.get_by_text("فيصل").first).to_be_visible()
        await expect(cp.get_by_text("8 حصص متبقية").or_(cp.get_by_text("من 8 حصص متبقية"))).to_be_visible()
        step("client logs in with temp password and sees active subscription")

        await a.goto(f"{BASE}/admin/subscribers")
        await expect(a.get_by_text(f"أم فيصل {R}")).to_be_visible()
        await a.screenshot(path="/tmp/s_owner_subs.png", full_page=True)
        step("subscribers page lists the new client")

        await a.goto(f"{BASE}/admin/insights")
        await expect(a.get_by_text("أي قناة تجلب مشتركين فعلاً؟")).to_be_visible()
        await expect(a.get_by_role("cell", name="محمد القحطاني").first).to_be_visible()
        await a.screenshot(path="/tmp/s_insights.png", full_page=True)
        step("owner sees survey insights + conversion by channel")

        audit = sql("SELECT count(*) FROM audit_log WHERE action IN ('admin.create_client','payout.record')").stdout.strip()
        assert int(audit) >= 2
        step("owner actions written to the audit log")


        # ================= ACCOUNTING =================
        inc = sql(f"SELECT count(*) FROM ledger_entries l JOIN subscriptions s ON s.id::text = l.source_id WHERE l.source='subscription' AND s.salla_order_id='{98765000 + R}'").stdout.strip()
        assert inc == "1", inc
        exp = sql(f"SELECT count(*) FROM ledger_entries WHERE source='teacher_payout' AND description LIKE '%{TNAME}%'").stdout.strip()
        assert int(exp) >= 1
        step("Salla payment auto-posted as income; teacher payout auto-posted as expense")

        await a.goto(f"{BASE}/admin/accounting")
        fees = a.locator("section", has_text="ربط سلة")
        await fees.locator("#pct").fill("2.5")
        await fees.locator("button:has-text('حفظ')").click()
        await expect(fees.get_by_text("تم الحفظ")).to_be_visible()

        await a.goto(f"{BASE}/admin/clients/new")
        await a.fill("#f-full_name", "عميل سلة"); await a.fill("#f-email", f"feecheck{R}@test.sa"); await a.fill("#f-phone", "0544445555")
        await a.fill("#f-student_name", "ريم"); await a.select_option("#grade", "3")
        await a.select_option("#plan", "ALL_SUBJECTS")
        await a.fill("#f-salla_order_id", f"FEE{R}")
        await a.click("button:has-text('إنشاء الحساب')")
        await expect(a.get_by_role("status")).to_contain_text("مفعّل")
        fee = sql(f"SELECT amount_sar FROM ledger_entries WHERE source='salla_fee' AND salla_order_id='FEE{R}'").stdout.strip()
        assert abs(float(fee) - 14.98) < 0.01, fee
        step("Salla fee 2.5% auto-posted as expense (599 → 14.98)")

        await a.goto(f"{BASE}/admin/accounting")
        form = a.locator("section", has_text="قيد جديد")
        await form.locator("select#category").select_option("استضافة وسيرفرات (Railway)")
        await form.locator("#f-amount_sar").fill("20")
        await form.locator("#f-description").fill(f"اشتراك Railway {R}")
        await form.locator("button[type=submit]").click()
        await expect(form.get_by_role("status")).to_contain_text("تم تسجيل المصروف")
        await form.locator("select#category").select_option("__custom")
        await form.locator("#f-custom_category").fill("ضيافة")
        await form.locator("#f-amount_sar").fill("15")
        await form.locator("#f-description").fill(f"قهوة اجتماع {R}")
        await form.locator("button[type=submit]").click()
        await expect(form.get_by_role("status")).to_contain_text("ضيافة")
        step("manual expenses added (preset + custom category)")

        await a.goto(f"{BASE}/admin/accounting")
        row = a.locator("tr", has_text=f"قهوة اجتماع {R}")
        await row.locator("summary:has-text('إلغاء')").click()
        await row.locator("input[name=reason]").fill("مسجل بالغلط")
        await row.locator("button:has-text('تأكيد الإلغاء')").click()
        await expect(row).to_have_count(0)
        st = sql(f"SELECT voided_at IS NOT NULL, void_reason FROM ledger_entries WHERE description = 'قهوة اجتماع {R}'").stdout.strip()
        assert st.startswith("t|مسجل بالغلط"), st
        r = sql(f"DELETE FROM ledger_entries WHERE description = 'قهوة اجتماع {R}'")
        assert "GHIRAS_PROTECTED" in r.stderr
        r = sql(f"UPDATE ledger_entries SET amount_sar = 1 WHERE description = 'اشتراك Railway {R}'")
        assert "GHIRAS_PROTECTED" in r.stderr
        step("entry voided with reason; ledger rows can't be deleted or edited")

        await a.screenshot(path="/tmp/s_accounting.png", full_page=True)
        async with a.expect_download() as dl:
            await a.evaluate("() => { const l = document.querySelector('a[href^=\"/admin/accounting/export\"]'); l.click(); }")
        d = await dl.value
        path = await d.path()
        content = open(path, encoding="utf-8-sig").read()
        assert "اشتراك Railway" in content and "ملغى" in content, content[:200]
        step("CSV export downloads with Arabic + voided rows marked")

        # ---- Login lockout
        lctx = await b.new_context(); l = await lctx.new_page()
        for i in range(5):
            await l.goto(f"{BASE}/login"); await l.fill("#f-email", P_EMAIL); await l.fill("#f-password", "wrongpass1"); await l.click("button[type=submit]")
            await l.wait_for_selector("[role=alert]")
        await l.goto(f"{BASE}/login"); await l.fill("#f-email", P_EMAIL); await l.fill("#f-password", PW); await l.click("button[type=submit]")
        await expect(l.get_by_text("مقفل مؤقتاً")).to_be_visible()
        step("account locks after 5 wrong passwords")
        sql(f"UPDATE users SET locked_until = NULL WHERE email = '{P_EMAIL}'")

        await b.close()
        print("\nALL E2E CHECKS PASSED")

asyncio.run(main())
