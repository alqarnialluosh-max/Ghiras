"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page every few seconds (used while waiting for Salla to confirm a payment). Stops after `maxMinutes`. */
export function AutoRefresh({ seconds = 10, maxMinutes = 30 }: { seconds?: number; maxMinutes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - started > maxMinutes * 60_000) return clearInterval(id);
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, maxMinutes]);
  return null;
}
