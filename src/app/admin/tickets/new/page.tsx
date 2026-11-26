import Link from "next/link";
import { PageTitle } from "@/components/DashShell";
import { requirePerm } from "@/lib/auth";
import { NewTicketForm } from "../TicketForms";

export const metadata = { title: "تذكرة جديدة" };

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ requester?: string }> }) {
  await requirePerm("tickets.handle");
  const { requester } = await searchParams;
  return (
    <>
      <Link href="/admin/tickets" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل التذاكر</Link>
      <PageTitle title="تذكرة دعم جديدة" sub="لأي مشكلة تقنية أو تشغيلية تواجه عميلاً أو معلمة" />
      <div className="panel max-w-3xl p-6"><NewTicketForm requester={requester} /></div>
    </>
  );
}
