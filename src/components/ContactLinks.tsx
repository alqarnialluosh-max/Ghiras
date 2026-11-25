import { site } from "@/config/site";

export const localPhone = (intl: string) => "0" + intl.slice(3);

/** Phone numbers with call + WhatsApp links, and the email. */
export function ContactLinks({ className = "" }: { className?: string }) {
  return (
    <ul className={`space-y-2 ${className}`}>
      {site.contact.phones.map((p) => (
        <li key={p} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={`tel:+${p}`} dir="ltr" className="font-medium hover:text-lav-700">{localPhone(p)}</a>
          <a href={`https://wa.me/${p}`} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-700 underline">واتساب</a>
        </li>
      ))}
      <li><a href={`mailto:${site.contact.email}`} dir="ltr" className="hover:text-lav-700">{site.contact.email}</a></li>
    </ul>
  );
}
