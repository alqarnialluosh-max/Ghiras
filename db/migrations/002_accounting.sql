-- =====================================================================
--  غِراس — Accounting ledger (income & expenses)
--  * Every entry is permanent. Mistakes are voided (with reason), never deleted.
--  * Automatic entries are linked to their source (subscription / payout) and
--    are unique per source, so nothing is ever posted twice.
-- =====================================================================

CREATE TYPE ledger_kind   AS ENUM ('income', 'expense');
CREATE TYPE ledger_source AS ENUM ('manual', 'subscription', 'salla_fee', 'teacher_payout');

CREATE TABLE ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          ledger_kind   NOT NULL,
  category      text          NOT NULL CHECK (char_length(category) BETWEEN 2 AND 60),
  amount_sar    numeric(12,2) NOT NULL CHECK (amount_sar > 0),
  entry_date    date          NOT NULL,                 -- Riyadh calendar date
  description   text          NOT NULL DEFAULT '',
  source        ledger_source NOT NULL DEFAULT 'manual',
  source_id     text,                                   -- subscription id / payout id
  salla_order_id text,
  created_by    uuid REFERENCES users(id),              -- NULL = system (e.g. Salla webhook)
  created_at    timestamptz   NOT NULL DEFAULT now(),
  voided_at     timestamptz,
  voided_by     uuid REFERENCES users(id),
  void_reason   text,
  CHECK (voided_at IS NULL OR (void_reason IS NOT NULL AND char_length(void_reason) >= 3))
);
CREATE INDEX ledger_date_idx ON ledger_entries(entry_date DESC) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX ledger_auto_once ON ledger_entries(source, source_id) WHERE source <> 'manual';

CREATE TRIGGER ledger_no_delete   BEFORE DELETE   ON ledger_entries FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- Financial facts are immutable; the only allowed change is voiding (once).
CREATE OR REPLACE FUNCTION ghiras_ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.kind <> OLD.kind OR NEW.category <> OLD.category OR NEW.amount_sar <> OLD.amount_sar
     OR NEW.entry_date <> OLD.entry_date OR NEW.description <> OLD.description OR NEW.source <> OLD.source
     OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: ledger entries are immutable (void and re-enter instead)' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: entry already voided' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_immutable BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ghiras_ledger_immutable();

-- ---------- Settings (key/value, editable by the owner) ----------
CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER settings_no_delete BEFORE DELETE ON settings FOR EACH ROW EXECUTE FUNCTION ghiras_forbid_delete();
INSERT INTO settings (key, value) VALUES ('salla_fee_percent', '0'), ('salla_fee_fixed_sar', '0');

-- ---------- Backfill what already happened ----------
INSERT INTO ledger_entries (kind, category, amount_sar, entry_date, description, source, source_id, salla_order_id, created_by)
SELECT 'income', 'اشتراكات', s.price_sar, (s.starts_at AT TIME ZONE 'Asia/Riyadh')::date,
       p.name_ar || ' — ' || s.reference, 'subscription', s.id::text, s.salla_order_id, s.activated_by
  FROM subscriptions s JOIN plans p ON p.code = s.plan_code
 WHERE s.starts_at IS NOT NULL AND s.price_sar > 0;

INSERT INTO ledger_entries (kind, category, amount_sar, entry_date, description, source, source_id, created_by)
SELECT 'expense', 'أجور المعلمات', po.amount_sar, (po.paid_at AT TIME ZONE 'Asia/Riyadh')::date,
       'أجر ' || u.full_name || ' — ' || po.sessions_count || ' حصة (' || to_char(po.period_start, 'YYYY-MM') || ')',
       'teacher_payout', po.id::text, po.paid_by
  FROM payouts po JOIN users u ON u.id = po.teacher_id
 WHERE po.amount_sar > 0;
