'use client';

/**
 * Ein Thema und seine Einheiten.
 *
 * Die Seite, die es vorher nicht geben konnte: ein Thema war ein Titel und ein
 * Status, alles Inhaltliche hing an den Terminen. Jetzt trägt es einen Bogen
 * über alle Abende (`summaryText`) und darunter, was an jedem einzelnen war.
 *
 * Sie ist außerdem der Ort, an dem man **vorarbeitet**: eine Einheit anlegen,
 * ohne dass ein Dienstag feststeht. Vorher ging nur der umgekehrte Weg — erst
 * einen Termin belegen, dann dort schreiben —, und wer im Zug eine Idee hatte,
 * hatte keinen Platz dafür.
 *
 * **Was hier fehlt, fehlt absichtlich.** Unfertige Einheiten liefert der Server
 * nur an Owner und Mitarbeitende aus. Für alle anderen gibt es sie nicht, und
 * das ist keine Ausblendung im UI, sondern eine Entscheidung eine Ebene tiefer.
 *
 * Wie am vergangenen Termin ist der **Lesemodus der Normalfall**: Wer zum
 * Thema gehört, hat unten statt der Tab-Leiste „Bearbeiten" (`EditBar`). Im
 * Bearbeitungsmodus stehen die Leute, das Anlegen und Holen von Einheiten und
 * das Löschen; Titel, Zusammenfassung und Status stehen hinter einem
 * „Bearbeiten" oben rechts in **einem** Sheet. Sie hatten einmal je einen
 * Stift, und drei Felder derselben Sache waren drei Orte zum Speichern.
 *
 * **Ein Thema ohne Einheit fragt nach der ersten**, auch ohne
 * Bearbeitungsmodus: Dort ist sie das Einzige, was zu tun ist. Ab der ersten
 * steht das Hinzufügen nur noch im Bearbeitungsmodus.
 *
 * **Hinzufügen heißt: neu vorbereiten oder eine einzelne holen.** Wer einen
 * Abend für sich vorbereitet oder gehalten hat und merkt, dass er zu diesem
 * Thema gehört, holt ihn hier herein (nur eigene, `useAdoptableSessions`); die
 * Einheit wechselt das Thema, ihre leere Hülle verschwindet.
 */
import {
  ArrowLeft,
  FileText,
  Footprints,
  Layers,
  MessageCircleMore,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EditBar } from '@/components/layout/edit-bar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { FieldLabel, TextArea, TextInput } from '@/components/ui/field';
import { PersonBubble } from '@/components/domain/person-bubble';
import { Sheet } from '@/components/ui/sheet';
import { SwitchRow } from '@/components/ui/switch';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { PeoplePickerSheet } from '@/components/domain/people-picker-sheet';
import { errorMessage } from '@/lib/api/errors';
import {
  useAdoptSession,
  useAdoptableSessions,
  useCreateTopicSession,
  useDeleteTopic,
  useAddCollaborator,
  useRemoveCollaborator,
  useTopic,
  useUpdateTopic,
} from '@/lib/api/hooks';
import { formatDay } from '@/lib/date';
import { cn } from '@/lib/cn';
import { namesOf } from '@/lib/person';
import type {
  AdoptableSession,
  Topic,
  TopicSessionInTopic,
} from '@/lib/api/types';

export function TopicDetailScreen({ topicId }: { topicId: string }) {
  const query = useTopic(topicId);

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  return <Loaded topic={query.data.data} />;
}

function Loaded({ topic }: { topic: Topic }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateTopic(topic.id);
  const remove = useDeleteTopic();

  const [editing, setEditing] = useState(false);
  const [editSheet, setEditSheet] = useState(false);
  const [adding, setAdding] = useState(false);

  const darfSchreiben = editing && topic.mayEdit;
  const leer = topic.sessions.length === 0;

  const gehalten = topic.sessions.filter((session) => session.held);
  const kommend = topic.sessions.filter(
    (session) => session.meeting && !session.held,
  );
  const entwuerfe = topic.sessions.filter((session) => !session.meeting);

  const deleteTopic = async () => {
    const ok = await confirm({
      title: `„${topic.title ?? 'Thema ohne Titel'}" löschen?`,
      body: leer
        ? 'Es hängt an keinem Abend — es geht nichts verloren.'
        : `Alle ${topic.sessions.length} Einheiten gehen mit, samt Zusammenfassungen und Actionsteps. Die Abende selbst bleiben stehen und stehen danach wieder ohne Thema da.`,
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(topic.id, {
      onSuccess: () => {
        toast.success('Thema gelöscht.');
        router.push('/archiv');
      },
    });
  };

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/archiv"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-terracotta-600"
        >
          <ArrowLeft size={14} />
          Archiv
        </Link>
        {/* Rechts der Stand, wie „Teil von" auf der Seite einer Einheit; im
            Bearbeitungsmodus daneben der Weg zu Titel, Text und Stand. */}
        <div className="flex items-center gap-2">
          <Badge
            variant={topic.status === 'RUNNING' ? 'terracotta' : 'neutral'}
            className="tracking-wider uppercase"
          >
            {topic.status === 'RUNNING' ? 'Läuft' : 'Abgeschlossen'}
          </Badge>
          {darfSchreiben && (
            <Button
              variant="secondary"
              size="sm"
              disabled={update.isPending}
              onClick={() => setEditSheet(true)}
            >
              <Pencil size={13} /> Bearbeiten
            </Button>
          )}
        </div>
      </div>

      {update.conflict && <ConflictBanner onResolve={update.resolveConflict} />}

      <header className="flex items-start gap-3">
        <Layers
          aria-hidden
          className="mt-1 size-8 shrink-0 text-terracotta-500"
          strokeWidth={1.75}
        />
        <h1
          className={cn(
            'min-w-0 font-serif text-4xl leading-tight font-bold break-words',
            topic.title ? 'text-stone-900' : 'text-stone-400',
          )}
        >
          {topic.title ?? 'Thema ohne Titel'}
        </h1>
      </header>

      {/* Der rote Faden — mit einem Hauch Schein, weil er das ist, worum es
          geht. Mehr wäre ein Leuchtschild. */}
      <section aria-label="Worum es geht">
        <Card className="flex gap-3 border-terracotta-400/40 shadow-[0_0_22px_-10px_var(--color-terracotta-500)] shadow-terracotta-500/30">
          <MessageCircleMore
            aria-hidden
            size={20}
            className="mt-0.5 shrink-0 text-terracotta-500"
          />
          <p
            className={cn(
              'min-w-0 font-serif text-[15px] leading-relaxed whitespace-pre-line italic',
              topic.summaryText ? 'text-stone-700' : 'text-stone-400',
            )}
          >
            {topic.summaryText ??
              'Noch nichts — der rote Faden über alle Abende.'}
          </p>
        </Card>
      </section>

      <People topic={topic} editing={editing} />

      {gehalten.length > 0 && (
        <SessionList title="Einheiten" sessions={gehalten} von={1} />
      )}

      {kommend.length > 0 && (
        <SessionList
          title="Steht noch bevor"
          sessions={kommend}
          // Die Nummerierung läuft über die Abschnitte hinweg weiter: sie zählt
          // die Abende des Themas, nicht die Zeilen dieser Liste.
          von={gehalten.length + 1}
        />
      )}

      {/* Nur der eigene Blick: für alle anderen liefert der Server sie gar
          nicht erst aus. */}
      {entwuerfe.length > 0 && (
        <SessionList
          title="Angefangen, noch ohne Abend"
          hint="Sichtbar nur für dich und alle, die am Thema mitarbeiten. Beim Wählen an einem Termin lässt sich das hier aufnehmen."
          sessions={entwuerfe}
          von={gehalten.length + kommend.length + 1}
        />
      )}

      {/* Ohne Einheit ist die erste das Einzige, was zu tun ist — auch ohne
          Bearbeitungsmodus. Danach steht das Hinzufügen dort. */}
      {topic.mayEdit && (editing || leer) && (
        <section>
          {leer && <SectionTitle>Einheiten</SectionTitle>}
          {leer && (
            <p className="mb-2 text-xs text-stone-400">
              Noch keine Einheit. Bereite die erste vor — oder hol eine
              einzelne, die du schon angelegt hast, dazu.
            </p>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-terracotta-100 bg-terracotta-50/30 p-3 text-sm font-semibold text-terracotta-700 transition-colors hover:bg-terracotta-50"
          >
            <Plus size={16} /> Einheit hinzufügen
          </button>
        </section>
      )}

      {editing && topic.mayDelete && (
        <Button
          variant="ghost"
          className="w-full text-alert"
          loading={remove.isPending}
          onClick={deleteTopic}
        >
          <Trash2 size={15} />
          Thema löschen
        </Button>
      )}

      {topic.mayEdit && (
        <EditBar
          editing={editing}
          onToggle={() => setEditing((current) => !current)}
        />
      )}

      {adding && (
        <AddSessionSheet topic={topic} onClose={() => setAdding(false)} />
      )}

      {/* Der Schlüssel wirft den Entwurf weg, sobald eine neue Fassung kommt. */}
      <TopicEditSheet
        key={topic.version}
        open={editSheet}
        topic={topic}
        saving={update.isPending}
        onClose={() => setEditSheet(false)}
        onSave={(input) => {
          // Nichts geändert heißt nichts schicken.
          if (Object.keys(input).length === 0) {
            setEditSheet(false);
            return;
          }
          update.mutate(input, {
            onSuccess: () => {
              setEditSheet(false);
              toast.success('Gespeichert.');
            },
          });
        }}
      />
    </div>
  );
}

/**
 * Titel, Zusammenfassung und Status in einem Sheet — ein Speichern für alle
 * drei, und geschickt wird nur, was sich geändert hat.
 */
function TopicEditSheet({
  open,
  topic,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  topic: Topic;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    title?: string | null;
    summaryText?: string | null;
    status?: Topic['status'];
  }) => void;
}) {
  const [title, setTitle] = useState(topic.title ?? '');
  const [summary, setSummary] = useState(topic.summaryText ?? '');
  const [done, setDone] = useState(topic.status === 'COMPLETED');

  const close = () => {
    setTitle(topic.title ?? '');
    setSummary(topic.summaryText ?? '');
    setDone(topic.status === 'COMPLETED');
    onClose();
  };

  const speichern = () => {
    const nextTitle = title.trim() === '' ? null : title.trim();
    const nextSummary = summary.trim() === '' ? null : summary.trim();
    const nextStatus = done ? 'COMPLETED' : 'RUNNING';
    onSave({
      ...(nextTitle !== topic.title ? { title: nextTitle } : {}),
      ...(nextSummary !== topic.summaryText
        ? { summaryText: nextSummary }
        : {}),
      ...(nextStatus !== topic.status ? { status: nextStatus } : {}),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Thema bearbeiten"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close}>
            Abbrechen
          </Button>
          <Button className="flex-1" loading={saving} onClick={speichern}>
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Titel</FieldLabel>
          <TextInput
            aria-label="Titel des Themas"
            value={title}
            placeholder="Worum geht es?"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel>Worum es geht</FieldLabel>
          <TextArea
            aria-label="Zusammenfassung des Themas"
            rows={5}
            value={summary}
            placeholder="Der rote Faden über alle Abende."
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>
        <SwitchRow
          label="Abgeschlossen"
          description={
            done
              ? 'Das Thema ist durch. Eine neue Einheit öffnet es wieder.'
              : 'Das Thema läuft noch.'
          }
          checked={done}
          onChange={setDone}
        />
      </div>
    </Sheet>
  );
}

/**
 * Owner und Mitarbeitende — die **thema-weite** Ebene.
 *
 * Nicht zu verwechseln mit denen, die eine einzelne Einheit vorbereiten: Die
 * stehen unten an ihrem Abend und dürfen genau ihn schreiben. Wer hier steht,
 * darf **jedes** dieser Felder ändern und neue Einheiten anlegen.
 *
 * Der Unterschied ist neu und der Grund für den Knopf. Vorher rutschte jede:r,
 * der einmal einen Abend hielt, automatisch hier herein — Hoheit über ein Thema,
 * das über Monate läuft, als Nebenwirkung einer Zuteilung. Ab jetzt ist es eine
 * Entscheidung, und die trifft der Owner (`mayDelete` trägt dieselbe
 * Bedingung).
 *
 * Wer entfernt wird, verliert das Bearbeitungsrecht am Thema — bleibt aber
 * unten an den Abenden stehen, die er gehalten hat. Das ist Geschichte und kein
 * Recht.
 */
function People({ topic, editing }: { topic: Topic; editing: boolean }) {
  const confirm = useConfirm();
  const toast = useToast();
  const addCollaborator = useAddCollaborator(topic.id);
  const removeCollaborator = useRemoveCollaborator(topic.id);
  const [waehlen, setWaehlen] = useState(false);

  const dabei = [
    ...(topic.owner ? [topic.owner.id] : []),
    ...topic.collaborators.map(({ person }) => person.id),
  ];

  const dazu = (personId: string) =>
    addCollaborator.mutate(personId, {
      onSuccess: () => {
        toast.success('Dazugenommen.');
        setWaehlen(false);
      },
      onError: (error) => toast.error(errorMessage(error)),
    });

  const entfernen = async (personId: string, name: string) => {
    const ok = await confirm({
      title: `${name} entfernen?`,
      body: 'Die Person kann danach nichts mehr an diesem Thema ändern. An den Abenden, die sie gehalten hat, bleibt sie stehen.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (!ok) return;

    removeCollaborator.mutate(personId, {
      onSuccess: () => toast.success(`${name} entfernt.`),
    });
  };

  return (
    <section>
      <SectionTitle>Wer daran arbeitet</SectionTitle>
      <div className="space-y-3">
        {topic.owner && (
          <PersonBubble person={topic.owner} note="hat es angefangen" />
        )}

        {topic.collaborators.map(({ person }) => (
          <PersonBubble
            key={person.id}
            person={person}
            note="arbeitet mit"
            action={
              editing &&
              topic.mayDelete && (
                <IconButton
                  label={`${person.name} entfernen`}
                  className="size-8"
                  disabled={removeCollaborator.isPending}
                  onClick={() => entfernen(person.id, person.name)}
                >
                  <UserMinus size={14} />
                </IconButton>
              )
            }
          />
        ))}

        {!topic.owner && topic.collaborators.length === 0 && (
          <p className="text-sm text-stone-400">
            Niemand eingetragen — dann darf hier jede:r etwas ändern.
          </p>
        )}

        {editing && topic.mayDelete && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={addCollaborator.isPending}
            onClick={() => setWaehlen(true)}
          >
            <UserPlus size={15} />
            Mitwirkende hinzufügen
          </Button>
        )}
      </div>

      {waehlen && (
        <PeoplePickerSheet
          title="Wer arbeitet am Thema mit?"
          subtitle="Sie darf danach jede Einheit ändern und neue anlegen. Für nur einen Abend genügt es, sie dort als Mitwirkende einzutragen."
          excludeIds={dabei}
          saving={addCollaborator.isPending}
          onPick={dazu}
          onClose={() => setWaehlen(false)}
        />
      )}
    </section>
  );
}
/**
 * Die Einheiten als Zeitstrahl.
 *
 * Vorher war jede eine Karte mit drei Feldern darin. Das war bequem — man
 * konnte alles an einem Ort ändern — und machte die Liste als Liste unbrauchbar:
 * Bei vier Abenden musste man scrollen, um zu sehen, dass es vier sind, und die
 * Reihenfolge, die ein Thema ja ausmacht, ging zwischen den Feldern unter.
 *
 * Jetzt trägt jede Zeile nur, was man beim Überfliegen braucht, und der Inhalt
 * steht auf ihrer eigenen Seite. Die Nummern an der Linie sind der Punkt: Sie
 * sagen, dass hier etwas aufeinander folgt.
 */
function SessionList({
  title,
  hint,
  sessions,
  /** Womit die Nummerierung anfängt — die Liste ist über drei Abschnitte verteilt. */
  von,
  action,
}: {
  title: string;
  hint?: string;
  sessions: TopicSessionInTopic[];
  von: number;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="mb-2 text-xs text-stone-400">{hint}</p>}
      <ul>
        {sessions.map((session, index) => (
          <li key={session.id}>
            <SessionRow
              session={session}
              nummer={von + index}
              /* Die Linie verbindet zwei Punkte; nach dem letzten gibt es
                 nichts mehr zu verbinden. */
              letzte={index === sessions.length - 1}
            />
          </li>
        ))}
      </ul>
      {action && (
        <div className={sessions.length > 0 ? 'mt-3' : ''}>{action}</div>
      )}
    </section>
  );
}

/**
 * Eine Zeile am Zeitstrahl.
 *
 * Der Weg hinein führt auf die eigene Seite der Einheit — auch aus dem
 * Bearbeitungsmodus heraus. Zwei Orte, an denen sich derselbe Text ändern
 * lässt, sind einer zu viel; hier steht, *dass* es sie gibt, dort, was drin
 * steht.
 */
function SessionRow({
  session,
  nummer,
  letzte,
}: {
  session: TopicSessionInTopic;
  nummer: number;
  letzte: boolean;
}) {
  const leute = session.responsibles.map((row) => row.person);

  return (
    <Link
      href={`/einheit?id=${session.id}`}
      className={cn('group flex gap-3', PRESSABLE)}
    >
      {/* Die Spur: Punkt und Linie. Sie gehört nicht in die Karte, sondern
          neben sie — sonst hörte sie an jeder Kante auf. */}
      <div className="flex w-6 shrink-0 flex-col items-center">
        <span
          className={cn(
            'mt-3 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            session.held
              ? 'bg-terracotta-500 text-white'
              : 'border border-line-strong bg-card text-stone-400',
          )}
        >
          {nummer}
        </span>
        {!letzte && <span className="w-px flex-1 bg-line" />}
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <div className="rounded-lg border border-line bg-card p-3 transition-colors group-hover:border-line-strong">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 flex-1 truncate font-serif text-sm font-bold text-stone-900">
              {session.title ?? 'Ohne eigenen Titel'}
            </p>
            <span className="shrink-0 text-[11px] font-medium text-stone-400">
              {session.meeting ? formatDay(session.meeting.date) : 'offen'}
            </span>
          </div>

          {leute.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-stone-400">
              {session.held ? 'gehalten von' : 'vorbereitet von'}{' '}
              {namesOf(leute)}
            </p>
          )}

          {/* Nur, *dass* es einen gibt. Der Text steht auf der eigenen Seite —
              hier wären es zwei Zeilen, die jede Übersicht wieder auffressen. */}
          {session.actionstepText && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-terracotta-700">
              <Footprints size={11} />
              Actionstep
            </p>
          )}

          {!session.contentVisible && (
            <p className="mt-1 text-[11px] text-stone-400">
              Zu sehen gibt es das am Abend.
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
/**
 * Eine Einheit hinzufügen — neu vorbereiten oder eine einzelne holen.
 *
 * Ein Sheet mit Schritten, keine gestapelten Sheets (wie `song-suggest-sheet`).
 * Vorn steht „Neue Einheit vorbereiten", darunter die eigenen einzelnen
 * Einheiten: Ein Tipp fragt nach und holt sie ins Thema. Gibt es keine, fehlt
 * der Abschnitt — eine leere Überschrift wäre eine Frage ohne Angebot.
 */
function AddSessionSheet({
  topic,
  onClose,
}: {
  topic: Topic;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'start' | 'neu'>('start');
  const toast = useToast();
  const confirm = useConfirm();
  const adoptable = useAdoptableSessions(topic.id, step === 'start');
  const adopt = useAdoptSession(topic.id);
  const create = useCreateTopicSession(topic.id);

  const [title, setTitle] = useState('');
  const [actionstep, setActionstep] = useState('');
  const [summary, setSummary] = useState('');
  const trimmed = title.trim();

  const anlegen = () =>
    create.mutate(
      {
        title: trimmed,
        actionstepText: actionstep.trim() || null,
        summaryText: summary.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(
            'Angelegt — wähl sie an einem Termin aus, wenn du dran bist.',
          );
          onClose();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  const holen = async (session: AdoptableSession) => {
    const name = session.title ?? 'Diese Einheit';
    const ok = await confirm({
      title: `„${name}" ins Thema holen?`,
      body: 'Sie gehört danach zu diesem Thema und steht nicht mehr für sich im Archiv. Ihr Abend, ihr Inhalt und wer sie vorbereitet, bleiben.',
      confirmLabel: 'Holen',
    });
    if (!ok) return;

    adopt.mutate(session.id, {
      onSuccess: () => {
        toast.success(`„${name}" gehört jetzt zum Thema.`);
        onClose();
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const items = adoptable.data?.items ?? [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={step === 'neu' ? 'Einheit vorbereiten' : 'Einheit hinzufügen'}
      subtitle={topic.title ?? 'Thema ohne Titel'}
      footer={
        step === 'neu' ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setStep('start')}
            >
              Zurück
            </Button>
            <Button
              className="flex-1"
              loading={create.isPending}
              disabled={trimmed.length === 0}
              onClick={anlegen}
            >
              Anlegen
            </Button>
          </div>
        ) : undefined
      }
    >
      {step === 'start' ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setStep('neu')}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-card p-3 text-left transition-colors hover:border-terracotta-300"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-600">
              <Plus size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-sm font-bold text-stone-900">
                Neue Einheit vorbereiten
              </span>
              <span className="block text-xs text-stone-500">
                Noch ohne Abend — sie wartet, bis du dran bist.
              </span>
            </span>
          </button>

          {items.length > 0 && (
            <div>
              <FieldLabel>Oder eine einzelne Einheit aufnehmen</FieldLabel>
              <ul className="space-y-2">
                {items.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      disabled={adopt.isPending}
                      onClick={() => void holen(session)}
                      className="flex w-full items-center gap-3 rounded-lg border border-line bg-card p-3 text-left transition-colors hover:border-terracotta-300 disabled:opacity-50"
                    >
                      <FileText size={16} className="shrink-0 text-stone-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-stone-800">
                          {session.title ?? 'Ohne eigenen Titel'}
                        </span>
                        <span className="block text-[11px] text-stone-400">
                          {session.meeting
                            ? `${session.held ? 'gehalten am' : 'am'} ${formatDay(session.meeting.date)}`
                            : 'noch an keinem Abend'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-md border border-line bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-stone-500">
            Noch ohne Abend. Sie wartet unter „Angefangenes", bis du an einem
            Termin für das Thema zuständig bist und sie dort auswählst.
          </p>

          <div>
            <FieldLabel>Titel</FieldLabel>
            <TextInput
              aria-label="Titel der Einheit"
              value={title}
              placeholder="Worum geht es?"
              onChange={(event) => setTitle(event.target.value)}
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
            <FieldLabel>Zusammenfassung</FieldLabel>
            <TextArea
              aria-label="Zusammenfassung"
              rows={3}
              value={summary}
              placeholder="Kann auch nach dem Abend kommen."
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
