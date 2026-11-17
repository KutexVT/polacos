-- A write may wait for the shared transaction lock. Record when it actually runs,
-- so collections that finish after a fixed cash cutoff cannot slip into that cutoff.
ALTER TABLE payments ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE purchases ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE audit ALTER COLUMN created_at SET DEFAULT clock_timestamp();
