'use client';

/**
 * Eine Einheit für sich — der Abend, an dem etwas besprochen wurde.
 *
 * Sie hatte lange keinen eigenen Ort. Bearbeitet wurde sie in der Liste unter
 * ihrem Thema, was zwei Dinge zugleich kaputtmachte: Die Liste bestand aus
 * Karten voller Felder und war damit keine Übersicht mehr, und eine Einheit
 * **ohne** Thema hatte gar keinen Platz, an dem sie hätte stehen können.
 *
 * Zwei Sorten teilen sich diesen Bildschirm, und der Unterschied ist eine
 * Kopfzeile:
 *
 * - **Teil eines Themas** — oben steht, wozu sie gehört, samt Weg dorthin und
 *   „Einheit 2 von 3".
 * - **Alleinstehend** — dort steht stattdessen das Angebot, ihr ein Überthema
 *   zu geben. Das ist der Moment, in dem aus einem Abend ein Thema wird, und
 *   er lässt sich nicht vorhersehen: Man hält den Abend und merkt danach, dass
 *   da mehr drinsteckt.
 *
 * Wie überall ist der **Lesemodus der Normalfall**; die Stifte erscheinen auf
 * Knopfdruck, gespeichert wird trotzdem sofort.
 */
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  FileText,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { FieldLabel, InlineEdit, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ActionstepCheck } from '@/components/domain/actionstep-check';
import { AvatarStack } from '@/components/ui/avatar';
import { errorMessage } from '@/lib/api/errors';
import {
  useDeleteTopicSession,
  useNameTopic,
  useTopicSession,
  useUpdateTopicSession,
} from '@/lib/api/hooks';
import { formatDay, hasStarted } from '@/lib/date';
import { namesOf } from '@/lib/person';
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
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateTopicSession(session.id);
  const remove = useDeleteTopicSession();

  const [editing, setEditing] = useState(false);
  const [benennen, setBenennen] = useState(false);

  const darf = editing && session.mayEdit;
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

  const loeschen = async () => {
    const ok = await confirm({
      title: `„${session.title ?? 'Diese Einheit'}" löschen?`,
      body: session.meeting
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
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      <Link
        href={zurueck.href}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-terracotta-600"
      >
        <ArrowLeft size={14} />
        {zurueck.label}
      </Link>

      {update.conflict && <ConflictBanner onResolve={update.resolveConflict} />}

      {/* Die Kopfzeile: wozu das hier gehört. Bei einer alleinstehenden Einheit
          steht dort nicht „kein Thema" — das wäre eine Lücke, wo keine ist —,
          sondern was sie ist. */}
      {allein ? (
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
          <FileText size={12} />
          Einzelne Einheit
        </p>
      ) : (
        <div>
          <FieldLabel>Teil von</FieldLabel>
          <Link
            href={`/thema?id=${session.topic.id}`}
            className="inline-flex items-baseline gap-1 font-serif text-lg font-bold text-stone-900 hover:text-terracotta-600"
          >
            {session.topic.title ?? 'Thema ohne Titel'}
            <ArrowUpRight className="size-4 shrink-0 self-center text-stone-400" />
          </Link>
          <p className="mt-0.5 text-[11px] text-stone-400">
            Einheit {session.sessionIndex} von {session.sessionCount}
          </p>
        </div>
      )}

      <header>
        <InlineEdit
          label="Titel der Einheit"
          value={session.title}
          emptyLabel="Ohne eigenen Titel"
          placeholder="Worum geht es an diesem Abend?"
          className="font-serif text-3xl leading-tight font-bold text-stone-900"
          saving={update.isPending}
          onSave={darf ? (title) => update.mutate({ title }) : undefined}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {session.meeting ? (
            <Link href={`/termin?id=${session.meeting.id}`}>
              <Badge variant={session.held ? 'neutral' : 'topic'}>
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

        {leute.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <AvatarStack people={leute} size="xs" />
            <span className="text-[11px] text-stone-400">
              {session.held ? 'gehalten von' : 'vorbereitet von'}{' '}
              {namesOf(leute)}
            </span>
          </div>
        )}
      </header>

      {!session.contentVisible && (
        <Card>
          <p className="text-sm text-stone-400">
            Zu sehen gibt es das am Abend — bis dahin gehört es denen, die es
            vorbereiten.
          </p>
        </Card>
      )}

      {session.contentVisible && (
        <>
          <section>
            <SectionTitle>Zusammenfassung</SectionTitle>
            <Card>
              <InlineEdit
                label="Zusammenfassung"
                multiline
                value={session.summaryText}
                emptyLabel="Noch nichts — hilft allen, die nicht da waren."
                saving={update.isPending}
                onSave={
                  darf
                    ? (summaryText) => update.mutate({ summaryText })
                    : undefined
                }
              />
            </Card>
          </section>

          <section>
            <SectionTitle>Actionstep</SectionTitle>
            <Card>
              <InlineEdit
                label="Actionstep"
                value={session.actionstepText}
                emptyLabel="Noch kein Actionstep für die Woche"
                saving={update.isPending}
                onSave={
                  darf
                    ? (actionstepText) => update.mutate({ actionstepText })
                    : undefined
                }
              />
              {/* Abhaken darf jede:r für sich, auch wer den Text nicht ändern
                  darf — es ist der eigene Vorsatz. */}
              {abhakbar && (
                <ActionstepCheck
                  meetingId={session.meeting!.id}
                  done={session.actionstepDone}
                />
              )}
            </Card>
          </section>
        </>
      )}

      {session.mayEdit && (
        <Weitergehen
          allein={allein}
          topicId={session.topic.id}
          onName={() => setBenennen(true)}
        />
      )}

      {session.mayEdit && (
        <Button
          variant={editing ? 'primary' : 'secondary'}
          className="w-full"
          onClick={() => setEditing((current) => !current)}
        >
          {editing ? (
            <>
              <Check size={16} /> Fertig
            </>
          ) : (
            <>
              <Pencil size={14} /> Bearbeiten
            </>
          )}
        </Button>
      )}

      {/* Gehaltenes bleibt: ein Abend, der war, ist das Protokoll dessen, was
          war. */}
      {session.mayEdit && !session.held && (
        <Button
          variant="ghost"
          className="w-full text-alert"
          loading={remove.isPending}
          onClick={loeschen}
        >
          <Trash2 size={15} />
          Einheit löschen
        </Button>
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
 * Der Weg nach oben — und warum er bei einer alleinstehenden Einheit über das
 * Überthema führt.
 *
 * Zwei Abende, über denen nichts steht, sind kein Thema, sondern zwei Abende.
 * Deshalb steht hier nicht einfach ein gesperrter Knopf, sondern der Satz, der
 * sagt, was fehlt — und gleich daneben, wie man es bekommt.
 */
function Weitergehen({
  allein,
  topicId,
  onName,
}: {
  allein: boolean;
  topicId: string;
  onName: () => void;
}) {
  if (!allein) {
    return (
      <Link href={`/thema?id=${topicId}`} className="block">
        <Button variant="secondary" className="w-full">
          <Layers size={15} />
          Weitere Einheit im Thema anlegen
        </Button>
      </Link>
    );
  }

  return (
    <Card className="space-y-3 border-dashed">
      <div>
        <p className="text-sm font-bold text-stone-800">
          Soll mehr daraus werden?
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          Für eine zweite Einheit braucht es ein Überthema — den Bogen, den die
          Abende zusammen spannen. Alles, was hier steht, bleibt dabei stehen.
        </p>
      </div>
      <Button variant="secondary" className="w-full" onClick={onName}>
        <Plus size={15} />
        Überthema hinzufügen
      </Button>
    </Card>
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
