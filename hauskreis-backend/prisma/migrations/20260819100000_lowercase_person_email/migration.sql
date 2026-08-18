-- Adressen kleinschreiben, damit sie ihre Einladung wiederfinden.
--
-- Keycloak normalisiert E-Mail-Adressen auf Kleinbuchstaben; `person.email`
-- behielt bis eben, was jemand ins Einladungsformular getippt hat. Die drei
-- Abfragen, die eine offene Einladung suchen, vergleichen exakt — wer als
-- `Max.Muster@gmail.com` eingeladen wurde, kam mit `max.muster@gmail.com` im
-- Token an, fand seine Zeile nicht und landete auf dem Onboarding-Bildschirm.
--
-- Ab jetzt normalisiert `emailSchema` beim Schreiben und der AuthGuard beim
-- Lesen. Dieser Schritt holt nach, was schon dasteht.
--
-- **Ohne ON CONFLICT.** Gäbe es zwei Zeilen im selben Hauskreis, die sich nur
-- in der Schreibweise unterscheiden, verletzte das Update den eindeutigen
-- Index und die Migration bricht ab. Genau richtig: Welche der beiden Zeilen
-- der Mensch ist und welche der Tippfehler, kann hier niemand entscheiden, und
-- eine davon still zu verlieren wäre der schlechtere Ausgang.
UPDATE "person"
SET "email" = lower("email")
WHERE "email" IS NOT NULL
  AND "email" <> lower("email");
