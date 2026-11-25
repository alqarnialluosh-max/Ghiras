"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-3xl">صار خطأ غير متوقع</h1>
      <p className="text-muted">ما ضاع شي من بياناتك. جرّب مرة ثانية، وإذا تكرر تواصل مع الإدارة.</p>
      <div className="flex gap-2">
        <button onClick={reset} className="btn btn-primary">حاول مرة ثانية</button>
        <Link href="/" className="btn btn-ghost">الرئيسية</Link>
      </div>
    </main>
  );
}
