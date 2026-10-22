'use client';

/**
 * Eine Einheit für sich — der Abend, an dem etwas besprochen wurde.
 *
 * Ein eigener Ort: Die Liste unter dem Thema bleibt eine Übersicht, und eine
 * Einheit **ohne** Thema hat einen Platz, an dem sie stehen kann.
 *
 * Zwei Sorten teilen sich diesen Bildschirm, und der Unterschied ist eine
 * Kopfzeile:
 *
 * - **Teil eines Themas** — oben rechts steht, wozu sie gehört, als Weg
 *   dorthin und mit „1 von 3". Weitere Einheiten legt man dort an, auf der
 *   Seite des Themas, und nicht von einer seiner Einheiten aus.
 * - **Alleinstehend** — dort steht „Einzelne Einheit", und unter „Bearbeiten"
 *   das Angebot, ihr ein Überthema zu geben. Das ist der Moment, in dem aus
 *   einem Abend ein Thema wird, und er lässt sich nicht vorhersehen: Man hält
 *   den Abend und merkt danach, dass da mehr drinsteckt.
 *
 * **Die Seite ist zum Lesen da.** Wer die Einheit vorbereitet, hat unten statt
 * der Tab-Leiste „Bearbeiten" (`EditBar`), und dahinter liegt **ein** Sheet mit
 * allem, was sich ändern lässt: Titel, Zusammenfassung, Actionstep und wer sie
 * vorbereitet — dazu, abgesetzt, Überthema entfernen und Löschen. Ein
 * Formular und ein Speichern, nicht vier Stifte.
 *
 * **Der Actionstep steht hervorgehoben**, wie „Actionstep der Woche" auf
 * „Heute": Er ist das, was man vom Abend mitnimmt, und der eigene Haken sitzt
 * gleich in der Karte.
 */
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  FileText,
  Footprints,
  Info,
  Layers,
  Trash2,
  Unlink,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EditBar } from '@/components/layout/edit-bar';
import { Badge } from '@/components/ui/badge';
import { Button, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import {
  FieldLabel,
  InlineEdit,
  TextArea,
  TextInput,
} from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { PeopleListEditor } from '@/components/domain/people-list-editor';
import { PersonBubble } from '@/components/domain/person-bubble';
import { errorMessage } from '@/lib/api/errors';
import {
  useDeleteTopicSession,
  useMe,
  useNameTopic,
  usePeople,
  useSetActionstepDone,
  useSetSessionResponsibles,
  useTopicSession,
  useUnnameTopic,
  useUpdateTopicSession,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, hasStarted } from '@/lib/date';
import type { TopicSession } from '@/lib/api/types';

export function SessionDetailScreen({
  sessionId,
  von,
}: {
  sessionId: string;
  /** Woher man kam — bestimmt allein, wohin der Pfeil zurückführt. */
  von?: string | null;
}) {
  const query = useTopicSession(sessionId);

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  return <Loaded session={query.data.data} von={von} />;
}

function Loaded({
  session,
  von,
}: {
  session: TopicSession;
  von?: string | null;
}) {
  const [editSheet, setEditSheet] = useState(false);
  const [benennen, setBenennen] = useState(false);

  const allein = session.topic.standalone;
  const leute = session.responsibles.map((row) => row.person);

  /**
   * Dieselbe Grenze wie auf der Terminseite: einen Vorsatz für heute Abend hakt
   * man heute früh nicht ab. Nicht `session.held` — das ist tagesgenau und
   * gäbe den Haken erst am Tag darauf frei.
   */
  const abhakbar = Boolean(
    session.meeting &&
    session.meeting.status !== 'CANCELLED' &&
    hasStarted(session.meeting.date, session.meeting.startTime) &&
    session.actionstepText,
  );

  /**
   * Zurück dorthin, wo man herkam.
   *
   * Drei Wege führen hierher, und der Pfeil soll den zurückgehen, den man kam:
   * vom **Termin** (dann steht es in der Adresse), von der **Themenseite**, oder
   * bei einer alleinstehenden Einheit aus dem **Archiv**. Kein `router.back()`:
   * Das Ziel soll einen Neuladen überstehen, und ein geteilter Link soll dasselbe
   * tun wie der eigene Aufruf.
   *
   * Hängt die Einheit inzwischen an keinem Abend mehr, gibt es keinen Termin, zu
   * dem man zurückkönnte — dann gilt wieder die Herkunft aus der Sorte.
   */
  const zurueck =
    von === 'termin' && session.meeting
      ? { href: `/termin?id=${session.meeting.id}`, label: 'Zum Termin' }
      : allein
        ? { href: '/archiv', label: 'Archiv' }
        : { href: `/thema?id=${session.topic.id}`, label: 'Zum Thema' };

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      {/* Die Kopfzeile: links zurück, rechts, wozu das hier gehört. Bei einer
          alleinstehenden Einheit steht dort nicht „kein Thema" — das wäre eine
          Lücke, wo keine ist —, sondern was sie ist. */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={zurueck.href}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-terracotta-600"
        >
          <ArrowLeft size={14} />
          {zurueck.label}
        </Link>
        {allein ? (
          <Badge>
            <FileText size={11} />
            Einzelne Einheit
          </Badge>
        ) : (
          <TopicLink session={session} />
        )}
      </div>

      {/* Wie auf der Themenseite: das Symbol vor dem Titel — dort Ebenen für
          das Thema, hier das eine Blatt für den einen Abend. */}
      <header>
        <div className="flex items-start gap-3">
          <FileText
            aria-hidden
            className="mt-1 size-7 shrink-0 text-terracotta-500"
            strokeWidth={1.75}
          />
          <h1
            className={cn(
              'min-w-0 font-serif text-3xl leading-tight font-bold break-words',
              session.title ? 'text-stone-900' : 'text-stone-400',
            )}
          >
            {session.title ?? 'Ohne eigenen Titel'}
          </h1>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
          {session.meeting ? (
            <Link href={`/termin?id=${session.meeting.id}`}>
              <Badge variant={session.held ? 'neutral' : 'warn'}>
                <CalendarDays size={11} />
                {session.held ? 'gehalten am' : 'am'}{' '}
                {formatDay(session.meeting.date)}
                <ArrowUpRight className="size-3" />
              </Badge>
            </Link>
          ) : (
            <Badge>noch an keinem Abend</Badge>
          )}
        </div>
      </header>

      {!session.contentVisible && (
        <Card>
          <p className="text-sm text-stone-400">
            Zu sehen gibt es das am Abend — bis dahin gehört es denen, die es
            vorbereiten.
          </p>
        </Card>
      )}

      {session.contentVisible && session.actionstepText && (
        <ActionstepFeature session={session} abhakbar={abhakbar} />
      )}

      {session.contentVisible && (
        <section>
          <SectionTitle>Zusammenfassung</SectionTitle>
          <Card>
            <InlineEdit
              label="Zusammenfassung"
              multiline
              value={session.summaryText}
              emptyLabel="Noch nichts — hilft allen, die nicht da waren."
            />
          </Card>
        </section>
      )}

      {/* Wer sie vorbereitet — als Sprechblasen, wie am Thema. Geändert wird
          es im Sheet hinter „Bearbeiten". */}
      {leute.length > 0 && (
        <section>
          <SectionTitle>
            {session.held ? 'Gehalten von' : 'Vorbereitet von'}
          </SectionTitle>
          <div className="space-y-3">
            {leute.map((person) => (
              <PersonBubble
                key={person.id}
                person={person}
                note={
                  session.held
                    ? 'hat sie gehalten'
                    : allein && person.id === session.topic.ownerPersonId
                      ? 'hat sie angelegt'
                      : 'bereitet sie vor'
                }
              />
            ))}
          </div>
        </section>
      )}

      {session.mayEdit && (
        <EditBar editing={false} onToggle={() => setEditSheet(true)} />
      )}

      {/* Das Überthema fragt das Sheet: Es ist eine Änderung an der Einheit,
          und die Seite bleibt zum Lesen. Ein Sheet nach dem anderen, nicht
          zwei übereinander. */}
      {editSheet && (
        <SessionEditSheet
          session={session}
          onClose={() => setEditSheet(false)}
          onName={() => {
            setEditSheet(false);
            setBenennen(true);
          }}
        />
      )}

      {benennen && (
        <NameTopicSheet
          sessionId={session.id}
          sessionTitle={session.title}
          onClose={() => setBenennen(false)}
        />
      )}
    </div>
  );
}

/**
 * Wozu die Einheit gehört — oben rechts, als Weg dorthin.
 *
 * Es stand links als Überschrift über dem Titel und las sich wie ein zweiter
 * Titel. Oben rechts ist es, was es ist: der Ort darüber, eine Ebene höher,
 * wie das Abzeichen „Setlist · Platz 2" auf der Seite eines Lieds.
 */
function TopicLink({ session }: { session: TopicSession }) {
  return (
    <Link
      href={`/thema?id=${session.topic.id}`}
      className={cn(
        'group flex max-w-[68%] min-w-0 items-center gap-2.5 rounded-xl border border-terracotta-100 bg-terracotta-50/50 py-1.5 pr-2.5 pl-1.5 transition-colors hover:border-terracotta-300',
        PRESSABLE,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-terracotta-600">
        <Layers size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-bold tracking-widest whitespace-nowrap text-terracotta-600 uppercase">
          Teil von · {session.sessionIndex} von {session.sessionCount}
        </span>
        <span className="block truncate font-serif text-sm leading-tight font-bold text-stone-900">
          {session.topic.title ?? 'Thema ohne Titel'}
        </span>
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-stone-400 transition-colors group-hover:text-terracotta-600" />
    </Link>
  );
}

/**
 * Der Actionstep — hervorgehoben, wie „Actionstep der Woche" auf „Heute".
 *
 * Er ist das, was man vom Abend mitnimmt. Ab dem Abend sitzt der eigene Haken
 * gleich vorn; abgehakt wird die Karte grün, wie auf „Heute". Davor steht dort
 * das Symbol: einen Vorsatz für heute Abend hakt man heute früh nicht ab.
 */
function ActionstepFeature({
  session,
  abhakbar,
}: {
  session: TopicSession;
  abhakbar: boolean;
}) {
  const me = useMe();
  // Der Haken hängt am Termin. Ohne Abend wird der Knopf nie gezeigt, und der
  // Haken läuft ins Leere — Hooks gibt es trotzdem nur unbedingt.
  const setDone = useSetActionstepDone(session.meeting?.id ?? '');
  const done =
    abhakbar &&
    session.actionstepDone.some((row) => row.person.id === me.me?.id);

  return (
    <Card
      className={cn(
        'transition-colors',
        done
          ? 'border-success-line bg-success-bg/40'
          : 'border-terracotta-100 bg-terracotta-50/40',
      )}
    >
      <div className="flex items-start gap-4">
        {abhakbar ? (
          <button
            type="button"
            aria-pressed={done}
            aria-label={done ? 'Haken wieder wegnehmen' : 'Actionstep abhaken'}
            disabled={!me.me || setDone.isPending}
            onClick={() => setDone.mutate(!done)}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
              'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
              done
                ? 'bg-success-bg text-success'
                : 'bg-card text-stone-300 hover:text-terracotta-500',
            )}
          >
            {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          </button>
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-terracotta-500">
            <Footprints size={20} />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <p
            className={cn(
              'text-[10px] font-bold tracking-widest uppercase',
              done ? 'text-success' : 'text-terracotta-500',
            )}
          >
            Actionstep
          </p>
          <p className="mt-0.5 font-serif text-lg leading-snug font-bold whitespace-pre-line text-stone-900">
            {session.actionstepText}
          </p>
          {abhakbar && (
            <p className="mt-1 text-[11px] text-stone-400">
              {done
                ? 'Du hast es geschafft.'
                : 'Tipp auf den Kreis, wenn du es geschafft hast.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Alles, was sich an einer Einheit ändern lässt — in einem Sheet.
 *
 * **Wer vorbereitet, steht als Liste da**, mit einem „×" zum Herausnehmen und
 * darunter „Person hinzufügen", das die übrigen aufklappt — im selben Sheet,
 * nicht in einem zweiten darüber — gefragt ist „wer macht es", nicht „wer
 * könnte". Zwei Regeln stehen als fehlendes „×" da
 * statt als Fehlermeldung danach: Der letzte Platz bleibt besetzt, und bei
 * einer einzelnen Einheit bleibt, wer sie angelegt hat — es gibt kein Thema
 * darüber, an dem er sonst noch stünde.
 *
 * Gespeichert wird in zwei Schritten, aber mit **einem** Knopf: erst der Text
 * (mit `If-Match`, ein fremder Stand zeigt den Konflikt), dann die Leute —
 * und beides nur, wenn sich etwas geändert hat. Löschen und das Überthema
 * entfernen stehen abgesetzt darunter.
 *
 * **Bei einer einzelnen Einheit steht hier auch „Überthema hinzufügen"** —
 * und nicht als Karte auf der Seite, die jeden Besuch dieselbe Frage stellte.
 * `onName` schließt dieses Sheet und öffnet das des
 * Überthemas; wer vorher etwas geändert hat, wird gefragt, ob es verworfen
 * werden darf.
 */
function SessionEditSheet({
  session,
  onClose,
  onName,
}: {
  session: TopicSession;
  onClose: () => void;
  onName: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const people = usePeople();
  const update = useUpdateTopicSession(session.id);
  const setCrew = useSetSessionResponsibles(session.id);
  const remove = useDeleteTopicSession();
  const unname = useUnnameTopic(session.id);

  const [title, setTitle] = useState(session.title ?? '');
  const [summary, setSummary] = useState(session.summaryText ?? '');
  const [actionstep, setActionstep] = useState(session.actionstepText ?? '');
  const [crew, setCrewIds] = useState(() =>
    session.responsibles.map((row) => row.person.id),
  );
  const allein = session.topic.standalone;
  const festerPlatz = allein ? session.topic.ownerPersonId : null;
  const kommenderAbend =
    session.meeting && session.meeting.status !== 'CANCELLED' && !session.held
      ? session.meeting
      : null;

  // Wer schon vorbereitet, steht in der Antwort der Einheit; wer dazukommen
  // kann, in der Gruppe. Beides zusammen, damit eine Person, die gerade aus
  // der Gruppe ging, in der Liste nicht als leere Zeile dasteht.
  const byId = new Map(
    [
      ...session.responsibles.map((row) => row.person),
      ...(people.data ?? []),
    ].map((person) => [person.id, person]),
  );
  const dabei = crew.flatMap((id) => byId.get(id) ?? []);
  // Eingeladene zählen nicht: Wer sich noch nie angemeldet hat, kann nichts
  // vorbereiten.
  const dazu = (people.data ?? []).filter(
    (person) => person.acceptedAt !== null && !crew.includes(person.id),
  );

  const herausnehmen = (personId: string) =>
    setCrewIds((current) => current.filter((id) => id !== personId));
  const hinzunehmen = (personId: string) =>
    setCrewIds((current) => [...current, personId]);

  const trimmedTitle = title.trim();
  const text = {
    title: trimmedTitle,
    summaryText: summary.trim() === '' ? null : summary.trim(),
    actionstepText: actionstep.trim() === '' ? null : actionstep.trim(),
  };
  const changedText = {
    ...(text.title !== session.title ? { title: text.title } : {}),
    ...(text.summaryText !== session.summaryText
      ? { summaryText: text.summaryText }
      : {}),
    ...(text.actionstepText !== session.actionstepText
      ? { actionstepText: text.actionstepText }
      : {}),
  };
  const before = session.responsibles.map((row) => row.person.id).toSorted();
  const crewChanged = crew.toSorted().join() !== before.join();
  const saving = update.isPending || setCrew.isPending;

  const speichern = async () => {
    try {
      if (Object.keys(changedText).length > 0) {
        await update.mutateAsync(changedText);
      }
      if (crewChanged) await setCrew.mutateAsync(crew);
      toast.success('Gespeichert.');
      onClose();
    } catch {
      // Gemeldet haben die Hooks selbst — der Toast oder, bei einem fremden
      // Stand, der Hinweis oben im Sheet. Das Sheet bleibt offen.
    }
  };

  const benennen = async () => {
    if (Object.keys(changedText).length > 0 || crewChanged) {
      const ok = await confirm({
        title: 'Änderungen verwerfen?',
        body: 'Was du hier geändert hast, ist noch nicht gespeichert. Speichere zuerst, wenn du es behalten willst.',
        confirmLabel: 'Verwerfen',
      });
      if (!ok) return;
    }
    onName();
  };

  const aufloesen = async () => {
    const ok = await confirm({
      title: 'Überthema entfernen?',
      body: `„${session.topic.title ?? 'Das Thema'}" verschwindet damit, samt seiner Zusammenfassung über alle Abende. Die Einheit steht danach für sich — an demselben Abend wie jetzt.`,
      confirmLabel: 'Entfernen',
    });
    if (!ok) return;

    unname.mutate(undefined, {
      onSuccess: () => {
        toast.success('Steht jetzt für sich.');
        onClose();
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const loeschen = async () => {
    const ok = await confirm({
      title: `„${session.title ?? 'Diese Einheit'}" löschen?`,
      body: session.held
        ? 'Dieser Abend war schon — er verschwindet damit aus dem Archiv, samt Zusammenfassung und Actionstep.'
        : session.meeting
          ? 'Der Abend steht danach wieder ohne Thema da — wer dafür zuständig ist, bleibt es.'
          : 'Sie verschwindet samt allem, was darin steht.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(session.id, {
      onSuccess: () => {
        toast.success('Einheit gelöscht.');
        router.push(allein ? '/archiv' : `/thema?id=${session.topic.id}`);
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Einheit bearbeiten"
      subtitle={
        allein ? 'Einzelne Einheit' : (session.topic.title ?? undefined)
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            disabled={trimmedTitle === '' || crew.length === 0}
            onClick={() => void speichern()}
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

        <div>
          <FieldLabel>Titel</FieldLabel>
          <TextInput
            aria-label="Titel der Einheit"
            value={title}
            placeholder="Worum geht es an diesem Abend?"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Zusammenfassung</FieldLabel>
          <TextArea
            aria-label="Zusammenfassung"
            rows={4}
            value={summary}
            placeholder="Hilft allen, die nicht da waren."
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Actionstep</FieldLabel>
          <TextArea
            aria-label="Actionstep"
            rows={2}
            value={actionstep}
            placeholder="Was nimmt die Gruppe mit in die Woche?"
            onChange={(event) => setActionstep(event.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Vorbereitet von</FieldLabel>
          <p className="-mt-0.5 mb-2 text-[11px] leading-relaxed text-stone-400">
            {allein
              ? 'Wer hier steht, darf alles an dieser Einheit.'
              : 'Wer hier steht, darf diese Einheit ändern — sonst nichts am Thema.'}
          </p>

          <PeopleListEditor
            chosen={dabei}
            candidates={dazu}
            fixed={(person) =>
              person.id === festerPlatz
                ? 'hat sie angelegt — bleibt dabei'
                : crew.length === 1
                  ? 'eine Einheit braucht immer jemanden'
                  : null
            }
            onAdd={hinzunehmen}
            onRemove={herausnehmen}
          />

          {kommenderAbend && crew.some((id) => !before.includes(id)) && (
            <p className="mt-2 rounded-lg border border-info-line bg-info-bg p-2.5 text-xs leading-relaxed text-info">
              <Info size={13} className="mr-1.5 inline shrink-0 align-[-2px]" />
              Wer dazukommt, wird für {formatDay(kommenderAbend.date)} auch als
              zuständig eingetragen.
            </p>
          )}
        </div>

        {/* Zwei Abende, über denen nichts steht, sind kein Thema, sondern zwei
            Abende — deshalb steht hier nicht „weitere Einheit", sondern der
            Satz, der sagt, was dafür fehlt. */}
        {allein && (
          <div className="rounded-lg border border-dashed border-line-strong p-3">
            <p className="text-sm font-bold text-stone-800">
              Soll mehr daraus werden?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Für eine zweite Einheit braucht es ein Überthema — den Bogen, den
              die Abende zusammen spannen. Alles, was hier steht, bleibt dabei
              stehen.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => void benennen()}
            >
              <Layers size={15} />
              Überthema hinzufügen
            </Button>
          </div>
        )}

        {(session.mayUnname || session.mayDelete) && (
          <div className="space-y-1 border-t border-line pt-4">
            {/* Der Weg zurück, und nur solange genau eine Einheit am Thema
                hängt — das entscheidet der Server über `mayUnname`. Kein
                `text-alert`: Hier wird nichts gelöscht. */}
            {session.mayUnname && (
              <Button
                variant="ghost"
                className="w-full"
                loading={unname.isPending}
                onClick={() => void aufloesen()}
              >
                <Unlink size={15} />
                Überthema entfernen
              </Button>
            )}
            {/* Wer und wann, entscheidet der Server (`mayDeleteSession`). */}
            {session.mayDelete && (
              <Button
                variant="ghost"
                className="w-full text-alert"
                loading={remove.isPending}
                onClick={() => void loeschen()}
              >
                <Trash2 size={15} />
                Einheit löschen
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Ein Feld, ein Knopf — mehr ist das Überthema nicht. */
function NameTopicSheet({
  sessionId,
  sessionTitle,
  onClose,
}: {
  sessionId: string;
  sessionTitle: string | null;
  onClose: () => void;
}) {
  const name = useNameTopic(sessionId);
  const toast = useToast();
  const [title, setTitle] = useState('');

  const trimmed = title.trim();

  return (
    <Sheet
      open
      onClose={onClose}
      title="Überthema hinzufügen"
      subtitle={
        sessionTitle
          ? `„${sessionTitle}" wird damit die erste Einheit eines Themas.`
          : 'Diese Einheit wird damit die erste eines Themas.'
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={name.isPending}
            disabled={trimmed.length === 0}
            onClick={() =>
              name.mutate(
                { title: trimmed },
                {
                  onSuccess: () => {
                    toast.success(
                      'Jetzt ein Thema — weitere Einheiten können dazu.',
                    );
                    onClose();
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          >
            Übernehmen
          </Button>
        </div>
      }
    >
      <FieldLabel>Titel des Themas</FieldLabel>
      <TextInput
        aria-label="Titel des Themas"
        value={title}
        placeholder="Worum geht es über die Abende hinweg?"
        onChange={(event) => setTitle(event.target.value)}
      />
    </Sheet>
  );
}
