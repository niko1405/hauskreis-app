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
 * **Warum als Hook und nicht im Balken.** Ein `UNKNOWN` entsteht an zwei
 * Stellen: unten am Termin (`answer-bar.tsx`) und auf der Terminkarte in der
 * Liste (`meeting-card.tsx`). Der Kalender ist bewusst draußen — seine Zeile
 * beantwortet „was ist wann".
 *
 * Die Rückfrage ist eine Regel über die Daten („eine Rolle ist die Aussage: ich
 * bin da und mache das") und nicht über einen Bildschirm. In den Balken
 * geschrieben, hätte man sie beim zweiten Ort wieder herausholen müssen — was
 * genau eingetreten ist.
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

  /**
   * Antwortet — und sagt, ob es dazu gekommen ist.
   *
   * Der Rückgabewert ist für den Antwort-Balken am Termin: Ein Druck auf eine
   * Antwort klappt ihn auf, damit man gleich eine Verspätung dazuschreiben
   * kann. Wer die Rollen-Rückfrage abbricht, hat aber nichts geantwortet — ein
   * Feld für die Notiz zu einer nicht gegebenen Antwort wäre die falsche
   * Frage. Die übrigen Aufrufer sehen davon nichts.
   */
  const answer = useCallback(
    async (status: AttendanceStatus): Promise<boolean> => {
      if (!myId) return false;

      if (status === 'UNKNOWN') {
        const roles = rolesOf(meeting, myId);

        if (roles.length > 0) {
          const ok = await confirm({
            title: 'Du bist an dem Abend eingeteilt',
            body: `${join(roles).replace(/^./, (c) => c.toUpperCase())}. Auf „Weiß noch nicht“ zu gehen gibt ${roles.length === 1 ? 'die Rolle' : 'diese Rollen'} wieder frei.`,
            confirmLabel: 'Weiß noch nicht',
          });
          if (!ok) return false;
        }
      }

      setAttendance.mutate({ personId: myId, status });
      return true;
    },
    [confirm, meeting, myId, setAttendance],
  );

  return { answer, saving: setAttendance.isPending };
}
