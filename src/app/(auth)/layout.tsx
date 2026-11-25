import { Logo } from "@/components/Logo";
import { Seedling } from "@/components/Seedling";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_.8fr]">
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
      <aside aria-hidden="true" className="hidden items-center justify-center bg-wash lg:flex">
        <div className="w-[300px] opacity-90"><Seedling /></div>
      </aside>
    </div>
  );
}
