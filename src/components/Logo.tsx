import Link from "next/link";

export function SproutMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 29V14" stroke="#5b45b0" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M16 16C16 9 11 5 4 5c0 7 5 11 12 11Z" fill="#a994ee" />
      <path d="M16 13c0-6 4-9.5 11-9.5 0 6-4.5 9.5-11 9.5Z" fill="#8ed1f2" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-lg" aria-label="غِراس — الصفحة الرئيسية">
      <SproutMark />
      <span className="font-display text-[1.7rem] leading-none text-lav-700">غِراس</span>
    </Link>
  );
}
