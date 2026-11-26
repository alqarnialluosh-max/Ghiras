import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { BOOKING_STATUS } from "@/lib/domain";
import { allBookings } from "@/lib/queries";
import { addDaysKey, riyadhDateKey, riyadhToUtc } from "@/lib/time";

export const metadata = { title: "الحصص" };

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string }> }) {
  await requirePerm("sessions.view");
  const sp = await searchParams;
  const today = riyadhDateKey(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addDaysKey(today, -7);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : addDaysKey(today, 14);
  const status = sp.status && BOOKING_STATUS[sp.status] ? sp.status : undefined;
  const rows = await allBookings({ from: riyadhToUtc(from, 0), to: riyadhToUtc(addDaysKey(to, 1), 0), status });
  return (
    <>
      <PageTitle title="الحصص" sub="جميع الحصص محفوظة. لا تُحذف الحصة، وإنما تتغير حالتها أو تُعاد جدولتها مع الاحتفاظ بالأصل." />
      <form className="panel mb-6 grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
        <div className="field"><label htmlFor="from">من</label><input id="from" type="date" name="from" defaultValue={from} className="input" /></div>
        <div className="field"><label htmlFor="to">إلى</label><input id="to" type="date" name="to" defaultValue={to} className="input" /></div>
        <div className="field"><label htmlFor="status">الحالة</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input">
            <option value="">الكل</option>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <button className="btn btn-primary">عرض</button>
      </form>
      <p className="mb-3 text-sm text-muted">{rows.length} حصة · <Link href="/admin/bookings" className="underline">إعادة الضبط</Link></p>
      {rows.length === 0 ? <Empty title="لا توجد حصص في هذه الفترة" /> :
        <div className="space-y-3">{rows.map((b) => <SessionCard key={b.id} b={b} viewer="admin" />)}</div>}
    </>
  );
}
