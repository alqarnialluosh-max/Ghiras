import { DashShell } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "نظرة عامة" },
  { href: "/admin/subscriptions", label: "الاشتراكات" },
  { href: "/admin/payments", label: "مدفوعات سلة" },
  { href: "/admin/bookings", label: "الحصص" },
  { href: "/admin/teachers", label: "المعلمات" },
  { href: "/admin/parents", label: "أولياء الأمور" },
  { href: "/admin/payouts", label: "أجور المعلمات" },
  { href: "/admin/plans", label: "الباقات" },
  { href: "/admin/audit", label: "السجل" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  return <DashShell user={user} nav={NAV}>{children}</DashShell>;
}
