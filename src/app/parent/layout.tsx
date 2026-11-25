import { DashShell } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/parent", label: "الرئيسية" },
  { href: "/parent/book", label: "احجز حصة" },
  { href: "/parent/sessions", label: "الحصص" },
  { href: "/parent/students", label: "أبنائي" },
  { href: "/parent/subscribe", label: "اشتراك جديد" },
];

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("parent");
  return <DashShell user={user} nav={NAV}>{children}</DashShell>;
}
