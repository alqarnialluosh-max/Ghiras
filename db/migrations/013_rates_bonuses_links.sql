-- Teacher pay per product, the pay rate frozen on each session, teacher bonuses, and the new Salla payment links.

-- 1) What a teacher earns for one session of each product (editable by the owner)
ALTER TABLE plans ADD COLUMN teacher_rate_sar numeric(8,2) NOT NULL DEFAULT 35 CHECK (teacher_rate_sar >= 0);
-- Earlier Salla product ids still match orders placed from old links
ALTER TABLE plans ADD COLUMN salla_legacy_ids text[] NOT NULL DEFAULT '{}';

-- 2) The rate is frozen on the session when it's confirmed, so later price changes never rewrite past pay
ALTER TABLE bookings ADD COLUMN teacher_rate_sar numeric(8,2);
UPDATE bookings SET teacher_rate_sar = 35 WHERE status IN ('scheduled','completed','student_absent','teacher_absent');

CREATE OR REPLACE FUNCTION ghiras_booking_rate() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('scheduled','completed','student_absent','teacher_absent') AND NEW.teacher_rate_sar IS NULL THEN
    SELECT p.teacher_rate_sar INTO NEW.teacher_rate_sar
      FROM subscriptions s JOIN plans p ON p.code = s.plan_code WHERE s.id = NEW.subscription_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER bookings_rate BEFORE INSERT OR UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION ghiras_booking_rate();

-- once frozen, the session's rate can't change
CREATE OR REPLACE FUNCTION ghiras_booking_rate_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.teacher_rate_sar IS NOT NULL AND NEW.teacher_rate_sar IS DISTINCT FROM OLD.teacher_rate_sar THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: a session''s pay rate is frozen once confirmed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER bookings_rate_frozen BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION ghiras_booking_rate_frozen();

-- 3) Bonuses: added by the owner for a month, paid with that month's payout; voided (never deleted) if entered by mistake
CREATE TABLE teacher_bonuses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   uuid NOT NULL REFERENCES users(id),
  amount_sar   numeric(10,2) NOT NULL CHECK (amount_sar > 0 AND amount_sar <= 100000),
  reason       text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  payout_id    uuid REFERENCES payouts(id),
  voided_at    timestamptz,
  voided_by    uuid REFERENCES users(id),
  void_reason  text,
  CHECK (voided_at IS NULL OR payout_id IS NULL)          -- a paid bonus can't be voided
);
CREATE INDEX teacher_bonuses_teacher_idx ON teacher_bonuses(teacher_id, period_month);
CREATE TRIGGER teacher_bonuses_no_delete   BEFORE DELETE   ON teacher_bonuses FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER teacher_bonuses_no_truncate BEFORE TRUNCATE ON teacher_bonuses FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();
CREATE OR REPLACE FUNCTION ghiras_bonus_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.amount_sar <> OLD.amount_sar OR NEW.teacher_id <> OLD.teacher_id OR NEW.period_month <> OLD.period_month
     OR NEW.reason <> OLD.reason OR (OLD.payout_id IS NOT NULL AND NEW.payout_id IS DISTINCT FROM OLD.payout_id)
     OR (OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: bonuses are only paid or voided, never edited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER teacher_bonuses_guard BEFORE UPDATE ON teacher_bonuses FOR EACH ROW EXECUTE FUNCTION ghiras_bonus_guard();

ALTER TABLE payouts ADD COLUMN bonus_sar numeric(10,2) NOT NULL DEFAULT 0;

-- 4) New Salla payment links (28 Nov 2026); the previous all-subjects product id keeps matching old orders
UPDATE plans SET salla_legacy_ids = array_append(salla_legacy_ids, salla_product_id)
 WHERE salla_product_id IS NOT NULL AND salla_product_id NOT IN ('544254289','84178834','447142854');
UPDATE plans SET salla_url = 'https://salla.sa/ghirasedu/payment/p544254289', salla_product_id = '544254289' WHERE code = 'ALL_SUBJECTS';
UPDATE plans SET salla_url = 'https://salla.sa/ghirasedu/payment/p84178834',  salla_product_id = '84178834'  WHERE code = 'SINGLE_SUBJECT';
UPDATE plans SET salla_url = 'https://salla.sa/ghirasedu/payment/p447142854', salla_product_id = '447142854' WHERE code = 'SINGLE_SESSION';
