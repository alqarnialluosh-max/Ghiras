"""Owner-only mode (RESEND_API_KEY without EMAIL_FROM): only owner alerts are sent, nobody is blocked."""
import asyncio, json, random, subprocess, time, urllib.request
from playwright.async_api import async_playwright, expect

BASE, MOCK = "http://localhost:3003", "http://127.0.0.1:4030"
R = random.randint(10000, 99999)
def step(m): print("✓", m, flush=True)
def sql(q): return subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "ghiras", "-tAc", q], capture_output=True, text=True).stdout.strip()
def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=json.dumps(data).encode() if data is not None else None, method="POST" if data is not None else "GET")
    return json.loads(urllib.request.urlopen(req).read())

async def main():
    mock("/_test/state", {"emails": [], "fail": None, "keys": {}})
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await (await b.new_context()).new_page()
        email = f"oo{R}@test.sa"
        await pg.goto(f"{BASE}/register")
        await pg.fill("#f-full_name", "ولي أمر تجربة"); await pg.fill("#f-email", email); await pg.fill("#f-phone", "0503334444")
        await pg.fill("#f-password", "Passw0rd123"); await pg.check("input[name=consent]"); await pg.click("button[type=submit]")
        await pg.wait_for_url("**/parent/welcome"); await pg.click("button:has-text('لاحقاً')"); await pg.wait_for_url("**/parent?welcome=1")
        await expect(pg.get_by_role("region", name="تأكيد البريد")).to_have_count(0)
        await pg.goto(f"{BASE}/parent/book"); await expect(pg.get_by_text("أكّد بريدك قبل الحجز")).to_have_count(0)
        step("parents aren't asked to verify (no domain yet) and aren't blocked")

        await pg.goto(f"{BASE}/forgot-password"); await pg.fill("#f-email", email); await pg.click("button[type=submit]")
        await expect(pg.get_by_text("راسلنا على واتساب")).to_be_visible()
        step("forgot-password falls back to WhatsApp")

        t = await (await b.new_context()).new_page()
        await t.goto(f"{BASE}/teachers/join")
        await t.fill("#f-full_name", f"معلمة تنبيه {R}"); await t.fill("#f-email", f"oot{R}@test.sa"); await t.fill("#f-phone", "0554445555")
        await t.fill("#f-password", "Passw0rd123"); await t.check("input[name=subjects][value=science]")
        await t.fill("#f-qualification", "بكالوريوس علوم"); await t.fill("#bio", "معلمة علوم لاختبار وضع تنبيهات المالك فقط.")
        await t.fill("#f-teams_link", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_OO%40thread.v2/0")
        await t.set_input_files("#cv", "tests/cv.pdf"); await t.check("input[name=consent]")
        await t.click("button[type=submit]"); await t.wait_for_url(f"{BASE}/teacher")
        for _ in range(30):
            sent = [m for m in mock("/_test/state")["emails"]]
            if sent: break
            time.sleep(0.4)
        assert len(sent) == 1 and sent[0]["to"] == ["owner-alerts@ghiras.test"] and sent[0]["from"] == "Ghiras <onboarding@resend.dev>", sent
        assert sql(f"SELECT status FROM email_outbox WHERE to_email='oot{R}@test.sa' AND template='teacher_received'") == "skipped"
        step("owner alert sent from Resend's test sender; teacher's own email skipped (needs a domain)")

        a = await (await b.new_context()).new_page()
        await a.goto(f"{BASE}/login"); await a.fill("#f-email", "admin@ghiras.test"); await a.fill("#f-password", "AdminPass12345")
        await a.click("button[type=submit]"); await a.wait_for_url("**/admin")
        await a.goto(f"{BASE}/admin/emails")
        await expect(a.get_by_text("مفعّل لتنبيهات المالك فقط")).to_be_visible()
        await a.fill("#to", "someone-else@test.sa"); await a.click("button:has-text('أرسل')")
        await expect(a.get_by_text("بدون دومين موثّق")).to_be_visible()
        await a.fill("#to", "owner-alerts@ghiras.test"); await a.click("button:has-text('أرسل')")
        await expect(a.get_by_text("أُرسلت الرسالة")).to_be_visible()
        await a.screenshot(path="/tmp/s_emails_owner.png", full_page=True)
        step("owner page explains the mode; test email only to the owner address")
        await b.close()
    print("\nALL OWNER-ONLY CHECKS PASSED")

asyncio.run(main())
