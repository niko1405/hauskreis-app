import type { Prisma } from '../../generated/prisma/client';

/**
 * Wer wirklich dabei ist — Mitglied **und** schon einmal angemeldet.
 *
 * **`active` allein reicht nicht, und das war lange ein stiller Fehler.** Eine
 * eingeladene Person ist von der ersten Sekunde an `active: true`: Die Zeile
 * entsteht beim Einladen, das Keycloak-Konto auch. Erst `acceptedAt` sagt, ob
 * jemals ein Mensch davorsaß (siehe `schema.prisma` bei `Person.acceptedAt`).
 *
 * Fast jede Abfrage im Projekt fragte nur nach `active` und meinte damit „wer
 * ist dabei". Die Folge war überall dieselbe und nirgends ein Fehler, den man
 * gemeldet bekam:
 *
 * - In der **Gebetsrotation** stand ein Name, dem niemand schreiben konnte, und
 *   sein Gegenüber betete zwei Wochen allein.
 * - In den **Vorschlagslisten** stand er ganz oben — er hatte ja noch nie
 *   gehostet — und ließ sich auch eintragen.
 * - In der **Anwesenheit** stand er auf „weiß noch nicht" und verhinderte
 *   nebenbei, dass ein Abend als „alle haben abgesagt" von selbst ausfällt.
 *
 * Eine Einladung ist eine offene Frage, keine Zusage. Wer sie annimmt, kommt
 * überall auf einmal dazu — die Rotation zieht dann von selbst nach
 * (`PersonService.resolveForUser`, `MembershipService.acceptInvitation`).
 *
 * **Wo das absichtlich nicht gilt:** in den Mitgliederlisten (Profil und
 * Verwaltung). Das sind die einzigen beiden Listen, die die Frage „wer ist
 * eingeladen" überhaupt beantworten sollen — dort steht die Person mit ihrem
 * Abzeichen.
 *
 * Deutsch benannt, weil „arrived" das Gegenteil von eindeutig wäre: Es geht
 * nicht ums Ankommen an einem Abend, sondern um das Ankommen im Hauskreis.
 */
export const ANGEKOMMEN: Prisma.PersonWhereInput = {
  active: true,
  acceptedAt: { not: null },
};
