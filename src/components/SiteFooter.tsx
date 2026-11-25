import Link from "next/link";
import { site } from "@/config/site";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-wash">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm space-y-3">
          <Logo />
          <p className="text-muted">{site.tagline}، بإشراف {site.supervisor.name}.</p>
        </div>
        <div>
          <h2 className="mb-3 text-lg">غِراس</h2>
          <ul className="space-y-2 text-muted">
            <li><a href="/#pricing" className="hover:text-lav-700">الباقات</a></li>
            <li><Link href="/teachers/join" className="hover:text-lav-700">انضمي لفريق المعلمات</Link></li>
            <li><Link href="/login" className="hover:text-lav-700">تسجيل الدخول</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg">الخصوصية والتواصل</h2>
          <ul className="space-y-2 text-muted">
            <li><Link href="/privacy" className="hover:text-lav-700">سياسة الخصوصية</Link></li>
            <li><Link href="/terms" className="hover:text-lav-700">الشروط والأحكام</Link></li>
            {site.contact.whatsapp && (
              <li><a href={`https://wa.me/${site.contact.whatsapp}`} className="hover:text-lav-700" rel="noopener">واتساب</a></li>
            )}
            {site.contact.email && <li><a href={`mailto:${site.contact.email}`} className="hover:text-lav-700">{site.contact.email}</a></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-sm text-muted">
        © {new Date().getFullYear()} غِراس. جميع الحقوق محفوظة.
      </div>
    </footer>
  );
}
