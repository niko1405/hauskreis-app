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
  ArrowUpRight,
  Check,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { InlineEdit, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ActionstepCheck } from '@/components/domain/actionstep-check';
import { errorMessage } from '@/lib/api/errors';
import {
  useCreateTopicSession,
  useDeleteTopic,
  useDeleteTopicSession,
  useEditTopicSession,
  useRemoveCollaborator,
  useTopic,
  useUpdateTopic,
} from '@/lib/api/hooks';
import { formatDay, hasStarted } from '@/lib/date';
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

      {update.conflict && (
        <ConflictBanner
          onReload={() => window.location.reload()}
          onDismiss={update.dismissConflict}
        />
      )}

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
        <SessionList
          title="Abende"
          sessions={gehalten}
          editing={darfSchreiben}
        />
      )}

      {kommend.length > 0 && (
        <SessionList
          title="Steht noch bevor"
          sessions={kommend}
          editing={darfSchreiben}
        />
      )}

      {/* Nur der eigene Blick: für alle anderen liefert der Server sie gar
          nicht erst aus. */}
      {(entwuerfe.length > 0 || darfSchreiben) && (
        <SessionList
          title="Angefangen, noch ohne Abend"
          hint="Sichtbar nur für dich und alle, die am Thema mitarbeiten. Beim Wählen an einem Termin lässt sich das hier aufnehmen."
          sessions={entwuerfe}
          editing={darfSchreiben}
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
 * Owner und Mitarbeitende.
 *
 * Entfernen darf nur der Owner (`mayDelete` trägt dieselbe Bedingung). Wer
 * entfernt wird, verliert das Bearbeitungsrecht — bleibt aber unten an den
 * Abenden stehen, die er gehalten hat. Das ist Geschichte und kein Recht.
 */
function People({ topic, editing }: { topic: Topic; editing: boolean }) {
  const confirm = useConfirm();
  const toast = useToast();
  const removeCollaborator = useRemoveCollaborator(topic.id);

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
      </Card>
    </section>
  );
}

function SessionList({
  title,
  hint,
  sessions,
  editing,
  action,
}: {
  title: string;
  hint?: string;
  sessions: TopicSessionInTopic[];
  editing: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="mb-2 text-xs text-stone-400">{hint}</p>}
      <ul className="space-y-3">
        {sessions.map((session) => (
          <li key={session.id}>
            <SessionCard session={session} editing={editing} />
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
 * Eine Einheit — im Lesemodus eine Kachel, im Bearbeitungsmodus drei Felder.
 *
 * Dass hier geschrieben werden darf, sagt der Server über `session.mayEdit`; es
 * gibt keine zweite Regel, die mit der am Termin auseinanderlaufen könnte.
 * Gelöscht wird nur, was noch nicht war — ein gehaltener Abend ist das
 * Protokoll dessen, was war, und geht nur mit dem ganzen Thema.
 */
function SessionCard({
  session,
  editing,
}: {
  session: TopicSessionInTopic;
  editing: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const edit = useEditTopicSession();
  const remove = useDeleteTopicSession();

  const darf = editing && session.mayEdit;
  const leute = session.responsibles.map((r) => r.person);

  // Erst ab Abendbeginn: einen Vorsatz für heute Abend hakt man heute früh
  // nicht ab, und ein Entwurf hat gar keinen Abend, an dem der Haken hinge.
  //
  // Nicht mehr `session.held` — das ist tagesgenau und hätte den Haken hier
  // erst am **Tag darauf** freigegeben, während er auf der Terminseite schon
  // am Abend selbst dasteht. Zweimal derselbe Vorsatz, zweimal derselbe Haken;
  // dann auch zweimal dieselbe Grenze. Ein abgesagter Abend hat keine.
  const abhakbar = Boolean(
    session.meeting &&
    session.meeting.status !== 'CANCELLED' &&
    hasStarted(session.meeting.date, session.meeting.startTime) &&
    session.actionstepText,
  );

  const patch = (input: Parameters<typeof edit.mutate>[0]['input']) =>
    edit.mutate(
      { sessionId: session.id, input },
      { onError: (error) => toast.error(errorMessage(error)) },
    );

  const loeschen = async () => {
    const ok = await confirm({
      title: `„${session.title ?? 'Diese Einheit'}" löschen?`,
      body: session.meeting
        ? 'Der Abend steht danach wieder ohne Thema da — wer dafür zuständig ist, bleibt es.'
        : 'Der Entwurf verschwindet samt allem, was darin steht.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(session.id, {
      onSuccess: () => toast.success('Einheit gelöscht.'),
    });
  };

  return (
    <Card
      className={
        darf ? undefined : 'transition-colors hover:border-line-strong'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineEdit
            label="Titel der Einheit"
            value={session.title}
            emptyLabel="Ohne eigenen Titel"
            placeholder="Worum geht es an diesem Abend?"
            className="font-serif text-sm font-bold text-stone-900"
            saving={edit.isPending}
            onSave={darf ? (title) => patch({ title }) : undefined}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {session.meeting && (
            <Link
              href={`/termin?id=${session.meeting.id}`}
              className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-stone-400 uppercase hover:text-terracotta-600"
            >
              {formatDay(session.meeting.date)}
              <ArrowUpRight className="size-3" />
            </Link>
          )}
          {/* Gehaltenes bleibt: dafür gibt es hier keinen Knopf. */}
          {darf && !session.held && (
            <IconButton
              label="Einheit löschen"
              disabled={remove.isPending}
              onClick={loeschen}
            >
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>
      </div>

      {leute.length > 0 && (
        <p className="mt-0.5 text-[11px] text-stone-400">
          {session.held ? 'gehalten von' : 'vorbereitet von'} {namesOf(leute)}
        </p>
      )}

      {darf ? (
        <div className="mt-3 space-y-3">
          <div>
            <FieldLabel>Zusammenfassung</FieldLabel>
            <InlineEdit
              label="Zusammenfassung"
              multiline
              value={session.summaryText}
              emptyLabel="Noch nichts"
              saving={edit.isPending}
              onSave={(summaryText) => patch({ summaryText })}
            />
          </div>
          <div>
            <FieldLabel>Actionstep</FieldLabel>
            <InlineEdit
              label="Actionstep"
              value={session.actionstepText}
              emptyLabel="Noch keiner"
              saving={edit.isPending}
              onSave={(actionstepText) => patch({ actionstepText })}
            />
            {abhakbar && (
              <ActionstepCheck
                meetingId={session.meeting!.id}
                done={session.actionstepDone}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {session.summaryText && (
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              {session.summaryText}
            </p>
          )}

          {session.actionstepText && (
            <div className="mt-2 rounded-md bg-terracotta-50/60 px-2.5 py-1.5">
              <p className="text-[11px] font-semibold text-terracotta-700">
                Actionstep: {session.actionstepText}
              </p>
            </div>
          )}

          {/* Abhaken darf jede:r für sich, auch wer den Text nicht ändern
              darf — es ist der eigene Vorsatz. Deshalb steht der Block in
              beiden Zweigen. */}
          {abhakbar && (
            <ActionstepCheck
              meetingId={session.meeting!.id}
              done={session.actionstepDone}
            />
          )}

          {!session.contentVisible && (
            <p className="mt-2 text-xs text-stone-400">
              Zu sehen gibt es das am Abend.
            </p>
          )}
        </>
      )}
    </Card>
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
      {children}
    </p>
  );
}
