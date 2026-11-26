import { requirePerm } from "@/lib/auth";
import { ledgerEntries } from "@/lib/accounting";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { income: "إيراد", expense: "مصروف" };
const SOURCE: Record<string, string> = { manual: "يدوي", subscription: "اشتراك", salla_fee: "رسوم سلة", teacher_payout: "أجر معلمة" };

function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // prevent spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const admin = await requirePerm("finance.view");
  const url = new URL(req.url);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : "2000-01-01";
  const to = re.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : "2100-01-01";
  const rows = await ledgerEntries({ from, to, includeVoided: true });
  const header = ["التاريخ", "النوع", "التصنيف", "المبلغ (ريال)", "الوصف", "المصدر", "طلب سلة", "أضافه", "الحالة", "سبب الإلغاء"];
  const lines = rows.map((r) => [
    r.entry_date, KIND[r.kind], r.category, Number(r.amount_sar).toFixed(2), r.description, SOURCE[r.source] ?? r.source,
    r.salla_order_id ?? "", r.created_by_name ?? "النظام", r.voided_at ? "ملغى" : "ساري", r.void_reason ?? "",
  ].map(cell).join(","));
  await audit("ledger.export", "ledger", null, admin.id, { from, to, rows: rows.length });
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghiras-ledger-${from}_${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
