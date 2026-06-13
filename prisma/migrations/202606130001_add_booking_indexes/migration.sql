-- Index the Booking foreign keys and status. Postgres does not auto-create
-- indexes on FK columns, so these lookups (student dashboard, schedule joins,
-- duration backfill) previously fell back to sequential scans.
CREATE INDEX IF NOT EXISTS "Booking_student_id_idx" ON "Booking"("student_id");
CREATE INDEX IF NOT EXISTS "Booking_slot_id_idx" ON "Booking"("slot_id");
CREATE INDEX IF NOT EXISTS "Booking_proposed_slot_id_idx" ON "Booking"("proposed_slot_id");
CREATE INDEX IF NOT EXISTS "Booking_stylist_id_idx" ON "Booking"("stylist_id");
CREATE INDEX IF NOT EXISTS "Booking_status_idx" ON "Booking"("status");
