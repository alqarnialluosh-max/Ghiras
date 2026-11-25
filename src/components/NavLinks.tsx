"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items, className = "" }: { items: { href: string; label: string }[]; className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label="أقسام اللوحة" className={`items-center gap-1 ${className}`}>
      {items.map((i) => {
        const active = path === i.href || (i.href.split("/").length > 2 && path.startsWith(i.href));
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[.93rem] transition-colors ${
              active ? "bg-lav-100 font-medium text-lav-700" : "text-muted hover:text-ink"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
