import { DashShell } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/teacher", label: "الرئيسية" },
  { href: "/teacher/sessions", label: "حصصي" },
  { href: "/teacher/availability", label: "أوقاتي" },
  { href: "/teacher/profile", label: "ملفي" },
  { href: "/teacher/earnings", label: "مستحقاتي" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("teacher");
  return <DashShell user={user} nav={NAV}>{children}</DashShell>;
}
