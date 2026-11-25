import { DashShell } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "لوحة المالك" },
  { href: "/admin/accounting", label: "المحاسبة" },
  { href: "/admin/subscribers", label: "المشتركين" },
  { href: "/admin/subscriptions", label: "الاشتراكات" },
  { href: "/admin/salla", label: "ربط سلة" },
  { href: "/admin/teams", label: "ربط تيمز" },
  { href: "/admin/payments", label: "مدفوعات سلة" },
  { href: "/admin/bookings", label: "الحصص" },
  { href: "/admin/teachers", label: "تفعيل المعلمات" },
  { href: "/admin/teachers/stats", label: "حصص ومستحقات المعلمات" },
  { href: "/admin/parents", label: "أولياء الأمور" },
  { href: "/admin/clients/new", label: "إنشاء حساب عميل" },
  { href: "/admin/payouts", label: "صرف الأجور" },
  { href: "/admin/plans", label: "الباقات" },
  { href: "/admin/audit", label: "السجل" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  return <DashShell user={user} nav={NAV}>{children}</DashShell>;
}
