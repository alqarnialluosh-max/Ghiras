import Image from "next/image";
import Link from "next/link";

/** Small leaf mark (used for icons/empty states). */
export function SproutMark({ size = 30 }: { size?: number }) {
  return <Image src="/icon.png" alt="" width={size} height={size} aria-hidden="true" />;
}

/** Official Ghiras wordmark (public/logo.png, 599×289). */
export function Logo({ href = "/", height = 42 }: { href?: string; height?: number }) {
  const width = Math.round((599 / 289) * height);
  return (
    <Link href={href} className="inline-flex items-center rounded-lg" aria-label="غِراس — الصفحة الرئيسية">
      <Image src="/logo.png" alt="غِراس" width={width} height={height} priority />
    </Link>
  );
}
