import "server-only";
import type { PoolClient } from "pg";
import { one, q } from "./db";

export const INCOME_CATEGORIES = ["اشتراكات", "حصص فردية", "رعايات وشراكات", "إيرادات أخرى"];
export const EXPENSE_CATEGORIES = [
  "أجور المعلمات",
  "رسوم سلة والدفع",
  "تطوير الموقع",
  "استضافة وسيرفرات (Railway)",
  "أدوات الذكاء الاصطناعي والبرامج",
  "إنترنت واتصالات",
  "أجهزة ومعدات للمعلمات",
  "مشتريات ومستلزمات",
  "تسويق وإعلانات",
  "تصميم ومحتوى",
  "رواتب وإدارة",
  "رسوم حكومية وتراخيص",
  "مصروفات أخرى",
];

type Runner = Pick<PoolClient, "query">;

export async function getSetting(key: string, fallback = "0") {
  const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  return row?.value ?? fallback;
}

/**
 * Posts the income for an activated subscription (and the estimated Salla fee when paid via Salla).
 * Idempotent: unique (source, source_id) — calling twice never double-posts.
 */
export async function postSubscriptionIncome(c: Runner, subId: string) {
  const { rows } = await c.query<{ price_sar: string; reference: string; plan_name: string; salla_order_id: string | null;
    activated_by: string | null; day: string; plan_code: string }>(
    `SELECT s.price_sar, s.reference, p.name_ar plan_name, s.salla_order_id, s.activated_by, s.plan_code,
            to_char((s.starts_at AT TIME ZONE 'Asia/Riyadh')::date, 'YYYY-MM-DD') AS day
       FROM subscriptions s JOIN plans p ON p.code = s.plan_code WHERE s.id = $1 AND s.starts_at IS NOT NULL`, [subId]);
  const s = rows[0];
  if (!s || Number(s.price_sar) <= 0) return;
  await c.query(
    `INSERT INTO ledger_entries (kind, category, amount_sar, entry_date, description, source, source_id, salla_order_id, created_by)
     VALUES ('income', $1, $2, $3, $4, 'subscription', $5, $6, $7)
     ON CONFLICT (source, source_id) WHERE source <> 'manual' DO NOTHING`,
    [s.plan_code === "SINGLE_SESSION" ? "حصص فردية" : "اشتراكات", s.price_sar, s.day,
     `${s.plan_name} — ${s.reference}${s.salla_order_id ? ` · طلب سلة ${s.salla_order_id}` : ""}`,
     subId, s.salla_order_id, s.activated_by],
  );

  if (!s.salla_order_id) return; // bank transfer / cash → no Salla fee
  const { rows: st } = await c.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('salla_fee_percent','salla_fee_fixed_sar')`);
  const pct = Number(st.find((r) => r.key === "salla_fee_percent")?.value ?? 0);
  const fixed = Number(st.find((r) => r.key === "salla_fee_fixed_sar")?.value ?? 0);
  const fee = Math.round((Number(s.price_sar) * pct / 100 + fixed) * 100) / 100;
  if (fee <= 0) return;
  await c.query(
    `INSERT INTO ledger_entries (kind, category, amount_sar, entry_date, description, source, source_id, salla_order_id)
     VALUES ('expense', 'رسوم سلة والدفع', $1, $2, $3, 'salla_fee', $4, $5)
     ON CONFLICT (source, source_id) WHERE source <> 'manual' DO NOTHING`,
    [fee, s.day, `رسوم دفع تقديرية (${pct}%${fixed ? ` + ${fixed} ﷼` : ""}) — ${s.reference}`, subId, s.salla_order_id],
  );
}

export async function postPayoutExpense(c: Runner, payoutId: string) {
  await c.query(
    `INSERT INTO ledger_entries (kind, category, amount_sar, entry_date, description, source, source_id, created_by)
     SELECT 'expense', 'أجور المعلمات', po.amount_sar, (po.paid_at AT TIME ZONE 'Asia/Riyadh')::date,
            'أجر ' || u.full_name || ' — ' || po.sessions_count || ' حصة (' || to_char(po.period_start, 'YYYY-MM') || ')',
            'teacher_payout', po.id::text, po.paid_by
       FROM payouts po JOIN users u ON u.id = po.teacher_id WHERE po.id = $1 AND po.amount_sar > 0
     ON CONFLICT (source, source_id) WHERE source <> 'manual' DO NOTHING`, [payoutId]);
}

export type LedgerRow = {
  id: string; kind: "income" | "expense"; category: string; amount_sar: string; entry_date: string; description: string;
  source: string; salla_order_id: string | null; created_at: Date; created_by_name: string | null;
  voided_at: Date | null; void_reason: string | null; voided_by_name: string | null;
};

export function ledgerEntries(f: { from: string; to: string; kind?: string; category?: string; includeVoided?: boolean }) {
  const params: unknown[] = [f.from, f.to];
  const where = ["l.entry_date BETWEEN $1::date AND $2::date"];
  if (!f.includeVoided) where.push("l.voided_at IS NULL");
  if (f.kind) { params.push(f.kind); where.push(`l.kind = $${params.length}::ledger_kind`); }
  if (f.category) { params.push(f.category); where.push(`l.category = $${params.length}`); }
  return q<LedgerRow>(`
    SELECT l.id, l.kind, l.category, l.amount_sar, to_char(l.entry_date, 'YYYY-MM-DD') entry_date, l.description, l.source,
           l.salla_order_id, l.created_at, cu.full_name created_by_name, l.voided_at, l.void_reason, vu.full_name voided_by_name
      FROM ledger_entries l LEFT JOIN users cu ON cu.id = l.created_by LEFT JOIN users vu ON vu.id = l.voided_by
     WHERE ${where.join(" AND ")}
     ORDER BY l.entry_date DESC, l.created_at DESC LIMIT 2000`, params);
}

export function categoryTotals(from: string, to: string) {
  return q<{ kind: "income" | "expense"; category: string; total: string; n: string }>(`
    SELECT kind, category, sum(amount_sar) total, count(*) n FROM ledger_entries
     WHERE voided_at IS NULL AND entry_date BETWEEN $1::date AND $2::date
     GROUP BY kind, category ORDER BY kind, sum(amount_sar) DESC`, [from, to]);
}

export function monthlyPnL(months = 12) {
  return q<{ month: string; income: string; expense: string }>(`
    WITH m AS (SELECT generate_series(date_trunc('month', (now() AT TIME ZONE 'Asia/Riyadh')) - make_interval(months => $1 - 1),
                                       date_trunc('month', (now() AT TIME ZONE 'Asia/Riyadh')), interval '1 month')::date AS month)
    SELECT to_char(m.month, 'YYYY-MM') AS month,
           coalesce(sum(l.amount_sar) FILTER (WHERE l.kind = 'income'), 0) AS income,
           coalesce(sum(l.amount_sar) FILTER (WHERE l.kind = 'expense'), 0) AS expense
      FROM m LEFT JOIN ledger_entries l ON l.voided_at IS NULL AND date_trunc('month', l.entry_date)::date = m.month
     GROUP BY m.month ORDER BY m.month DESC`, [months]);
}
