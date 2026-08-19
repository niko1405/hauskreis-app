'use client';

/**
 * Das Thema des Abends — vier Zustände, einer davon neu.
 *
 * 1. Baustein aus → die Sektion gibt es gar nicht (entschieden vom Aufrufer).
 * 2. **Niemand zugeteilt** → „Noch kein Zuständiger."
 * 3. **Zugeteilt, aber noch nichts gewählt** → wer dran ist, sieht die Optionen;
 *    alle anderen sehen, dass es sie gibt und sonst nichts.
 * 4. **Gewählt** → das Thema als Überschrift, darunter *dieser* Abend.
 *
 * Die Hierarchie ist der Punkt der Sektion: oben steht, wozu der Abend gehört,
 * darunter, was an ihm dran ist. Vorher standen beide Titel gleichrangig und man
 * musste raten, welcher der größere war.
 *
 * **Hier wird nichts geändert, hier wird gelesen.** Thema und Einheit sind
 * beide nur Links auf ihre Seiten. Die Einheit hatte einmal keine eigene, und
 * solange das so war, mussten die Stifte hier stehen; seit sie eine hat, wären
 * es zwei Orte für dieselbe Sache — und einer davon kann weniger: kein Löschen,
 * kein Überthema, keine Beteiligten. Was der Abend *selbst* über sich sagt
 * (Titel, Uhrzeit, Infos, Rollen), ändert man weiterhin auf dieser Seite.
 *
 * **Wer was sieht.** Der Inhalt einer noch nicht gehaltenen Einheit gehört bis
 * 18 Uhr am Termintag denen, die ihn vorbereiten — der Actionstep der nächsten
 * Woche eine Woche zu früh für alle wäre das Gegenteil von dem, wozu er da ist.
 * Entschieden hat das der Server: er liefert die Felder dann als `null` und
 * setzt `contentVisible: false`. Hier steht nur, was man davon sieht.
 */
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { FieldLabel, InlineEdit } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useTopic } from '@/lib/api/hooks';
import { formatDay } from '@/lib/date';
import { namesOf } from '@/lib/person';
import type { Meeting, PersonRef, TopicSessionInTopic } from '@/lib/api/types';

export function TopicCard({
  meeting,
  responsibles,
  /** Ob gewählt werden darf — nur die Zugeteilten. */
  mayChoose,
  saving,
  onChoose,
  children,
}: {
  meeting: Meeting;
  responsibles: PersonRef[];
  mayChoose: boolean;
  saving: boolean;
  onChoose: () => void;
  /** Der Abhak-Block, den nur die Detailseite kennt. */
  children?: React.ReactNode;
}) {
  const session = meeting.topicSession;
  const sichtbar = session?.contentVisible ?? false;

  return (
    <section>
      <SectionTitle>Thema</SectionTitle>
      <Card className="space-y-4">
        {!session && <NothingChosen responsibles={responsibles} />}
        {session && !sichtbar && <Withheld responsibles={responsibles} />}

        {session && sichtbar && (
          <>
            {/* Eine Einheit ohne Thema bekommt hier keine leere Kopfzeile.
                „Zugehöriges Thema: —" behauptete eine Lücke, wo keine ist. */}
            {!session.topic.standalone && <TopicHeading session={session} />}

            {/* Der Kasten ist der Weg zur Einheit. `InlineEdit` ohne `onSave`
                rendert nur einen Absatz — im Link sitzt also nichts
                Anklickbares, was mit ihm um den Druck streiten könnte. */}
            <Link
              href={`/einheit?id=${session.id}&von=termin`}
              className={cn(
                'group relative block rounded-lg border border-line-strong p-4 pt-5',
                'transition-colors hover:border-terracotta-300',
                PRESSABLE,
                session.topic.standalone ? 'mt-2' : 'mt-6',
              )}
            >
              <span
                className={cn(
                  'absolute -top-2.5 left-3 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide',
                  session.topic.standalone
                    ? 'border border-line-strong bg-canvas text-stone-500'
                    : 'bg-terracotta-600 text-white',
                )}
              >
                {session.topic.standalone
                  ? 'Einzelne Einheit'
                  : `Einheit ${session.sessionIndex} von ${session.sessionCount}`}
              </span>

              <div className="flex items-baseline gap-1">
                <InlineEdit
                  label="Titel dieses Abends"
                  value={session.title}
                  emptyLabel="Noch ohne eigenen Titel"
                  className="min-w-0 flex-1 font-serif text-2xl font-bold text-stone-900"
                />
                <ArrowUpRight className="size-4 shrink-0 self-center text-stone-400 transition-colors group-hover:text-terracotta-600" />
              </div>

              <div className="mt-4">
                <FieldLabel>Zusammenfassung</FieldLabel>
                <InlineEdit
                  label="Zusammenfassung"
                  multiline
                  value={session.summaryText}
                  emptyLabel="Noch nichts — hilft allen, die nicht da waren."
                />
              </div>

              <div className="mt-4 rounded-lg border border-line-strong bg-canvas p-3">
                <FieldLabel>Actionstep</FieldLabel>
                <InlineEdit
                  label="Actionstep"
                  value={session.actionstepText}
                  emptyLabel="Noch kein Actionstep für die Woche"
                />
              </div>
            </Link>

            {/* Der Haken bleibt hier und wandert nicht mit: Er hängt am Termin
                und gilt pro Person, während der Text der Einheit gehört. Er
                steht deshalb unter dem Kasten statt darin — in einem Link hat
                ein Knopf nichts verloren. */}
            {session.actionstepText && children}

            {/* Eine Hülle hat keine Geschwister — die Klappe wäre immer leer. */}
            {!session.topic.standalone && session.sessionCount > 1 && (
              <OtherSessions
                topicId={session.topic.id}
                exclude={session.id}
                count={session.sessionCount - 1}
              />
            )}
          </>
        )}

        {mayChoose && (
          <Button size="sm" loading={saving} onClick={onChoose}>
            {session ? 'Anderes Thema wählen' : 'Thema wählen'}
          </Button>
        )}
      </Card>
    </section>
  );
}

/** Die Kopfzeile: wozu dieser Abend gehört, und der Weg dorthin. */
function TopicHeading({
  session,
}: {
  session: NonNullable<Meeting['topicSession']>;
}) {
  return (
    <div>
      <FieldLabel>Zugehöriges Thema</FieldLabel>
      <Link
        href={`/thema?id=${session.topic.id}`}
        className="inline-flex items-baseline gap-1 font-serif text-xl font-bold text-stone-900 hover:text-terracotta-600"
      >
        {session.topic.title ?? 'Thema ohne Titel'}
        <ArrowUpRight className="size-4 shrink-0 self-center text-stone-400" />
      </Link>
    </div>
  );
}

/**
 * Die anderen Abende desselben Themas, zum Ausklappen.
 *
 * Geladen wird erst beim Öffnen — und über `GET …/topics/:id`, wo die
 * Sichtbarkeitsregeln schon stehen. Ein zweiter Weg an dieselbe Frage wäre ein
 * zweiter Weg, sie falsch zu beantworten.
 */
function OtherSessions({
  topicId,
  exclude,
  count,
}: {
  topicId: string;
  exclude: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const query = useTopic(open ? topicId : undefined);

  const andere = (query.data?.data.sessions ?? []).filter(
    (session) => session.id !== exclude && session.meeting,
  );

  return (
    <div className="rounded-lg border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span className="text-xs font-semibold text-stone-500">
          Weitere Einheiten ({count})
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-stone-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ul className="space-y-2 border-t border-line p-3">
          {query.isLoading && (
            <li className="text-xs text-stone-400">Wird geladen …</li>
          )}
          {andere.map((session) => (
            <li key={session.id}>
              <OtherSessionRow session={session} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OtherSessionRow({ session }: { session: TopicSessionInTopic }) {
  return (
    <Link
      href={`/termin?id=${session.meeting?.id}`}
      className="block rounded-md p-2 transition-colors hover:bg-canvas"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-roboto-slab text-sm font-bold text-stone-800">
          {session.title ?? 'Ohne eigenen Titel'}
        </span>
        <span className="shrink-0 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
          {session.meeting && formatDay(session.meeting.date)}
        </span>
      </div>
      {session.summaryText && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">
          {session.summaryText}
        </p>
      )}
      {!session.contentVisible && (
        <p className="mt-1 text-xs text-stone-400">
          Zu sehen gibt es das am Abend.
        </p>
      )}
    </Link>
  );
}

/** Zustand 2 und 3: es steht noch nichts, und warum. */
function NothingChosen({ responsibles }: { responsibles: PersonRef[] }) {
  if (responsibles.length === 0) {
    return (
      <p className="text-sm text-stone-400">
        Noch kein Zuständiger — trag oben jemanden ein.
      </p>
    );
  }

  return (
    <p className="text-sm text-stone-400">
      {namesOf(responsibles)} {responsibles.length > 1 ? 'sind' : 'ist'} für das
      Thema zuständig — hier gibt es noch nichts zu sehen.
    </p>
  );
}

/**
 * Zustand 4, aber noch nicht freigegeben.
 *
 * Bewusst dieselbe Sprache wie Zustand 3: dass jemand schon etwas vorbereitet
 * hat, ist keine Neuigkeit, die vor dem Abend jemanden weiterbringt.
 */
function Withheld({ responsibles }: { responsibles: PersonRef[] }) {
  return (
    <p className="text-sm text-stone-400">
      {responsibles.length > 0 ? (
        <>
          {namesOf(responsibles)}{' '}
          {responsibles.length > 1 ? 'bereiten' : 'bereitet'} etwas vor — zu
          sehen gibt es das am Abend.
        </>
      ) : (
        <>Etwas ist vorbereitet — zu sehen gibt es das am Abend.</>
      )}
    </p>
  );
}
