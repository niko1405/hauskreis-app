'use client';

/**
 * Die eigene Antwort auf „bist du dabei" — mit der einen Rückfrage, die dazu
 * gehört.
 *
 * **Wer eingeteilt ist und auf „Weiß noch nicht" geht, verliert seine Rollen.**
 * Der Server macht das seit jeher bei einer Absage und ab jetzt auch hier: Eine
 * Rolle ist die Aussage „ich bin da und mache das" (CLAUDE.md §6.7, „Wer
 * eingeteilt wird, ist dabei"), und wer auf unentschieden zurückgeht, nimmt
 * genau sie zurück. Am Dienstag stand sonst im Plan jemand, der selbst nicht
 * weiß, ob er kommt.
 *
 * **Die Rückfrage gilt dem ganzen Schritt.** Abbrechen lässt Status *und* Rolle
 * stehen; es gibt bewusst kein „ja, aber die Rolle behalten". Das wäre ein
 * Zustand, den es sonst nirgends gibt — unsicher und trotzdem eingeteilt —, und
 * er bräuchte ein zusätzliches Feld an der API, damit der Server wüsste, was
 * gemeint war.
 *
 * **Warum als Hook und nicht in der Karte.** Ein `UNKNOWN` kann an drei Stellen
 * entstehen: in der Antwort-Karte auf der Terminseite und über den kompakten
 * Umschalter in Terminliste und Kalender (dort schickt ein zweiter Tipp auf den
 * gewählten Knopf `UNKNOWN`). Eine davon auszulassen hieße, dass dieselbe Geste
 * je nach Bildschirm etwas anderes tut.
 *
 * Gefragt wird **nur, wenn wirklich etwas dranhängt**. Die Rollen stehen in
 * jeder Termin-Antwort, es braucht also keine zweite Abfrage — und bei
 * niemandem, der an dem Abend nichts hat, kommt gar keine Rückfrage.
 */
import { useCallback } from 'react';
import { useConfirm } from '@/components/ui/confirm';
import { useMe, useSetAttendance } from '@/lib/api/hooks';
import type { AttendanceStatus, PersonRef } from '@/lib/api/types';

/** Woran man ablesen kann, ob jemand an diesem Abend etwas übernommen hat. */
export interface RolesAtMeeting {
  host: PersonRef | null;
  testimonyPerson: PersonRef | null;
  topicResponsibles: { person: PersonRef }[];
  songLeaders: { person: PersonRef }[];
}

/**
 * Wofür diese Person an diesem Abend eingeteilt ist, benannt.
 *
 * Die Namen und nicht die Zahl: „Als Gastgeber und für die Musik" sagt, was auf
 * dem Spiel steht — „2 Rollen" lässt einen raten.
 */
export function rolesOf(meeting: RolesAtMeeting, personId: string): string[] {
  const roles: string[] = [];

  if (meeting.host?.id === personId) roles.push('als Gastgeber');
  if (meeting.topicResponsibles.some((row) => row.person.id === personId)) {
    roles.push('fürs Thema');
  }
  if (meeting.songLeaders.some((row) => row.person.id === personId)) {
    roles.push('für die Musik');
  }
  if (meeting.testimonyPerson?.id === personId) {
    roles.push('für dein Testimony');
  }

  return roles;
}

/** „als Gastgeber und für die Musik" */
function join(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} und ${parts.at(-1)}`;
}

export function useAttendanceAnswer(meeting: { id: string } & RolesAtMeeting) {
  const setAttendance = useSetAttendance(meeting.id);
  const confirm = useConfirm();
  const me = useMe();
  const myId = me.me?.id;

  const answer = useCallback(
    async (status: AttendanceStatus) => {
      if (!myId) return;

      if (status === 'UNKNOWN') {
        const roles = rolesOf(meeting, myId);

        if (roles.length > 0) {
          const ok = await confirm({
            title: 'Du bist an dem Abend eingeteilt',
            body: `${join(roles).replace(/^./, (c) => c.toUpperCase())}. Auf „Weiß noch nicht“ zu gehen gibt ${roles.length === 1 ? 'die Rolle' : 'diese Rollen'} wieder frei.`,
            confirmLabel: 'Weiß noch nicht',
          });
          if (!ok) return;
        }
      }

      setAttendance.mutate({ personId: myId, status });
    },
    [confirm, meeting, myId, setAttendance],
  );

  return { answer, saving: setAttendance.isPending };
}
