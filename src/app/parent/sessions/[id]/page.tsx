import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/SessionDetail";
import { requireRole } from "@/lib/auth";
import { bookingById } from "@/lib/queries";

export const metadata = { title: "تفاصيل الحصة" };

export default async function ParentSession({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string }>;
}) {
  const user = await requireRole("parent");
  const { id } = await params;
  const { booked } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const b = await bookingById(id);
  if (!b || b.parent_id !== user.id) notFound(); // never reveal other families' sessions
  return (
    <>
      <Link href="/parent/sessions" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل الحصص</Link>
      {booked && <p role="status" className="alert alert-ok mb-6">تم الحجز. رابط Teams جاهز في هذه الصفحة وفي قائمة الحصص.</p>}
      <SessionDetail b={b} viewer="parent" />
    </>
  );
}
