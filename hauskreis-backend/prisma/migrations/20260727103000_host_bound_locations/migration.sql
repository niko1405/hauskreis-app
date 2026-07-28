-- Renamed rather than dropped and re-added: the column keeps its values, and
-- the new name says what it actually is now — a weight that only applies to
-- host-bound homes.
ALTER TABLE "location" RENAME COLUMN "frequency_factor" TO "host_weight";

-- Which home a person brings into the rotation. Nullable: not everyone hosts,
-- and every other role works without it.
-- Past evenings stay attributed via meeting.location_id, so this only ever
-- answers "who lives here now" and moving house does not rewrite history.
ALTER TABLE "person" ADD COLUMN "location_id" UUID;

ALTER TABLE "person" ADD CONSTRAINT "person_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "location"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
