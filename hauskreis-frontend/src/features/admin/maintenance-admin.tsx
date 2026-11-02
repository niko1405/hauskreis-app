'use client';

/**
 * Die Einstellungen der Gruppe (Rhythmus, Actionstep, Gebet) und die Läufe,
 * die sonst nachts von selbst passieren — hier von Hand auslösbar, mit dem
 * Ergebnis daneben.
 *
 * Die Einstellungen sind Entwurf, bis der Balken unten sie schreibt
 * (`admin-draft.tsx`); die Läufe sind Aktionen und wirken sofort.
 */
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { CheckRow } from '@/components/ui/check-row';
import { Field, Select, TextInput } from '@/components/ui/field';
import { InfoTip } from '@/components/ui/info-tip';
import { ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useGenerateMeetings,
  useMeetingSchedule,
  usePlanPrayerBuddyRounds,
  useRepairPrayerBuddyRound,
  usePrayerBuddyConfig,
  usePurgeAbandonedLocations,
  useRotatePrayerBuddies,
  useSyncAbsences,
  useUpdateMeetingSchedule,
  useUpdatePrayerBuddyConfig,
} from '@/lib/api/hooks';
import type {
  MeetingSchedule,
  UpdateMeetingScheduleInput,
} from '@/lib/api/types';
import { useAdminDraftSection } from './admin-draft';

export function MaintenanceAdmin() {
  return (
    <>
      <ScheduleSettings />
      <PrayerBuddyConfigCard />
      <JobsCard />
    </>
  );
}

/** 0 = Sonntag … 6 = Samstag, wie `Date.getUTCDay()` es zählt. */
const WEEKDAYS = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

/**
 * Die Abstände, die eine Gruppe wirklich hat.
 *
 * Vier Einträge statt eines Zahlenfelds: „alle 9 Wochen" ist keine Frage, die
 * jemand stellt, und ein Feld, das sie zulässt, müsste sie beantworten.
 */
const INTERVALS = [
  { weeks: 1, label: 'Jede Woche' },
  { weeks: 2, label: 'Alle zwei Wochen' },
  { weeks: 3, label: 'Alle drei Wochen' },
  { weeks: 4, label: 'Alle vier Wochen' },
];

/**
 * Alle Zeitzonen, die die Laufzeit kennt — dieselbe Liste, gegen die der Server
 * prüft.
 *
 * Bewusst keine handverlesene Auswahl: die veraltet, und die eine Gruppe, deren
 * Zone fehlt, kann dann gar nichts einstellen. `supportedValuesOf` gibt es seit
 * ES2022 in jedem Browser, der diese App überhaupt lädt; die Verzweigung ist
 * nur da, weil TypeScript sie sonst nicht kennt.
 */
const ZONES: string[] = Intl.supportedValuesOf?.('timeZone') ?? [
  'Europe/Berlin',
];

/** Was in der Verwaltung zum Rhythmus einstellbar ist — eine Zeile am Server. */
type Schedule = Required<UpdateMeetingScheduleInput>;

function scheduleOf(current: MeetingSchedule | undefined): Schedule {
  return {
    autoGenerate: current?.autoGenerate ?? true,
    weekday: current?.weekday ?? 2,
    intervalWeeks: current?.intervalWeeks ?? 1,
    startTime: current?.startTime ?? '18:00',
    timeZone: current?.timeZone ?? 'Europe/Berlin',
    praiseEvenings: current?.praiseEvenings ?? true,
    snackSlot: current?.snackSlot ?? false,
    weeklyActionstep: current?.weeklyActionstep ?? true,
  };
}

/**
 * Termin-Rhythmus und Actionstep der Woche — zwei Karten, **ein** Entwurf.
 *
 * Beide stehen in derselben Zeile am Server (`meeting_schedule_config`), und
 * die schreibt man mit `If-Match`. Zwei Entwürfe wären zwei Schreibvorgänge
 * hintereinander auf dieselbe Version, und der zweite bekäme einen Konflikt
 * mit dem ersten. Getrennte Karten bleiben es trotzdem: Der Actionstep sagt
 * nicht, wann ihr euch trefft, sondern was danach stehen bleibt.
 */
function ScheduleSettings() {
  const schedule = useMeetingSchedule();
  const update = useUpdateMeetingSchedule();
  const [draft, setDraft] = useState<Schedule | null>(null);

  const current = schedule.data?.data;
  const saved = scheduleOf(current);
  const value = draft ?? saved;
  const set = (patch: Partial<Schedule>) => setDraft({ ...value, ...patch });

  // Geschrieben wird nur, was sich geändert hat — wie im Bearbeiten-Dialog
  // eines Termins.
  const changes = (Object.keys(value) as (keyof Schedule)[]).filter(
    (key) => value[key] !== saved[key],
  );

  useAdminDraftSection('schedule', {
    dirty: current !== undefined && changes.length > 0,
    save: async () => {
      const input: UpdateMeetingScheduleInput = Object.fromEntries(
        changes.map((key) => [key, value[key]]),
      );
      await update.mutateAsync(input);
      setDraft(null);
    },
    reset: () => setDraft(null),
  });

  return (
    <>
      <section>
        <SectionTitle
          info={
            <>
              Tag, Abstand, Uhrzeit und Zeitzone gelten für Termine, die die App
              ab jetzt anlegt. Was schon im Kalender steht, behält seinen Tag
              und seine Zeit — dafür hat längst jemand zugesagt.
            </>
          }
        >
          Termin-Rhythmus
        </SectionTitle>
        <Card className="space-y-4">
          {update.conflict && (
            <ConflictBanner onResolve={update.resolveConflict} />
          )}

          {/* Steht über allem anderen, denn es entscheidet, ob das Übrige
              überhaupt eine Frage ist — dasselbe Muster wie bei den
              Gebetsbuddys. */}
          <CheckRow
            label="Termine automatisch anlegen"
            hint="Sieben Abende stehen immer im Voraus bereit."
            info={
              <>
                Aus heißt: Ihr legt eure Termine selbst an. Was schon im
                Kalender steht, bleibt stehen, und auch „Termine vorausplanen“
                unter Läufe legt dann nichts an. Solange es an ist, sind von
                Hand angelegte Termine als „besonders“ vorbelegt — sie sind dann
                meistens ein Geburtstag oder eine Freizeit.
              </>
            }
            checked={value.autoGenerate}
            onChange={(next) => set({ autoGenerate: next })}
          />

          {value.autoGenerate && (
            <>
              <Field label="Wochentag">
                <Select
                  value={value.weekday}
                  onChange={(event) =>
                    set({ weekday: Number(event.target.value) })
                  }
                >
                  {WEEKDAYS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Abstand">
                <Select
                  value={value.intervalWeeks}
                  onChange={(event) =>
                    set({ intervalWeeks: Number(event.target.value) })
                  }
                >
                  {INTERVALS.map(({ weeks, label }) => (
                    <option key={weeks} value={weeks}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Uhrzeit"
                info={
                  <>
                    Ab dieser Uhrzeit hat ein Abend begonnen: Dann sehen alle
                    den Inhalt seines Themas, und die Nachbereitung lässt sich
                    anlegen.
                  </>
                }
              >
                <TextInput
                  type="time"
                  value={value.startTime}
                  onChange={(event) => set({ startTime: event.target.value })}
                />
              </Field>

              {/* Die dritte Angabe desselben Satzes: „dienstags um 18 Uhr" ist
                  ohne sie nicht zu deuten — und „welchen Tag haben wir" ebenso
                  wenig. */}
              <Field
                label="Zeitzone"
                info={
                  <>
                    In dieser Zone gilt die Uhrzeit, und in ihr zählt die App,
                    welchen Tag wir haben. Anders als Tag und Uhrzeit gilt sie
                    sofort für alle Termine.
                  </>
                }
              >
                <Select
                  value={value.timeZone}
                  onChange={(event) => set({ timeZone: event.target.value })}
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-1 border-t border-line pt-3">
                <CheckRow
                  label="Lobpreis- und Gebetsabende"
                  hint="Der letzte Termin im Monat bekommt Lieder und ein Testimony statt eines Themas."
                  info={
                    <>
                      Gilt für neue Termine — was schon im Kalender steht,
                      behält seine Bausteine. Am einzelnen Abend lässt sich das
                      jederzeit über „Bearbeiten“ umbauen.
                    </>
                  }
                  checked={value.praiseEvenings}
                  onChange={(next) => set({ praiseEvenings: next })}
                />

                {/* Anders als der Lobpreisabend voreingestellt **aus** — die
                    Rolle ist eine Einladung, und wer sie nicht will, soll sie
                    nicht abwählen müssen. */}
                <CheckRow
                  label="Snacks vorbelegen"
                  hint="Neue Termine bekommen die Rolle „Snacks“ gleich mit."
                  info={
                    <>
                      Gilt für neue Termine. An einem einzelnen Abend lässt sich
                      der Baustein immer anhaken, auch ohne diese Vorgabe.
                    </>
                  }
                  checked={value.snackSlot}
                  onChange={(next) => set({ snackSlot: next })}
                />
              </div>
            </>
          )}

          {current?.updatedBy && (
            <p className="text-[11px] text-stone-400">
              Zuletzt geändert von {current.updatedBy.name}.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Actionstep der Woche</SectionTitle>
        <Card>
          <CheckRow
            label={'Auf „Heute“ anzeigen'}
            hint="Der Vorsatz vom letzten Abend zum Abhaken, mit wöchentlicher Erinnerung."
            info={
              <>
                Aus heißt: keine Karte auf „Heute“ und keine Erinnerung. Der
                Actionstep an Einheiten und in der Nachbereitung bleibt, und die
                anderen erfahren weiterhin, wenn einer eingetragen wird.
              </>
            }
            checked={value.weeklyActionstep}
            onChange={(next) => set({ weeklyActionstep: next })}
          />
        </Card>
      </section>
    </>
  );
}

function PrayerBuddyConfigCard() {
  const config = usePrayerBuddyConfig();
  const update = useUpdatePrayerBuddyConfig();
  const rotate = useRotatePrayerBuddies();
  const toast = useToast();
  const [draft, setDraft] = useState<{
    enabled: boolean;
    weeks: string;
  } | null>(null);

  const current = config.data?.data;
  const saved = {
    enabled: current?.enabled ?? true,
    weeks: String(current?.periodLengthWeeks ?? 2),
  };
  const value = draft ?? saved;
  const weeks = Number(value.weeks);

  useAdminDraftSection('prayer', {
    dirty:
      current !== undefined &&
      (value.enabled !== saved.enabled || value.weeks !== saved.weeks),
    invalid:
      value.enabled && !(Number.isInteger(weeks) && weeks >= 1 && weeks <= 12)
        ? 'Eine Gebetsrunde dauert 1 bis 12 Wochen.'
        : undefined,
    save: async () => {
      await update.mutateAsync({
        ...(value.enabled !== saved.enabled ? { enabled: value.enabled } : {}),
        ...(value.weeks !== saved.weeks ? { periodLengthWeeks: weeks } : {}),
      });
      setDraft(null);
    },
    reset: () => setDraft(null),
  });

  return (
    <section>
      <SectionTitle>Gebets-Rhythmus</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

        {/* Steht über allem anderen, denn es entscheidet, ob das Übrige
            überhaupt eine Frage ist. */}
        <CheckRow
          label="Gebetsbuddys"
          hint="Zweier- und Dreiergruppen, die füreinander beten."
          info={
            <>
              Aus heißt ganz aus: kein Gebet-Tab, keine Karte auf „Heute“, keine
              Nachrichten. Bestehende Runden bleiben gespeichert und sind beim
              Wiedereinschalten wieder da.
            </>
          }
          checked={value.enabled}
          onChange={(next) => setDraft({ ...value, enabled: next })}
        />

        {value.enabled && (
          <>
            <Field
              label="Länge einer Runde in Wochen"
              info={
                <>
                  Vorgabe sind zwei Wochen. Die Änderung gilt für Runden, die ab
                  jetzt angelegt werden.
                </>
              }
            >
              <TextInput
                type="number"
                min="1"
                max="12"
                value={value.weeks}
                onChange={(event) =>
                  setDraft({ ...value, weeks: event.target.value })
                }
              />
            </Field>

            {/* Eine Aktion und kein Teil des Entwurfs: Sie zieht eine Runde
                vor, die schon geplant ist. Nicht „neu würfeln": Fünf Runden
                stehen im Voraus, also wird die nächste geplante vorgezogen. */}
            <div className="flex items-center gap-3 rounded-md border border-line p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                  Nächste Runde vorziehen
                  <InfoTip label="Nächste Runde vorziehen">
                    Beendet die laufende Runde und zieht die nächste geplante
                    auf heute vor. Alle bekommen Bescheid, wer jetzt ihr Buddy
                    ist. Danach steht der Vorlauf wieder voll.
                  </InfoTip>
                </p>
                <p className="text-[11px] text-stone-400">
                  Wirkt sofort, ohne Speichern.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={rotate.isPending}
                onClick={() =>
                  rotate.mutate(true, {
                    onSuccess: (result) =>
                      toast.success(
                        result.created
                          ? `Nächste Runde läuft ab heute, ${result.notified} benachrichtigt.`
                          : 'Es war nichts zu wechseln.',
                      ),
                  })
                }
              >
                <Play size={12} />
                Los
              </Button>
            </div>
          </>
        )}

        {current?.updatedBy && (
          <p className="text-[11px] text-stone-400">
            Zuletzt geändert von {current.updatedBy.name}.
          </p>
        )}
      </Card>
    </section>
  );
}

interface Job {
  label: string;
  hint: string;
  info: string;
  pending: boolean;
  run: () => void;
}

function JobsCard() {
  const toast = useToast();

  // Die Hooks stehen einzeln da und nicht in einer Schleife — die Reihenfolge
  // von Hook-Aufrufen muss über Renderdurchläufe hinweg dieselbe sein.
  //
  // Nur Läufe, die etwas anlegen oder aufräumen. Erinnerungen gibt es hier
  // bewusst nicht: Sie verschickt der Server um neun ohnehin, und ein Knopf
  // dafür wäre nur eine Gelegenheit, der Gruppe versehentlich etwas zu
  // schicken.
  const generate = useGenerateMeetings();
  const planRounds = usePlanPrayerBuddyRounds();
  const repairRound = useRepairPrayerBuddyRound();
  const syncAbsences = useSyncAbsences();
  const purgeLocations = usePurgeAbandonedLocations();

  const fail = (error: unknown) => toast.error(errorMessage(error));

  const jobs: Job[] = [
    {
      label: 'Termine vorausplanen',
      hint: 'Legt Abende an, bis sieben im Voraus stehen.',
      info: 'Läuft jede Nacht um 3 Uhr. Sinnvoll direkt nach einer Änderung am Rhythmus. Ist „Termine automatisch anlegen“ aus, legt er nichts an.',
      pending: generate.isPending,
      run: () =>
        generate.mutate(undefined, {
          onSuccess: (r) =>
            toast.success(`${r.created} angelegt, ${r.skipped} übersprungen.`),
          onError: fail,
        }),
    },
    {
      label: 'Gebetsrunden vorausplanen',
      hint: 'Legt Runden an, bis fünf im Voraus stehen.',
      info: 'Läuft jede Nacht um 4 Uhr. Meldet niemandem etwas — das passiert erst, wenn eine Runde beginnt.',
      pending: planRounds.isPending,
      run: () =>
        planRounds.mutate(undefined, {
          onSuccess: (r) =>
            toast.success(
              r.created > 0
                ? `${r.created} Runde(n) ergänzt.`
                : 'Der Vorlauf stand schon voll.',
            ),
          onError: fail,
        }),
    },
    {
      label: 'Gebetsrunde prüfen',
      hint: 'Zieht die laufende Runde nach, wenn jemand kam oder ging.',
      info: 'Niemand steht draußen, niemand bleibt allein, keine Gruppe wird größer als drei. Neu gewürfelt wird nicht. Läuft jede Nacht um 4 Uhr.',
      pending: repairRound.isPending,
      run: () =>
        repairRound.mutate(undefined, {
          onSuccess: (r) =>
            toast.success(
              r.repaired > 0
                ? `${r.repaired} Gruppe(n) neu aufgeteilt, ${r.notified} benachrichtigt.`
                : 'Alles in Ordnung — nichts zu tun.',
            ),
          onError: fail,
        }),
    },
    {
      label: 'Abwesenheiten abgleichen',
      hint: 'Sagt Termine ab, die in eine Abwesenheit fallen.',
      info: 'Läuft jede Nacht um 3:30 Uhr. Sinnvoll, wenn ein Urlaub einen Abend noch nicht abgesagt hat.',
      pending: syncAbsences.isPending,
      run: () =>
        syncAbsences.mutate(undefined, {
          onSuccess: (r) =>
            toast.success(
              `${r.declined} abgesagt, ${r.withdrawn} zurückgenommen.`,
            ),
          onError: fail,
        }),
    },
    {
      label: 'Verwaiste Orte wegräumen',
      hint: 'Löscht stillgelegte Orte, an denen nichts mehr hängt.',
      info: 'Läuft nie von selbst. Ein Ort, an dem ein Termin stattfand oder jemand wohnt, bleibt stehen.',
      pending: purgeLocations.isPending,
      run: () =>
        purgeLocations.mutate(undefined, {
          onSuccess: (r) =>
            toast.success(
              r.deleted > 0
                ? `${r.deleted} Ort(e) gelöscht.`
                : 'Es gab nichts wegzuräumen.',
            ),
          onError: fail,
        }),
    },
  ];

  return (
    <section>
      <SectionTitle>Läufe</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[11px] leading-relaxed text-stone-400">
          Automatismen der App laufen jeweils jede Nacht von selbst. Hier kannst
          du diese manuell auslösen, um zu prüfen, ob alles stimmt, oder um nach
          einer Änderung am Rhythmus oder an den Gebetsbuddys die nächsten
          Termine und Runden sofort anzulegen.
        </p>
        {jobs.map((job) => (
          <div
            key={job.label}
            className="flex items-center gap-3 rounded-md border border-line p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                {job.label}
                <InfoTip label={job.label}>{job.info}</InfoTip>
              </p>
              <p className="text-[11px] leading-relaxed text-stone-400">
                {job.hint}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={job.pending}
              onClick={job.run}
            >
              <Play size={12} />
              Los
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
