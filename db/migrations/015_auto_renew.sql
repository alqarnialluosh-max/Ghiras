-- Auto-renewal: on by default for monthly plans; the parent can turn it off at any time.
-- Phase 1: 3 days before the end we create the renewal (pending) and email the payment link.
-- Phase 2 (after Salla approves recurring payments): the same flag drives the automatic card charge.

ALTER TABLE plans ADD COLUMN renewable boolean NOT NULL DEFAULT true;
UPDATE plans SET renewable = false WHERE code = 'SINGLE_SESSION';

ALTER TABLE subscriptions
  ADD COLUMN auto_renew          boolean NOT NULL DEFAULT true,
  ADD COLUMN auto_renew_changed_at timestamptz,
  ADD COLUMN renewal_of          uuid REFERENCES subscriptions(id),
  ADD COLUMN renewal_noticed_at  timestamptz;

-- one-off purchases never renew
UPDATE subscriptions s SET auto_renew = false FROM plans p WHERE p.code = s.plan_code AND NOT p.renewable;

-- at most one live renewal per subscription (a cancelled one is kept as void)
CREATE UNIQUE INDEX subscriptions_one_renewal ON subscriptions (renewal_of) WHERE renewal_of IS NOT NULL AND status <> 'void';
CREATE INDEX subscriptions_ending_idx ON subscriptions (ends_at) WHERE status = 'active';
