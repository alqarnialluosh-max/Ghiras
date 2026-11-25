import Link from "next/link";
import { site } from "@/config/site";
import { Logo } from "./Logo";
import { ContactLinks } from "./ContactLinks";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-wash">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="max-w-sm space-y-3">
          <Logo height={56} />
          <p className="text-muted">{site.tagline}، بإشراف {site.supervisor.name}.</p>
        </div>
        <div>
          <h2 className="mb-3 text-lg">غِراس</h2>
          <ul className="space-y-2 text-muted">
            <li><Link href="/#pricing" className="hover:text-lav-700">الباقات</Link></li>
            <li><a href={site.sallaStore} target="_blank" rel="noopener noreferrer" className="hover:text-lav-700">متجرنا على سلة</a></li>
            <li><Link href="/teachers/join" className="hover:text-lav-700">انضمي لفريق المعلمات</Link></li>
            <li><Link href="/login" className="hover:text-lav-700">تسجيل الدخول</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg">الخصوصية</h2>
          <ul className="space-y-2 text-muted">
            <li><Link href="/privacy" className="hover:text-lav-700">سياسة الخصوصية</Link></li>
            <li><Link href="/terms" className="hover:text-lav-700">الشروط والأحكام</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg">تواصل معنا</h2>
          <ContactLinks className="text-muted" />
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-sm text-muted">
        © {new Date().getFullYear()} غِراس. جميع الحقوق محفوظة.
      </div>
    </footer>
  );
}
