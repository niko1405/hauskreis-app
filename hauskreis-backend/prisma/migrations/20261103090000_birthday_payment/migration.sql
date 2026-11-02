-- Wer seinen Anteil an einem Geschenk gegeben hat — abgehakt von der Person
-- selbst. Eine Zeile je Person und Geburtstag; ihre Existenz ist die Aussage.
--
-- Rein additiv.

CREATE TABLE "birthday_payment" (
    "occasion_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "birthday_payment_pkey" PRIMARY KEY ("occasion_id","person_id")
);

CREATE INDEX "birthday_payment_person_id_idx" ON "birthday_payment"("person_id");

ALTER TABLE "birthday_payment" ADD CONSTRAINT "birthday_payment_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "birthday_occasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "birthday_payment" ADD CONSTRAINT "birthday_payment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
