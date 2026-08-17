'use client';

/**
 * Wofür die Gruppe an diesem Abend beten will — ein Anliegen je Person.
 *
 * **Bis hierher gab es dafür keinen Ort.** Anliegen standen im Gruppenchat,
 * gingen unter, und am Abend fragte jemand „hatte nicht jemand was?". Genau das
 * Muster, gegen das diese App gebaut ist.
 *
 * **Genau eines je Person**, und das ist keine technische Beschränkung: „Wofür
 * sollen wir beten" ist eine Frage, auf die man eine Antwort gibt. Eine Liste
 * eigener Anliegen wäre schon die nächste Sache, nämlich ein Notizbuch.
 *
 * **Anlegen darf jede:r, auch wer an dem Abend fehlt.** Wer nicht kommt, hat
 * nicht weniger Anliegen — eher mehr, und die Bitte, dass die anderen für ihn
 * beten, ist gerade dann der Punkt. Hier steht deshalb bewusst keine
 * Anwesenheitsprüfung, anders als bei den Rollen.
 *
 * **Der Weg hinein geht ohne den Bearbeitungsmodus.** Das eigene Anliegen
 * anzulegen ist der Grund, aus dem man diese Karte überhaupt ansieht — dafür
 * erst einen Schalter zu suchen wäre eine Hürde vor der Hauptsache. Der Klick
 * schaltet den Modus selbst ein (wie `NotesPrompt` es für die Nachbereitung
 * tut), damit gleich ein Eingabefeld dasteht. **Ändern und Löschen** brauchen
 * ihn dann doch: Das sind Eingriffe in etwas, das schon dasteht, und ein
 * Papierkorb neben einem fertigen Satz ist eine Zeile zu nah am Daumen.
 *
 * Fremde Anliegen sind nur zu lesen. Das ist keine Rechteprüfung im Frontend,
 * sondern die Form der Sache: Es gibt gar keine Adresse, unter der man an einer
 * fremden Zeile schreiben könnte (`…/prayer-requests/mine`).
 */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { InlineEdit } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import {
  useMe,
  useMeetingPrayerRequests,
  usePersonLookup,
  useRemoveMyPrayerRequest,
  useSaveMyPrayerRequest,
} from '@/lib/api/hooks';
import type { PrayerRequest } from '@/lib/api/types';

export function PrayerRequestsCard({
  meetingId,
  /** Der Bearbeitungsmodus der Seite — er gilt hier fürs Ändern und Löschen. */
  editing,
  /**
   * Ein vergangener oder abgesagter Abend. Dann steht nur noch da, was war —
   * wie bei den Liedern, die danach „Gesungen" heißen. Der Server hält
   * dieselbe Grenze.
   */
  locked,
  /** Schaltet den Bearbeitungsmodus ein, wenn jemand hier anfängt zu schreiben. */
  onEdit,
}: {
  meetingId: string;
  editing: boolean;
  locked: boolean;
  onEdit: () => void;
}) {
  const requests = useMeetingPrayerRequests(meetingId);
  const save = useSaveMyPrayerRequest(meetingId);
  const remove = useRemoveMyPrayerRequest(meetingId);
  const me = useMe();

  /**
   * Ob gerade ein noch leeres eigenes Anliegen offensteht. Nur hier und nicht
   * am Server: Ein leeres Feld ist nichts, was man speichert — es ist ein Feld,
   * das noch nichts ist. Dieselbe Überlegung wie in `notes-card.tsx`.
   */
  const [writing, setWriting] = useState(false);

  const entries = requests.data ?? [];
  const mine = entries.find((entry) => entry.person.id === me.me?.id) ?? null;
  const others = entries.filter((entry) => entry.person.id !== me.me?.id);

  const mayAdd = !locked && !mine;

  // Die Karte steht nicht leer da: Ist nichts geschrieben und darf auch nichts
  // geschrieben werden, gibt es nichts zu zeigen. An einem vergangenen Abend
  // ohne Anliegen wäre sie eine Erinnerung daran, dass niemand etwas hatte.
  if (entries.length === 0 && !mayAdd) return null;

  const showMine = Boolean(mine) || (editing && writing);

  return (
    <section>
      <SectionTitle>Gebetsanliegen</SectionTitle>
      <Card className="space-y-3">
        {requests.isLoading && <Skeleton className="h-16 w-full" />}

        {others.map((entry) => (
          <PrayerRequestRow key={entry.person.id} entry={entry} />
        ))}

        {showMine && (
          <div className="rounded-lg border border-line-strong bg-canvas p-3">
            <div className="mb-1.5 flex items-center gap-2">
              {me.me && <Avatar person={me.me} size="xs" />}
              <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                Von dir
              </span>
            </div>

            <InlineEdit
              label="Mein Gebetsanliegen"
              multiline
              value={mine?.text ?? null}
              emptyLabel="Noch nichts eingetragen"
              placeholder="Wofür sollen die anderen beten?"
              startOpen={writing}
              onDiscard={() => setWriting(false)}
              saving={save.isPending}
              onSave={
                // Ohne Bearbeitungsmodus nur beim ersten Schreiben — dann ist
                // der Modus durch den Klick auf „Hinzufügen" ohnehin schon an.
                editing
                  ? (next) => {
                      if (next === null || next.trim() === '') {
                        setWriting(false);
                        if (mine) remove.mutate();
                        return;
                      }
                      save.mutate(next);
                    }
                  : undefined
              }
            />

            {/* Löschen nur im Bearbeitungsmodus und nur beim eigenen — leeren
                geht auch über das Feld, aber ein Papierkorb sagt deutlicher,
                dass danach nichts mehr dasteht. */}
            {editing && mine && (
              <button
                type="button"
                onClick={() => {
                  setWriting(false);
                  remove.mutate();
                }}
                disabled={remove.isPending}
                className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 transition-colors hover:text-alert disabled:opacity-50"
              >
                <Trash2 size={12} />
                Anliegen entfernen
              </button>
            )}
          </div>
        )}

        {mayAdd && !showMine && (
          <button
            type="button"
            onClick={() => {
              setWriting(true);
              onEdit();
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] font-semibold text-stone-400 transition-colors hover:border-terracotta-400 hover:text-terracotta-600"
          >
            <Plus size={14} />
            Mein Gebetsanliegen hinzufügen
          </button>
        )}

        {entries.length === 0 && (
          <p className="text-[11px] leading-relaxed text-stone-400">
            Noch hat niemand etwas eingetragen. Auch wer an dem Abend nicht
            dabei ist, darf hier etwas hinschreiben.
          </p>
        )}
      </Card>
    </section>
  );
}

/**
 * Das Anliegen einer anderen Person. Mit Avatar und Namen, weil man für
 * jemanden betet und nicht für einen Text.
 */
function PrayerRequestRow({ entry }: { entry: PrayerRequest }) {
  const lookup = usePersonLookup();
  const person = lookup.get(entry.person.id) ?? entry.person;

  return (
    <div className="flex gap-3 rounded-md border border-line p-3">
      <Avatar person={person} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-stone-800">{entry.person.name}</p>
        {/* `whitespace-pre-line`: Wer sein Anliegen in Zeilen aufteilt, hat
            das so gemeint. */}
        <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line text-stone-600">
          {entry.text}
        </p>
      </div>
    </div>
  );
}
