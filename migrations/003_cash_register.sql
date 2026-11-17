ALTER TABLE payments ADD COLUMN payment_cash bigint CHECK(payment_cash BETWEEN 0 AND 1000000000000);
ALTER TABLE payments ADD COLUMN payment_sinpe bigint CHECK(payment_sinpe BETWEEN 0 AND 1000000000000);
ALTER TABLE payments ADD COLUMN payment_card bigint CHECK(payment_card BETWEEN 0 AND 1000000000000);
ALTER TABLE payments ADD COLUMN cash_received bigint CHECK(cash_received BETWEEN 0 AND 1000000000000);
ALTER TABLE payments ADD COLUMN cash_change bigint CHECK(cash_change BETWEEN 0 AND 1000000000000);
-- Earlier payments did not record a method. Do not infer cash from a missing value.
ALTER TABLE payments ADD CONSTRAINT payments_complete_method CHECK (
 (payment_cash IS NULL AND payment_sinpe IS NULL AND payment_card IS NULL AND cash_received IS NULL AND cash_change IS NULL) OR
 (payment_cash IS NOT NULL AND payment_sinpe IS NOT NULL AND payment_card IS NOT NULL AND cash_received IS NOT NULL AND cash_change IS NOT NULL
  AND payment_cash+payment_sinpe+payment_card=amount AND cash_received-cash_change=payment_cash AND (payment_cash>0 OR cash_received=0))
);
CREATE TABLE register_settings (
 group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope text NOT NULL CHECK(scope IN ('personal','team')),
 day_start time NOT NULL DEFAULT '00:00',
 opening_default bigint CHECK(opening_default BETWEEN 0 AND 1000000000000),
 PRIMARY KEY(user_id,scope)
);
CREATE TABLE cash_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 actor_name text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('personal','team')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 occurred_at timestamptz NOT NULL,
 method text NOT NULL CHECK(method IN ('cash','sinpe','card')),
 direction text NOT NULL CHECK(direction IN ('in','out')),
 amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 1000000000000),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
 reverses uuid UNIQUE REFERENCES cash_entries(id),
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 UNIQUE(actor_id,idempotency_key)
);
CREATE INDEX cash_entries_period ON cash_entries(group_id,occurred_at);
CREATE TABLE cash_closings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 actor_name text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('personal','team')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 period_from timestamptz NOT NULL,
 period_to timestamptz NOT NULL CHECK(period_to>period_from),
 currency text NOT NULL DEFAULT 'CRC' CHECK(currency='CRC'),
 snapshot jsonb NOT NULL,
 count jsonb NOT NULL,
 opening bigint NOT NULL CHECK(opening BETWEEN 0 AND 1000000000000),
 actual_cash bigint NOT NULL,
 actual_sinpe bigint,
 actual_card bigint,
 expected_cash bigint NOT NULL,
 difference_cash bigint NOT NULL,
 note text NOT NULL,
 supersedes uuid REFERENCES cash_closings(id),
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 UNIQUE(actor_id,idempotency_key)
);
CREATE INDEX cash_closings_period ON cash_closings(group_id,created_at DESC);
CREATE TABLE closing_submissions (
 closing_id uuid PRIMARY KEY REFERENCES cash_closings(id) ON DELETE CASCADE,
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_at timestamptz,
 reviewer_id uuid,
 reviewer_name text,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000)
);
CREATE FUNCTION protect_cash_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Preserve snapshots and counter-entries. Removing a whole group also removes its own history.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM groups WHERE id=OLD.group_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Los cierres y movimientos de caja se conservan sin cambios' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER cash_entries_immutable BEFORE UPDATE OR DELETE ON cash_entries FOR EACH ROW EXECUTE FUNCTION protect_cash_history();
CREATE TRIGGER cash_closings_immutable BEFORE UPDATE OR DELETE ON cash_closings FOR EACH ROW EXECUTE FUNCTION protect_cash_history();
