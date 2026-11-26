import { DashShell } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Each item is shown only to people holding its permission (the owner sees everything). */
const NAV: { href: string; label: string; perm?: Permission; ownerOnly?: boolean }[] = [
  { href: "/admin", label: "الرئيسية" },
  { href: "/admin/tickets", label: "الدعم الفني", perm: "tickets.handle" },
  { href: "/admin/approvals", label: "الاعتمادات" },
  { href: "/admin/requests", label: "طلبات الحجز", perm: "requests.manage" },
  { href: "/admin/bookings", label: "الحصص", perm: "sessions.view" },
  { href: "/admin/accounting", label: "المحاسبة", perm: "finance.view" },
  { href: "/admin/subscribers", label: "المشتركين", perm: "parents.view" },
  { href: "/admin/parents", label: "أولياء الأمور", perm: "parents.view" },
  { href: "/admin/clients/new", label: "إنشاء حساب عميل", perm: "parents.manage" },
  { href: "/admin/subscriptions", label: "الاشتراكات", perm: "subscriptions.manage" },
  { href: "/admin/payments", label: "مدفوعات سلة", perm: "subscriptions.manage" },
  { href: "/admin/teachers", label: "المعلمات", perm: "teachers.view" },
  { href: "/admin/teachers/stats", label: "حصص ومستحقات المعلمات", perm: "finance.view" },
  { href: "/admin/payouts", label: "صرف الأجور", perm: "finance.view" },
  { href: "/admin/insights", label: "استبيان التسجيل", perm: "insights.view" },
  { href: "/admin/staff", label: "فريق العمل", ownerOnly: true },
  { href: "/admin/plans", label: "الباقات", perm: "settings.manage" },
  { href: "/admin/salla", label: "ربط سلة", perm: "settings.manage" },
  { href: "/admin/teams", label: "ربط تيمز", perm: "settings.manage" },
  { href: "/admin/emails", label: "البريد", perm: "settings.manage" },
  { href: "/admin/audit", label: "السجل", perm: "audit.view" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin", "staff");
  const nav = NAV.filter((n) => (n.ownerOnly ? user.role === "admin" : !n.perm || can(user, n.perm)))
    .map(({ href, label }) => ({ href, label }));
  return <DashShell user={user} nav={nav}>{children}</DashShell>;
}
