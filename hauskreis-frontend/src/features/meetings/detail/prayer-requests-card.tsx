'use client';

/**
 * Wofür die Gruppe an diesem Abend beten will — ein Anliegen je Person.
 *
 * **Ein Ort für Anliegen**, damit sie nicht im Gruppenchat untergehen und am
 * Abend jemand fragt „hatte nicht jemand was?".
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
 * **Das eigene Anliegen sieht aus wie jedes andere** — eine Sprechblase mit
 * Gesicht und „Du". Ein eigener Kasten mit Stift und Papierkorb daneben sah
 * aus wie ein Formular zwischen lauter Sätzen. Ein Tipp auf die eigene Blase
 * öffnet ein Sheet: ändern, entfernen oder abbrechen. Anlegen geht über
 * dasselbe Sheet.
 *
 * Fremde Anliegen sind nur zu lesen. Das ist keine Rechteprüfung im Frontend,
 * sondern die Form der Sache: Es gibt gar keine Adresse, unter der man an einer
 * fremden Zeile schreiben könnte (`…/prayer-requests/mine`).
 */
import { Heart, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { TextArea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SpeechBubble } from '@/components/ui/speech-bubble';
import { Skeleton } from '@/components/ui/states';
import {
  useMe,
  useMeetingPrayerRequests,
  usePersonLookup,
  useRemoveMyPrayerRequest,
  useSaveMyPrayerRequest,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { PrayerRequest } from '@/lib/api/types';

export function PrayerRequestsCard({
  meetingId,
  /**
   * Ein vergangener oder abgesagter Abend. Dann steht nur noch da, was war —
   * wie bei den Liedern, die danach „Gesungen" heißen. Der Server hält
   * dieselbe Grenze.
   */
  locked,
}: {
  meetingId: string;
  locked: boolean;
}) {
  const requests = useMeetingPrayerRequests(meetingId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const entries = requests.data ?? [];
  const mine = entries.find((entry) => entry.person.id === me.me?.id) ?? null;
  const others = entries.filter((entry) => entry.person.id !== me.me?.id);

  const mayAdd = !locked && !mine;

  // Die Karte steht nicht leer da: Ist nichts geschrieben und darf auch nichts
  // geschrieben werden, gibt es nichts zu zeigen. An einem vergangenen Abend
  // ohne Anliegen wäre sie eine Erinnerung daran, dass niemand etwas hatte.
  if (entries.length === 0 && !mayAdd) return null;

  const sheet = editing && (
    // Nur solange es offen ist: So beginnt das Feld jedes Mal mit dem Stand,
    // der gerade dasteht, und nicht mit einem halben Entwurf vom letzten Mal.
    <PrayerRequestSheet
      meetingId={meetingId}
      current={mine?.text ?? null}
      onClose={() => setEditing(false)}
    />
  );

  // **Noch nichts da — eine Einladung statt einer leeren Liste.** Ein grauer
  // Satz „Noch hat niemand etwas eingetragen" unter einem gestrichelten Knopf
  // las sich wie ein Protokoll; die Frage „Was bewegt dich gerade?" ist das,
  // was man an dieser Stelle eigentlich hören will. Gefüllt ist der Knopf
  // nicht: Er ist eine Bitte, keine Pflicht vor dem Abend.
  if (!requests.isLoading && entries.length === 0) {
    return (
      <section>
        <SectionTitle>Gebetsanliegen</SectionTitle>
        <Card className="flex flex-col items-center bg-linear-to-b from-terracotta-500/10 via-card to-card px-6 py-7 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-terracotta-500/30 bg-terracotta-500/10 text-terracotta-500">
            <Heart size={22} />
          </span>
          <p className="mt-4 font-bold text-stone-900">
            Was bewegt dich gerade?
          </p>
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-stone-500">
            Teile ein Anliegen oder einen Dank, wofür wir gemeinsam beten
            können.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              'mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-terracotta-500/40 bg-terracotta-500/10 py-3 text-sm font-semibold text-terracotta-500 transition-colors hover:bg-terracotta-500/15',
              'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
              PRESSABLE,
            )}
          >
            <Plus size={16} />
            Mein Gebetsanliegen hinzufügen
          </button>
        </Card>
        {sheet}
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>Gebetsanliegen</SectionTitle>
      <Card className="space-y-3">
        {requests.isLoading && <Skeleton className="h-16 w-full" />}

        {others.map((entry) => (
          <PrayerRequestRow key={entry.person.id} entry={entry} />
        ))}

        {/* Das eigene zuletzt, wie bisher — und als dieselbe Blase. Gesperrt
            (vergangen, abgesagt) ist es nur noch zu lesen. */}
        {mine && (
          <PrayerRequestRow
            entry={mine}
            mine
            onOpen={locked ? undefined : () => setEditing(true)}
          />
        )}

        {mayAdd && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] font-semibold text-stone-400 transition-colors hover:border-terracotta-400 hover:text-terracotta-600"
          >
            <Plus size={14} />
            Mein Gebetsanliegen hinzufügen
          </button>
        )}
      </Card>

      {sheet}
    </section>
  );
}

/**
 * Ein Anliegen — als Sprechblase.
 *
 * Mit Avatar und Namen, weil man für jemanden betet und nicht für einen Text.
 * Und als Blase, weil genau das hier steht: ein Satz, den jemand der Gruppe
 * sagt — ein Kasten sähe aus wie ein Datenfeld. Die Blase selbst steht in
 * `speech-bubble.tsx` — Thema und Einheit zeigen damit, wer daran arbeitet.
 *
 * Das eigene trägt „Du" statt des Namens und ist, solange der Abend offen
 * ist, ein Knopf (`onOpen`): Ein Tipp führt ins Sheet. Kein Stift daneben —
 * dass man den eigenen Satz ändern kann, erwartet man, und ein Symbol in der
 * Blase wäre das Einzige, das sie von den anderen unterschiede.
 */
function PrayerRequestRow({
  entry,
  mine = false,
  onOpen,
}: {
  entry: PrayerRequest;
  mine?: boolean;
  onOpen?: () => void;
}) {
  const lookup = usePersonLookup();
  const person = lookup.get(entry.person.id) ?? entry.person;

  const content = (
    <>
      <Avatar person={person} size="sm" className="mt-1 shrink-0" />

      <SpeechBubble
        className={cn(
          onOpen && 'transition-colors group-hover:border-line-strong',
        )}
      >
        <p className="text-sm font-bold text-terracotta-700">
          {mine ? 'Du' : entry.person.name}
        </p>
        {/* `whitespace-pre-line`: Wer sein Anliegen in Zeilen aufteilt, hat
            das so gemeint. */}
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-stone-600">
          {entry.text}
        </p>
      </SpeechBubble>
    </>
  );

  if (!onOpen) {
    return <div className="flex items-start gap-2.5">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Mein Gebetsanliegen bearbeiten"
      className="group flex w-full items-start gap-2.5 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
    >
      {content}
    </button>
  );
}

/**
 * Das eigene Anliegen schreiben, ändern oder entfernen.
 *
 * Ein Sheet und kein Feld in der Karte: Inline schöbe das Formular die
 * Anliegen der anderen weg, und auf dem Telefon läge das Feld hinter der
 * Tastatur — dieselbe Überlegung wie bei den Ideen der Gruppe. „Abbrechen"
 * lässt alles, wie es war. Leer speichern heißt entfernen, wie bisher; der
 * eigene Knopf dafür sagt es nur deutlicher.
 */
function PrayerRequestSheet({
  meetingId,
  current,
  onClose,
}: {
  meetingId: string;
  current: string | null;
  onClose: () => void;
}) {
  const save = useSaveMyPrayerRequest(meetingId);
  const remove = useRemoveMyPrayerRequest(meetingId);
  const [draft, setDraft] = useState(current ?? '');

  const trimmed = draft.trim();
  const unchanged = trimmed === (current ?? '').trim();

  const submit = () => {
    if (trimmed === '') {
      if (current) remove.mutate(undefined, { onSuccess: onClose });
      else onClose();
      return;
    }
    save.mutate(trimmed, { onSuccess: onClose });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Dein Gebetsanliegen"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            disabled={unchanged || (trimmed === '' && !current)}
            loading={save.isPending || (trimmed === '' && remove.isPending)}
            onClick={submit}
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <TextArea
          aria-label="Mein Gebetsanliegen"
          maxLength={2000}
          value={draft}
          placeholder="Wofür sollen die anderen beten?"
          onChange={(event) => setDraft(event.target.value)}
        />

        {current && (
          <button
            type="button"
            onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
            disabled={remove.isPending}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-stone-400 transition-colors hover:text-alert disabled:opacity-50"
          >
            <Trash2 size={13} />
            Anliegen entfernen
          </button>
        )}
      </div>
    </Sheet>
  );
}
