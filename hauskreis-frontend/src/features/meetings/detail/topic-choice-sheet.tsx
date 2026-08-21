'use client';

/**
 * Die Wahl an einem Abend — mehrere Schritte in **einem** Sheet.
 *
 * `Sheet` rendert ohne Portal auf derselben Ebene und registriert je einen
 * eigenen Escape-Handler; zwei übereinander schließen sich gegenseitig und
 * lassen den Fokus im falschen Panel. Deshalb ein Sheet und ein `step`, mit
 * „Zurück" statt Stapel.
 *
 * Die Schritte:
 *
 * 1. `root` — drei Abschnitte entlang der einen Frage, um die es hier geht:
 *    ein **Abend für sich**, ein **Thema** über mehreren, oder aus einem
 *    einzelnen Abend eins **machen**. Jeder Abschnitt hat unter seiner Liste
 *    einen Knopf, der ins Formular führt.
 * 2. `topic` — dessen Abende, mit „gehalten" und „offen"; offene lassen sich
 *    direkt nehmen, darunter geht es zu einer neuen Einheit.
 * 3. `new-topic` — der Bogen über die Abende: Titel und Zusammenfassung des
 *    Themas. Danach erst die erste Einheit — zwei Gedanken, zwei Schritte.
 * 4. `create` — **das gemeinsame Formular** für alle vier Wege, an denen eine
 *    Einheit entsteht. Titel, Zusammenfassung, Actionstep und mit wem
 *    zusammen; beim Überthema steht der Titel des Themas obendrüber.
 * 5. `people` — der Personen-Picker aus der Rollenzuteilung. Er ist hier eine
 *    **Abkürzung**: was er einträgt, ist die Rolle „Thema" an diesem Abend.
 *    Schreibrecht an der Vorbereitung gibt sie nicht — das steht auf der Seite
 *    der Einheit unter „Wer das vorbereitet".
 *
 * Hier stand einmal je ein Textfeld mit einem Knopf daneben, zweimal, für zwei
 * verschiedene Dinge. Es passte in eine Zeile und fragte deshalb nur nach dem
 * Titel — während dasselbe Anlegen im Archiv nach Zusammenfassung und
 * Actionstep fragte. Zwei Formulare für dieselbe Sache, und das kürzere war
 * das, das man öfter benutzt.
 *
 * **Themen-gebundene Entwürfe stehen nicht im `root`.** Sie hängen unter ihrem
 * Thema und stehen in Schritt 2, wo man es öffnet; eine eigene Liste daneben
 * zeigte dieselben Zeilen ein zweites Mal.
 */
import {
  ArrowLeft,
  Check,
  FileText,
  Info,
  Layers,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { AssignmentPicker } from '@/components/domain/assignment-picker';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Field, FieldLabel, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
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
  PersonRef,
  SingleTopicSession,
  TopicChoiceTopic,
  TopicSessionInTopic,
} from '@/lib/api/types';

type Step =
  | { name: 'root' }
  | { name: 'topic'; topicId: string; title: string | null }
  | { name: 'new-topic' }
  | { name: 'create' }
  | { name: 'people' };

/**
 * Wohin die Einheit gehört, die gerade entsteht — die vier Wege, die im
 * Formular zusammenlaufen.
 */
type Ziel =
  | { kind: 'single' }
  | { kind: 'new' }
  | { kind: 'existing'; topicId: string; topicTitle: string | null }
  | { kind: 'promote'; sessionId: string; sessionTitle: string | null };

/** Was in den Formularen steht, solange sie noch nicht abgeschickt sind. */
interface Entwurf {
  /** Nur bei `new` und `promote`: der Bogen über die Abende. */
  topicTitle: string;
  /** Nur bei `new`. */
  topicSummary: string;
  title: string;
  summary: string;
  actionstep: string;
}

const LEERER_ENTWURF: Entwurf = {
  topicTitle: '',
  topicSummary: '',
  title: '',
  summary: '',
  actionstep: '',
};

export function TopicChoiceSheet({
  meetingId,
  open,
  onClose,
  /** Wer gerade für das Thema zugeteilt ist — der Ausgangsstand des Pickers. */
  responsibles,
  /** Ob am Abend schon etwas hängt; dann gibt es auch den Weg zurück. */
  hasSession,
  /**
   * Ob der Abend schon war. Nachtragen ist erlaubt — aber was hier schon steht,
   * ist dann ein Protokoll, und das gibt man nicht ohne Rückfrage auf.
   */
  past,
  onUnlink,
}: {
  meetingId: string;
  open: boolean;
  onClose: () => void;
  responsibles: PersonRef[];
  hasSession: boolean;
  past: boolean;
  onUnlink: () => void;
}) {
  const [step, setStep] = useState<Step>({ name: 'root' });

  // Ziel und Entwurf liegen **hier** und nicht in den Schritten: die Schritte
  // lösen einander an derselben Stelle im Baum ab, ein Wechsel ist also ein
  // Unmount. Wer zu den Mitwirkenden abbog und zurückkam, fand sein Formular
  // vorher leer vor. Ein `key` hilft dagegen nicht — es gibt keine gemeinsame
  // Position, an der die Felder gemountet bleiben könnten.
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const [entwurf, setEntwurf] = useState(LEERER_ENTWURF);

  const choices = useTopicChoices(meetingId, open);
  const choose = useChooseTopicSession(meetingId);
  const toast = useToast();
  const confirm = useConfirm();

  const schliessen = () => {
    setStep({ name: 'root' });
    setZiel(null);
    setEntwurf(LEERER_ENTWURF);
    onClose();
  };

  /** Ein neues Ziel heißt: der bisherige Entwurf gehörte zu einem anderen. */
  const anfangen = (
    naechstes: Ziel,
    name: 'create' | 'new-topic' = 'create',
  ) => {
    setZiel(naechstes);
    setEntwurf(LEERER_ENTWURF);
    setStep(name === 'create' ? { name: 'create' } : { name: 'new-topic' });
  };

  const themaOeffnen = (topicId: string, title: string | null) => {
    setZiel(null);
    setEntwurf(LEERER_ENTWURF);
    setStep({ name: 'topic', topicId, title });
  };

  /**
   * Die eine Rückfrage, die es an einem vergangenen Abend braucht.
   *
   * Was dort hängt, ist gehalten worden. Wird es ersetzt oder weggenommen, löst
   * es sich vom Abend und wartet als Entwurf — es ist danach **nicht mehr
   * gehalten** und verschwindet damit aus dem Archiv. Verloren ist nichts, aber
   * das sieht man ihm nicht an, und deshalb steht es hier.
   */
  const protokollAufgeben = async (): Promise<boolean> => {
    if (!past || !hasSession) return true;

    return confirm({
      title: 'Das Protokoll dieses Abends ersetzen?',
      body: 'Was hier steht, wurde an diesem Abend gehalten. Es geht nicht verloren — die bisherige Einheit wartet danach als Entwurf —, gilt aber nicht mehr als gehalten und steht dann nicht mehr im Archiv.',
      confirmLabel: 'Weiter',
    });
  };

  /**
   * Hier stand einmal eine zweite Rückfrage: „Bereitet ihr das zusammen vor?"
   *
   * Sie war nötig, solange die Wahl **alle** Zugeteilten in die Einheit zog,
   * samt Schreibrecht am ganzen Thema — eine Entscheidung über andere Leute,
   * die man nicht im Vorbeigehen trifft. Genau das tut sie nicht mehr: An die
   * Einheit kommt nur, wer wählt. Wen man dazunimmt, entscheidet man auf ihrer
   * eigenen Seite, wo man dabei auch sieht, wen man vor sich hat.
   */
  const waehlen = async (
    input: ChooseTopicSessionInput,
    erfolg: string,
  ): Promise<void> => {
    if (!(await protokollAufgeben())) return;

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
    meeting: SingleTopicSession['meeting'],
  ) => {
    if (meeting) {
      const ok = await confirm({
        title: 'Von einem anderen Abend nehmen?',
        body: `„${session.title ?? 'Diese Einheit'}" hängt am ${formatDay(meeting.date)}. Der Abend steht danach wieder ohne Thema da — wer dort zuständig ist, bleibt es.`,
        confirmLabel: 'Hierher holen',
      });
      if (!ok) return;
    }

    void waehlen(
      { mode: 'resume', sessionId: session.id },
      'Wieder aufgenommen — dein Thema steht am Abend.',
    );
  };

  /** Das Formular abschicken — vier Ziele, eine Nutzlast je Ziel. */
  const anlegen = () => {
    if (!ziel) return;

    const einheit = {
      title: entwurf.title.trim(),
      actionstepText: entwurf.actionstep.trim() || null,
      summaryText: entwurf.summary.trim() || null,
    };

    if (ziel.kind === 'single') {
      void waehlen(
        { mode: 'single', ...einheit },
        'Einheit angelegt — sie hängt am Abend.',
      );
      return;
    }

    if (ziel.kind === 'new') {
      void waehlen(
        {
          mode: 'new',
          topicTitle: entwurf.topicTitle.trim(),
          topicSummaryText: entwurf.topicSummary.trim() || null,
          ...einheit,
        },
        'Thema angelegt — dieser Abend ist die erste Einheit.',
      );
      return;
    }

    if (ziel.kind === 'existing') {
      void waehlen(
        { mode: 'existing', topicId: ziel.topicId, ...einheit },
        'Angelegt — die Einheit hängt am Abend.',
      );
      return;
    }

    void waehlen(
      {
        mode: 'promote',
        sessionId: ziel.sessionId,
        topicTitle: entwurf.topicTitle.trim(),
        ...einheit,
      },
      'Jetzt ein Thema — dieser Abend ist die zweite Einheit.',
    );
  };

  /** Wohin „Zurück" aus dem Formular führt — dorthin, wo das Ziel herkam. */
  const zurueckVomFormular = () => {
    if (ziel?.kind === 'new') {
      setStep({ name: 'new-topic' });
      return;
    }

    if (ziel?.kind === 'existing') {
      setStep({
        name: 'topic',
        topicId: ziel.topicId,
        title: ziel.topicTitle,
      });
      return;
    }

    setStep({ name: 'root' });
  };

  if (step.name === 'people') {
    return (
      <PeopleStep
        meetingId={meetingId}
        responsibles={responsibles}
        onBack={() => setStep({ name: 'create' })}
      />
    );
  }

  if (step.name === 'create' && ziel) {
    return (
      <CreateStep
        ziel={ziel}
        responsibles={responsibles}
        entwurf={entwurf}
        onChange={setEntwurf}
        saving={choose.isPending}
        onPeople={() => setStep({ name: 'people' })}
        onBack={zurueckVomFormular}
        onCreate={anlegen}
      />
    );
  }

  if (step.name === 'new-topic') {
    return (
      <NewTopicStep
        entwurf={entwurf}
        onChange={setEntwurf}
        onBack={() => setStep({ name: 'root' })}
        onNext={() => setStep({ name: 'create' })}
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
          anfangen({
            kind: 'existing',
            topicId: step.topicId,
            topicTitle: step.title,
          })
        }
      />
    );
  }

  const einzelne = choices.data?.singleSessions ?? [];
  const offene = einzelne.filter((session) => session.resumable);
  const themen = choices.data?.topics ?? [];

  return (
    <Sheet
      open={open}
      onClose={schliessen}
      title="Thema wählen"
      subtitle="Ein Abend für sich, oder ein Thema über mehrere"
    >
      {choices.isLoading && <CardSkeleton />}
      {choices.error && <ErrorState error={choices.error} />}

      {/* Zuerst der einfachste Fall. Die meisten Abende sind einer — und wer
          ein Thema will, sucht ohnehin gezielt danach. */}
      <section>
        <Heading icon={<FileText size={12} />}>Einzelne Einheit wählen</Heading>

        {offene.length > 0 && (
          <ul className="mb-3 space-y-2">
            {offene.map((session) => (
              <li key={session.id}>
                <ChoiceRow
                  title={session.title ?? 'Einheit ohne Titel'}
                  hint={einheitHint(session)}
                  onSelect={() => aufnehmen(session, session.meeting)}
                />
              </li>
            ))}
          </ul>
        )}

        <NeuKnopf
          label="Neue Einheit anlegen"
          onClick={() => anfangen({ kind: 'single' })}
        />
        <p className="mt-1.5 text-[11px] text-stone-400">
          Ein Abend ohne Bogen darüber. Ein Überthema lässt sich später
          jederzeit ergänzen.
        </p>
      </section>

      <section>
        <Heading icon={<Layers size={12} />}>Eigenes Thema fortsetzen</Heading>

        {themen.length > 0 && (
          <ul className="mb-3 space-y-2">
            {themen.map((topic) => (
              <li key={topic.id}>
                <ChoiceRow
                  title={topic.title ?? 'Thema ohne Titel'}
                  hint={topicHint(topic)}
                  onSelect={() => themaOeffnen(topic.id, topic.title)}
                />
              </li>
            ))}
          </ul>
        )}

        <NeuKnopf
          label="Neues Thema anlegen"
          onClick={() => anfangen({ kind: 'new' }, 'new-topic')}
        />
        <p className="mt-1.5 text-[11px] text-stone-400">
          Zieht sich über mehrere Abende — dieser wird die erste Einheit.
        </p>
      </section>

      {/* Der Weg, den man nicht vorhersehen kann: Man hält einen Abend und
          merkt danach, dass da mehr drinsteckt. Hier stehen deshalb auch die
          gehaltenen — nehmen kann man die nicht mehr, fortsetzen schon. */}
      {einzelne.length > 0 && (
        <section>
          <Heading icon={<Sparkles size={12} />}>Einheit fortsetzen</Heading>
          <ul className="space-y-2">
            {einzelne.map((session) => (
              <li key={session.id}>
                <ChoiceRow
                  title={session.title ?? 'Einheit ohne Titel'}
                  hint={
                    session.meeting
                      ? `${session.held ? 'gehalten am' : 'hängt am'} ${formatDay(session.meeting.date)}`
                      : 'noch an keinem Abend'
                  }
                  onSelect={() =>
                    anfangen({
                      kind: 'promote',
                      sessionId: session.id,
                      sessionTitle: session.title,
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-stone-400">
            Gibt ihr ein Überthema — dieser Abend wird dann ihre zweite Einheit.
          </p>
        </section>
      )}

      {/* Der Weg zurück. Ohne ihn ließe sich ein einmal gewähltes Thema nur noch
          tauschen, nie ganz wegnehmen — und „wir machen an dem Abend doch was
          anderes" ist ein normaler Satz. */}
      {hasSession && (
        <button
          type="button"
          onClick={async () => {
            if (!(await protokollAufgeben())) return;
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

// ── Schritt: der Bogen über die Abende ───────────────────────────────────────

/**
 * Titel und Zusammenfassung des Themas — und danach erst die erste Einheit.
 *
 * Zwei Schritte und nicht ein langes Formular: Der Bogen über die Abende und
 * der eine Abend sind zwei Gedanken, und der zweite fällt leichter, wenn der
 * erste steht. Dieselbe Reihenfolge wie im Archiv unter „Neu anlegen".
 */
function NewTopicStep({
  entwurf,
  onChange,
  onBack,
  onNext,
}: {
  entwurf: Entwurf;
  onChange: (entwurf: Entwurf) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const trimmed = entwurf.topicTitle.trim();

  return (
    <Sheet
      open
      onClose={onBack}
      title="Neues Thema"
      subtitle="Zieht sich über mehrere Abende — dieser wird die erste Einheit."
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            <ArrowLeft size={14} /> Zurück
          </Button>
          <Button
            className="flex-1"
            disabled={trimmed.length === 0}
            onClick={onNext}
          >
            Weiter
          </Button>
        </div>
      }
    >
      <Field label="Titel des Themas">
        <TextInput
          value={entwurf.topicTitle}
          placeholder="Worum geht es über die Abende hinweg?"
          onChange={(event) =>
            onChange({ ...entwurf, topicTitle: event.target.value })
          }
        />
      </Field>

      <Field
        label="Zusammenfassung"
        hint="Optional — der Bogen über alle Abende. Kann auch später kommen."
      >
        <TextArea
          rows={3}
          value={entwurf.topicSummary}
          onChange={(event) =>
            onChange({ ...entwurf, topicSummary: event.target.value })
          }
        />
      </Field>
    </Sheet>
  );
}

// ── Schritt: die Abende eines Themas ─────────────────────────────────────────

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

// ── Schritt: die neue Einheit ────────────────────────────────────────────────

/**
 * Das gemeinsame Formular für alle vier Wege, an denen eine Einheit entsteht.
 *
 * Der Titel ist Pflicht — ohne ihn kein Wiedererkennen, und der Server verlangt
 * ihn inzwischen ebenso. Beim Überthema kommt der Titel des Themas dazu, und
 * auch der ist Pflicht: Ohne ihn wäre es kein Thema, sondern zwei Abende.
 *
 * Feldreihenfolge Titel → Zusammenfassung → Actionstep, wie im Archiv. Sie
 * stand hier einmal andersherum, und zwei Anlege-Formulare mit vertauschten
 * Feldern sind eine Stolperfalle für die, die beide benutzen.
 */
function CreateStep({
  ziel,
  responsibles,
  entwurf,
  onChange,
  saving,
  onPeople,
  onBack,
  onCreate,
}: {
  ziel: Ziel;
  responsibles: PersonRef[];
  /** Liegt eine Ebene höher, damit der Umweg zu den Mitwirkenden ihn nicht frisst. */
  entwurf: Entwurf;
  onChange: (entwurf: Entwurf) => void;
  saving: boolean;
  onPeople: () => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const brauchtUeberthema = ziel.kind === 'promote';
  const vollstaendig =
    entwurf.title.trim().length > 0 &&
    (!brauchtUeberthema || entwurf.topicTitle.trim().length > 0);

  return (
    <Sheet
      open
      onClose={onBack}
      title={titelFuer(ziel)}
      subtitle={untertitelFuer(ziel, entwurf)}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            <ArrowLeft size={14} /> Zurück
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            disabled={!vollstaendig}
            onClick={onCreate}
          >
            Anlegen
          </Button>
        </div>
      }
    >
      {brauchtUeberthema && (
        <Field label="Titel des Überthemas">
          <TextInput
            value={entwurf.topicTitle}
            placeholder="Worum geht es über die Abende hinweg?"
            onChange={(event) =>
              onChange({ ...entwurf, topicTitle: event.target.value })
            }
          />
        </Field>
      )}

      <Field label={brauchtUeberthema ? 'Titel dieses Abends' : 'Titel'}>
        <TextInput
          value={entwurf.title}
          placeholder="Worum geht es an diesem Abend?"
          onChange={(event) =>
            onChange({ ...entwurf, title: event.target.value })
          }
        />
      </Field>

      <Field
        label="Zusammenfassung"
        hint="Optional — hilft allen, die nicht da waren. Kann auch nach dem Abend kommen."
      >
        <TextArea
          rows={3}
          value={entwurf.summary}
          onChange={(event) =>
            onChange({ ...entwurf, summary: event.target.value })
          }
        />
      </Field>

      <Field
        label="Actionstep"
        hint="Optional — was die Gruppe mit in die Woche nimmt."
      >
        <TextArea
          rows={2}
          value={entwurf.actionstep}
          onChange={(event) =>
            onChange({ ...entwurf, actionstep: event.target.value })
          }
        />
      </Field>

      <div>
        <FieldLabel>Zusammen mit</FieldLabel>
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
          Wer hier steht, ist an diesem Abend für das Thema zuständig. Wer die
          Einheit mit vorbereiten darf, trägst du auf ihrer Seite ein.
        </p>
      </div>
    </Sheet>
  );
}

function titelFuer(ziel: Ziel): string {
  if (ziel.kind === 'promote') return 'Überthema hinzufügen';
  if (ziel.kind === 'new') return 'Die erste Einheit';
  return 'Neue Einheit anlegen';
}

function untertitelFuer(ziel: Ziel, entwurf: Entwurf): string {
  if (ziel.kind === 'promote') {
    return ziel.sessionTitle
      ? `„${ziel.sessionTitle}" wird die erste Einheit, dieser Abend die zweite.`
      : 'Diese Einheit wird die erste, dieser Abend die zweite.';
  }

  if (ziel.kind === 'new') return entwurf.topicTitle.trim();

  if (ziel.kind === 'existing') return ziel.topicTitle ?? 'Thema ohne Titel';

  return 'Ein Abend für sich, ohne Bogen darüber.';
}

// ── Schritt: mit wem ─────────────────────────────────────────────────────────

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
      title="Wer ist an dem Abend zuständig?"
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

/**
 * Der Knopf unter einer Liste, der ins Formular führt.
 *
 * Hier stand ein Textfeld mit „Anlegen" daneben. Es passte in eine Zeile und
 * fragte deshalb nur nach dem Titel — Zusammenfassung und Actionstep gab es auf
 * diesem Weg gar nicht, obwohl dasselbe Anlegen im Archiv danach fragt.
 */
function NeuKnopf({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" className="w-full" onClick={onClick}>
      <Plus size={14} />
      {label}
    </Button>
  );
}

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

/**
 * Die Herkunft einer offenen Einheit — Abend, Thema, oder beides.
 *
 * Die Liste trägt seit der Trennung von Vorbereitung und Abend-Rolle auch
 * Einheiten unter einem **fremden** Thema: nämlich jede, die ich mit
 * vorbereite. „Teil 3" ohne das Thema davor sähe aus wie ein einzelner Abend,
 * und das ist es nicht.
 */
function einheitHint(session: SingleTopicSession): string {
  const wo = session.meeting
    ? `hängt am ${formatDay(session.meeting.date)}`
    : 'noch an keinem Abend';

  return session.topic
    ? `aus „${session.topic.title ?? 'Thema ohne Titel'}" · ${wo}`
    : wo;
}
