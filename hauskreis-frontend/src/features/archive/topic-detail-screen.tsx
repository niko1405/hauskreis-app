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
 * Wie im Termin-Detail ist der **Lesemodus der Normalfall**: die Stifte
 * erscheinen erst auf Knopfdruck, gespeichert wird trotzdem sofort.
 */
import {
  ArrowLeft,
  Check,
  Footprints,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
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
import { PeoplePickerSheet } from '@/components/domain/people-picker-sheet';
import { errorMessage } from '@/lib/api/errors';
import {
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
import type { Topic, TopicSessionInTopic } from '@/lib/api/types';

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
  const [creating, setCreating] = useState(false);

  const darfSchreiben = editing && topic.mayEdit;

  const gehalten = topic.sessions.filter((session) => session.held);
  const kommend = topic.sessions.filter(
    (session) => session.meeting && !session.held,
  );
  const entwuerfe = topic.sessions.filter((session) => !session.meeting);

  const deleteTopic = async () => {
    const ok = await confirm({
      title: `„${topic.title ?? 'Thema ohne Titel'}" löschen?`,
      body:
        topic.sessions.length === 0
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
      <Link
        href="/archiv"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-terracotta-600"
      >
        <ArrowLeft size={14} />
        Archiv
      </Link>

      {update.conflict && <ConflictBanner onResolve={update.resolveConflict} />}

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineEdit
            label="Thema"
            value={topic.title}
            emptyLabel="Thema ohne Titel"
            placeholder="Worum geht es?"
            className="font-serif text-3xl leading-tight font-bold text-stone-900"
            saving={update.isPending}
            onSave={
              darfSchreiben ? (title) => update.mutate({ title }) : undefined
            }
          />
          <div className="mt-1.5 flex items-center gap-2">
            {topic.status === 'RUNNING' ? (
              <Badge variant="topic">läuft</Badge>
            ) : (
              <Badge>abgeschlossen</Badge>
            )}
            {darfSchreiben && (
              <button
                type="button"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    status:
                      topic.status === 'RUNNING' ? 'COMPLETED' : 'RUNNING',
                  })
                }
                className="text-[11px] text-stone-400 underline-offset-2 hover:underline"
              >
                {topic.status === 'RUNNING'
                  ? 'als abgeschlossen markieren'
                  : 'wieder aufnehmen'}
              </button>
            )}
          </div>
        </div>
      </header>

      <section>
        <SectionTitle>Worum es geht</SectionTitle>
        <Card>
          <InlineEdit
            label="Zusammenfassung des Themas"
            multiline
            value={topic.summaryText}
            emptyLabel="Noch nichts — der rote Faden über alle Abende."
            saving={update.isPending}
            onSave={
              darfSchreiben
                ? (summaryText) => update.mutate({ summaryText })
                : undefined
            }
          />
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
      {(entwuerfe.length > 0 || darfSchreiben) && (
        <SessionList
          title="Angefangen, noch ohne Abend"
          hint="Sichtbar nur für dich und alle, die am Thema mitarbeiten. Beim Wählen an einem Termin lässt sich das hier aufnehmen."
          sessions={entwuerfe}
          von={gehalten.length + kommend.length + 1}
          action={
            darfSchreiben ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-terracotta-100 bg-terracotta-50/30 p-3 text-sm font-semibold text-terracotta-700 transition-colors hover:bg-terracotta-50"
              >
                <Plus size={16} /> Einheit vorbereiten
              </button>
            ) : null
          }
        />
      )}

      {topic.mayEdit && (
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

      {topic.mayDelete && (
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

      {creating && (
        <CreateSessionSheet
          topicId={topic.id}
          topicTitle={topic.title}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
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
      <Card className="space-y-2">
        {topic.owner && (
          <div className="flex items-center gap-2.5">
            <Avatar person={topic.owner} size="sm" />
            <span className="text-sm font-medium text-stone-700">
              {topic.owner.name}
            </span>
            <span className="text-[11px] text-stone-400">
              hat es angefangen
            </span>
          </div>
        )}

        {topic.collaborators.map(({ person }) => (
          <div key={person.id} className="flex items-center gap-2.5">
            <Avatar person={person} size="sm" />
            <span className="flex-1 text-sm font-medium text-stone-700">
              {person.name}
            </span>
            {editing && topic.mayDelete && (
              <IconButton
                label={`${person.name} entfernen`}
                disabled={removeCollaborator.isPending}
                onClick={() => entfernen(person.id, person.name)}
              >
                <UserMinus size={14} />
              </IconButton>
            )}
          </div>
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
      </Card>

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
/** Titel ist Pflicht: ein Entwurf ohne Abend hat nichts als seinen Titel. */
function CreateSessionSheet({
  topicId,
  topicTitle,
  onClose,
}: {
  topicId: string;
  topicTitle: string | null;
  onClose: () => void;
}) {
  const create = useCreateTopicSession(topicId);
  const toast = useToast();

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

  return (
    <Sheet
      open
      onClose={onClose}
      title="Einheit vorbereiten"
      subtitle={topicTitle ?? 'Thema ohne Titel'}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
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
      }
    >
      <p className="rounded-md border border-line bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-stone-500">
        Noch ohne Abend. Sie wartet unter „Angefangenes", bis du an einem Termin
        für das Thema zuständig bist und sie dort auswählst.
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
    </Sheet>
  );
}
