-- Ein Datum, an dem der Terminplaner nichts anlegen soll.
--
-- Admins dürfen jetzt auch erzeugte Abende löschen. Der Generator legt aber
-- jeden Tag nach, an dem im Rhythmus ein Termin fehlt — ohne diesen Grabstein
-- stünde der gelöschte Dienstag in der nächsten Nacht wieder da.
--
-- Rein additiv.

CREATE TABLE "skipped_meeting_date" (
    "hauskreis_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skipped_meeting_date_pkey" PRIMARY KEY ("hauskreis_id","date")
);

ALTER TABLE "skipped_meeting_date" ADD CONSTRAINT "skipped_meeting_date_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
