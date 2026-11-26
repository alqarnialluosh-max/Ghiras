import "server-only";
import { q } from "./db";
import { site } from "@/config/site";

export type Plan = {
  code: string; name_ar: string; price_sar: string; sessions_count: number; bonus_sessions: number;
  weekly_limit: number | null; duration_days: number; all_subjects: boolean;
  salla_url: string | null; salla_product_id: string | null; active: boolean;
};

export async function getPlans(includeInactive = false): Promise<Plan[]> {
  const rows = await q<Plan>(
    `SELECT * FROM plans ${includeInactive ? "" : "WHERE active"} ORDER BY sort_order`,
  );
  return rows.map((p) => ({ ...p, salla_url: p.salla_url || site.sallaLinks[p.code] || null }));
}

export function planPrice(p: Plan) {
  return Number(p.price_sar).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** One wording for session counts, used on the card, the FAQ and the subscribe page so they never disagree. */
export function planSessionsLine(p: Plan) {
  if (p.code === "SINGLE_SESSION") return `حصة واحدة مدتها ساعة، تُحجز خلال ${p.duration_days} يوماً`;
  const base = `${p.sessions_count} حصص`;
  const total = p.sessions_count + p.bonus_sessions;
  const weekly = p.weekly_limit ? `، بمعدل ${p.weekly_limit === 2 ? "حصتين" : `${p.weekly_limit} حصص`} أسبوعياً` : "";
  return p.bonus_sessions > 0
    ? `${base} + الحصة الأولى مجاناً = ${total} حصص خلال ${p.duration_days} يوماً${weekly}`
    : `${base} خلال ${p.duration_days} يوماً${weekly}`;
}
