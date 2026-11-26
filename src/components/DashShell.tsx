import Link from "next/link";
import { roleLabel } from "@/lib/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import type { SessionUser } from "@/lib/auth";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";



export function DashShell({ user, nav, children }: {
  user: SessionUser; nav: { href: string; label: string }[]; children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-wash/60">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Logo href="/" />
            {nav.length <= 6 && <NavLinks items={nav} className="hidden md:flex" />}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-[.92rem] font-medium">{user.full_name}</p>
              <p className="text-xs text-muted">{roleLabel(user)}</p>
            </div>
            <Link href="/account" className="btn btn-ghost btn-sm hidden sm:inline-flex">حسابي</Link>
            <form action={logoutAction}>
              <button className="btn btn-ghost btn-sm" type="submit">خروج</button>
            </form>
          </div>
        </div>
        <div className={`wrap overflow-x-auto pb-2 ${nav.length <= 6 ? "md:hidden" : "border-t border-line pt-2"}`}>
          <NavLinks items={nav} className="flex" />
        </div>
      </header>
      <main id="main" className="wrap py-8 md:py-10 [&_h2]:font-sans [&_h2]:font-semibold">{children}</main>
      <footer className="wrap pb-8 text-center text-sm text-muted">
        <Link href="/privacy" className="hover:underline">سياسة الخصوصية</Link>
      </footer>
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}
