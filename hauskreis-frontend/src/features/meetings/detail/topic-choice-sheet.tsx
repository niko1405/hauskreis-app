'use client';

/**
 * Die Wahl an einem Abend — vier Schritte in **einem** Sheet.
 *
 * `Sheet` rendert ohne Portal auf derselben Ebene und registriert je einen
 * eigenen Escape-Handler; zwei übereinander schließen sich gegenseitig und
 * lassen den Fokus im falschen Panel. Deshalb ein Sheet und ein `step`, mit
 * „Zurück" statt Stapel.
 *
 * Die Schritte:
 *
 * 1. `root` — neu anfangen, etwas Angefangenes aufnehmen, oder ein eigenes
 *    Thema öffnen.
 * 2. `topic` — dessen Abende, mit „gehalten" und „offen"; offene lassen sich
 *    direkt nehmen, darunter geht es zu einer neuen Einheit.
 * 3. `create` — Titel, Actionstep, Zusammenfassung und mit wem zusammen.
 * 4. `people` — der Personen-Picker aus der Rollenzuteilung. Er ist hier eine
 *    **Abkürzung**: was er einträgt, ist die Rolle „Thema" an diesem Abend, und
 *    daraus macht der Server die Mitwirkenden. So gibt es genau einen Weg,
 *    Mitarbeiter:in eines Themas zu werden.
 */
import { ArrowLeft, Check, Info, Pencil, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { AssignmentPicker } from '@/components/domain/assignment-picker';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useChooseTopicSession,
  useSetTopicResponsibles,
  useTopic,
  useTopicChoices,
} from '@/lib/api/hooks';
import { formatDay, isPast } from '@/lib/date';
import type {
  ChooseTopicSessionInput,
  OpenTopicSession,
  PersonRef,
  TopicChoiceTopic,
  TopicSessionInTopic,
} from '@/lib/api/types';

type Step =
  | { name: 'root' }
  | { name: 'topic'; topicId: string; title: string | null }
  | { name: 'create'; topicId: string; title: string | null }
  | { name: 'people'; topicId: string; title: string | null };

/** Was im Anlege-Formular steht, solange es noch nicht abgeschickt wurde. */
interface Entwurf {
  title: string;
  actionstep: string;
  summary: string;
}

const LEERER_ENTWURF: Entwurf = { title: '', actionstep: '', summary: '' };

export function TopicChoiceSheet({
  meetingId,
  open,
  onClose,
  /** Wer gerade für das Thema zugeteilt ist — der Ausgangsstand des Pickers. */
  responsibles,
  /** Ob am Abend schon etwas hängt; dann gibt es auch den Weg zurück. */
  hasSession,
  onUnlink,
}: {
  meetingId: string;
  open: boolean;
  onClose: () => void;
  responsibles: PersonRef[];
  hasSession: boolean;
  onUnlink: () => void;
}) {
  const [step, setStep] = useState<Step>({ name: 'root' });

  // Der Entwurf liegt **hier** und nicht in `CreateStep`: die Schritte lösen
  // einander an derselben Stelle im Baum ab, ein Wechsel ist also ein Unmount.
  // Wer zu den Mitwirkenden abbog und zurückkam, fand sein Formular vorher leer
  // vor. Ein `key` hilft dagegen nicht — es gibt keine gemeinsame Position, an
  // der die Felder gemountet bleiben könnten.
  const [entwurf, setEntwurf] = useState(LEERER_ENTWURF);

  const choices = useTopicChoices(meetingId, open);
  const choose = useChooseTopicSession(meetingId);
  const toast = useToast();
  const confirm = useConfirm();

  const schliessen = () => {
    setStep({ name: 'root' });
    setEntwurf(LEERER_ENTWURF);
    onClose();
  };

  /** Ein anderes Thema öffnen heißt: der Entwurf gehörte zum vorigen. */
  const themaOeffnen = (topicId: string, title: string | null) => {
    setEntwurf(LEERER_ENTWURF);
    setStep({ name: 'topic', topicId, title });
  };

  const waehlen = (input: ChooseTopicSessionInput, erfolg: string) => {
    choose.mutate(input, {
      onSuccess: () => {
        toast.success(erfolg);
        schliessen();
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  /**
   * Eine offene Einheit aufnehmen. Hängt sie an einem anderen Abend, kostet das
   * jenen Abend seine Auswahl — dann erst die Frage, dann die Tat.
   */
  const aufnehmen = async (
    session: { id: string; title: string | null },
    meeting: OpenTopicSession['meeting'],
  ) => {
    if (meeting) {
      const ok = await confirm({
        title: 'Von einem anderen Abend nehmen?',
        body: `„${session.title ?? 'Diese Einheit'}" hängt am ${formatDay(meeting.date)}. Der Abend steht danach wieder ohne Thema da — wer dort zuständig ist, bleibt es.`,
        confirmLabel: 'Hierher holen',
      });
      if (!ok) return;
    }

    waehlen(
      { mode: 'resume', sessionId: session.id },
      'Wieder aufgenommen — dein Thema steht am Abend.',
    );
  };

  if (step.name === 'people') {
    return (
      <PeopleStep
        meetingId={meetingId}
        responsibles={responsibles}
        onBack={() =>
          setStep({ name: 'create', topicId: step.topicId, title: step.title })
        }
      />
    );
  }

  if (step.name === 'create') {
    return (
      <CreateStep
        topicTitle={step.title}
        responsibles={responsibles}
        entwurf={entwurf}
        onChange={setEntwurf}
        saving={choose.isPending}
        onPeople={() =>
          setStep({ name: 'people', topicId: step.topicId, title: step.title })
        }
        onBack={() =>
          setStep({ name: 'topic', topicId: step.topicId, title: step.title })
        }
        onCreate={() =>
          waehlen(
            {
              mode: 'existing',
              topicId: step.topicId,
              title: entwurf.title.trim(),
              actionstepText: entwurf.actionstep.trim() || null,
              summaryText: entwurf.summary.trim() || null,
            },
            'Angelegt — die Einheit hängt am Abend.',
          )
        }
      />
    );
  }

  if (step.name === 'topic') {
    return (
      <TopicStep
        topicId={step.topicId}
        onBack={() => setStep({ name: 'root' })}
        onPick={(session) => aufnehmen(session, session.meeting)}
        onCreate={() =>
          setStep({ name: 'create', topicId: step.topicId, title: step.title })
        }
      />
    );
  }

  return (
    <Sheet
      open={open}
      onClose={schliessen}
      title="Thema wählen"
      subtitle="Neu anfangen, etwas fortsetzen oder Angefangenes aufnehmen"
    >
      <NewTopicSection
        saving={choose.isPending}
        onCreate={(title) =>
          waehlen({ mode: 'new', title: title || null }, 'Thema angelegt.')
        }
      />

      {choices.isLoading && <CardSkeleton />}
      {choices.error && <ErrorState error={choices.error} />}

      {(choices.data?.openSessions.length ?? 0) > 0 && (
        <section>
          <Heading icon={<Pencil size={12} />}>Angefangenes aufnehmen</Heading>
          <div className="space-y-4">
            {choices.data?.openSessions.map((gruppe) => (
              <div key={gruppe.topic.id}>
                <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                  {gruppe.topic.title ?? 'Thema ohne Titel'}
                </p>
                <ul className="space-y-2">
                  {gruppe.sessions.map((session) => (
                    <li key={session.id}>
                      <ChoiceRow
                        title={session.title ?? 'Entwurf ohne Titel'}
                        hint={
                          session.meeting
                            ? `hängt am ${formatDay(session.meeting.date)}`
                            : 'noch an keinem Abend'
                        }
                        onSelect={() => aufnehmen(session, session.meeting)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {(choices.data?.topics.length ?? 0) > 0 && (
        <section>
          <Heading icon={<Sparkles size={12} />}>
            Eigenes Thema fortsetzen
          </Heading>
          <ul className="space-y-2">
            {choices.data?.topics.map((topic) => (
              <li key={topic.id}>
                <ChoiceRow
                  title={topic.title ?? 'Thema ohne Titel'}
                  hint={topicHint(topic)}
                  onSelect={() => themaOeffnen(topic.id, topic.title)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {choices.data &&
        choices.data.topics.length === 0 &&
        choices.data.openSessions.length === 0 && (
          <EmptyState
            title="Noch nichts Eigenes"
            hint="Sobald du ein Thema angefangen hast, steht es hier zum Fortsetzen."
          />
        )}

      {/* Der Weg zurück. Ohne ihn ließe sich ein einmal gewähltes Thema nur noch
          tauschen, nie ganz wegnehmen — und „wir machen an dem Abend doch was
          anderes" ist ein normaler Satz. */}
      {hasSession && (
        <button
          type="button"
          onClick={() => {
            onUnlink();
            schliessen();
          }}
          className="w-full border-t border-line pt-4 text-xs text-stone-400 underline-offset-2 hover:underline"
        >
          Den Abend ganz ohne Thema lassen
        </button>
      )}
    </Sheet>
  );
}

// ── Schritt 1: neues Thema ───────────────────────────────────────────────────

function NewTopicSection({
  saving,
  onCreate,
}: {
  saving: boolean;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  return (
    <section>
      <Heading icon={<Plus size={12} />}>Neues Thema</Heading>
      <div className="flex gap-2">
        <TextInput
          aria-label="Titel des neuen Themas"
          value={title}
          placeholder="Worum geht es?"
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button size="sm" loading={saving} onClick={() => onCreate(title)}>
          Anlegen
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-400">
        Der Titel darf auch später kommen — dann steht hier erst mal nichts.
      </p>
    </section>
  );
}

// ── Schritt 2: die Abende eines Themas ───────────────────────────────────────

/**
 * Mockup 2: welche Einheiten es schon gibt und welche davon noch frei sind.
 *
 * „Gehalten" ist keine Auswahl, sondern Geschichte — die Zeile steht da, damit
 * man sieht, wo das Thema steht, und ist bewusst nicht anklickbar.
 */
function TopicStep({
  topicId,
  onBack,
  onPick,
  onCreate,
}: {
  topicId: string;
  onBack: () => void;
  onPick: (session: TopicSessionInTopic) => void;
  onCreate: () => void;
}) {
  const query = useTopic(topicId);
  const topic = query.data?.data;

  return (
    <Sheet
      open
      onClose={onBack}
      title={topic?.title ?? 'Thema'}
      subtitle="Wähle eine offene Einheit oder leg eine neue an"
      footer={
        <Button variant="ghost" className="w-full" onClick={onBack}>
          <ArrowLeft size={14} /> Zurück
        </Button>
      }
    >
      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {topic && topic.sessions.length > 0 && (
        <section>
          <Heading>Einheiten</Heading>
          <ul className="space-y-2">
            {topic.sessions.map((session, index) => (
              <li key={session.id}>
                <SessionRow
                  session={session}
                  nummer={index + 1}
                  onSelect={() => onPick(session)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <Heading>Neu anlegen</Heading>
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-terracotta-100 bg-terracotta-50/30 p-4 text-sm font-semibold text-terracotta-700 transition-colors hover:bg-terracotta-50"
        >
          <Plus size={16} /> Neue Einheit anheften
        </button>
      </section>

      {topic?.status === 'COMPLETED' && (
        <p className="flex gap-2 rounded-md border border-info-line bg-info-bg px-3 py-2.5 text-[11px] leading-relaxed text-info">
          <Info size={14} className="mt-px shrink-0" />
          <span>
            Das Thema ist als abgeschlossen markiert. Hängst du eine Einheit an
            einen Abend, läuft es wieder.
          </span>
        </p>
      )}
    </Sheet>
  );
}

function SessionRow({
  session,
  nummer,
  onSelect,
}: {
  session: TopicSessionInTopic;
  nummer: number;
  onSelect: () => void;
}) {
  // Ein Abend, der war, lässt sich nicht mehr umhängen — der Server weist es
  // ab, und ein Knopf, der nur Fehler erzeugt, ist ein falsches Versprechen.
  const vorbei = Boolean(session.meeting && isPast(session.meeting.date));

  const inhalt = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-serif text-sm font-bold text-stone-900">
          {session.title ?? 'Ohne eigenen Titel'}
        </span>
        <span className="block text-[11px] text-stone-400">
          Einheit {nummer}
          {session.meeting && ` · ${formatDay(session.meeting.date)}`}
        </span>
      </span>
      {vorbei ? (
        <Badge variant="topic">gehalten</Badge>
      ) : (
        <Badge variant="music">offen</Badge>
      )}
    </>
  );

  if (vorbei) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3 opacity-70">
        {inhalt}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-dashed border-line-strong bg-card p-3 text-left transition-colors hover:border-terracotta-300"
    >
      {inhalt}
    </button>
  );
}

// ── Schritt 3: die neue Einheit ──────────────────────────────────────────────

/** Mockup 1. Der Titel ist das einzige Pflichtfeld — ohne ihn kein Wiedererkennen. */
function CreateStep({
  topicTitle,
  responsibles,
  entwurf,
  onChange,
  saving,
  onPeople,
  onBack,
  onCreate,
}: {
  topicTitle: string | null;
  responsibles: PersonRef[];
  /** Liegt eine Ebene höher, damit der Umweg zu den Mitwirkenden ihn nicht frisst. */
  entwurf: Entwurf;
  onChange: (entwurf: Entwurf) => void;
  saving: boolean;
  onPeople: () => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const { title, actionstep, summary } = entwurf;
  const trimmed = title.trim();

  return (
    <Sheet
      open
      onClose={onBack}
      title="Neue Einheit anlegen"
      subtitle={topicTitle ?? 'Thema ohne Titel'}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            <ArrowLeft size={14} /> Zurück
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            disabled={trimmed.length === 0}
            onClick={onCreate}
          >
            Anlegen
          </Button>
        </div>
      }
    >
      <Labelled label="Titel">
        <TextInput
          aria-label="Titel der Einheit"
          value={title}
          placeholder="Worum geht es an diesem Abend?"
          onChange={(event) =>
            onChange({ ...entwurf, title: event.target.value })
          }
        />
      </Labelled>

      <Labelled label="Actionstep">
        <TextArea
          aria-label="Actionstep"
          rows={2}
          value={actionstep}
          placeholder="Was nimmt die Gruppe mit in die Woche?"
          onChange={(event) =>
            onChange({ ...entwurf, actionstep: event.target.value })
          }
        />
      </Labelled>

      <Labelled label="Zusammenfassung">
        <TextArea
          aria-label="Zusammenfassung"
          rows={3}
          value={summary}
          placeholder="Kann auch nach dem Abend kommen."
          onChange={(event) =>
            onChange({ ...entwurf, summary: event.target.value })
          }
        />
      </Labelled>

      <Labelled label="Zusammen mit">
        <button
          type="button"
          onClick={onPeople}
          className="flex items-center gap-3 rounded-md p-1 transition-colors hover:bg-canvas"
        >
          <AvatarStack people={responsibles} size="md" />
          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-stone-400">
            <Plus size={16} />
          </span>
        </button>
        <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400">
          Wer hier steht, ist an diesem Abend für das Thema zuständig — und darf
          ab dann am ganzen Thema schreiben.
        </p>
      </Labelled>
    </Sheet>
  );
}

// ── Schritt 4: mit wem ───────────────────────────────────────────────────────

/**
 * Die Abkürzung: statt nach dem Anlegen zurück in den Termin zu gehen und die
 * Rolle dort zu setzen, geht es von hier.
 *
 * Geschrieben wird sofort — die Zuteilung ist ein eigener Vorgang und nicht Teil
 * des Entwurfs, den „Zurück" verwirft.
 */
function PeopleStep({
  meetingId,
  responsibles,
  onBack,
}: {
  meetingId: string;
  responsibles: PersonRef[];
  onBack: () => void;
}) {
  const setResponsibles = useSetTopicResponsibles(meetingId);
  const [draft, setDraft] = useState(responsibles.map((person) => person.id));

  const toggle = (personId: string) =>
    setDraft((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );

  const uebernehmen = () =>
    setResponsibles.mutate(draft, { onSuccess: onBack });

  return (
    <Sheet
      open
      onClose={onBack}
      title="Wer bereitet mit vor?"
      subtitle="Mehrere möglich"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={setResponsibles.isPending}
            onClick={uebernehmen}
          >
            Übernehmen
          </Button>
        </div>
      }
    >
      <AssignmentPicker
        kind="TOPIC"
        meetingId={meetingId}
        active
        selectedIds={draft}
        onToggle={toggle}
        onClear={() => setDraft([])}
      />
    </Sheet>
  );
}

// ── Kleinteile ───────────────────────────────────────────────────────────────

function Heading({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
      {icon}
      {children}
    </h3>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function ChoiceRow({
  title,
  hint,
  onSelect,
}: {
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-card p-3 text-left transition-colors hover:border-terracotta-300"
    >
      <span className="min-w-0">
        <span className="block truncate font-serif text-sm font-bold text-stone-900">
          {title}
        </span>
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
      <Check size={14} className="shrink-0 text-stone-300" />
    </button>
  );
}

/** „3 Abende · zuletzt Di., 28. Juli" — oder dass noch keiner war. */
function topicHint(topic: TopicChoiceTopic): string {
  const abende =
    topic.sessionCount === 1 ? '1 Einheit' : `${topic.sessionCount} Einheiten`;

  const zuletzt = topic.lastHeldAt
    ? `zuletzt ${formatDay(topic.lastHeldAt)}`
    : 'noch kein Abend';

  const status = topic.status === 'COMPLETED' ? ' · abgeschlossen' : '';

  return `${abende} · ${zuletzt}${status}`;
}
