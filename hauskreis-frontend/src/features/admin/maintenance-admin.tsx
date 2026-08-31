'use client';

/**
 * Die Läufe, die sonst der Zeitplaner im Backend anstößt — hier von Hand
 * auslösbar, mit dem Ergebnis daneben. Nützlich beim Einrichten und wenn
 * jemand wissen will, ob eine Erinnerung wirklich rausging.
 */
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field';
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
import { useState } from 'react';

export function MaintenanceAdmin() {
  return (
    <>
      <MeetingScheduleCard />
      <WeeklyActionstepCard />
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

/**
 * Wann sich die Gruppe trifft.
 *
 * Beides in einem Formular und mit einem Speichern-Knopf, weil es ein Satz ist:
 * „wir treffen uns dienstags um 18 Uhr". Getrennt wären es zwei Entscheidungen,
 * von denen man die zweite vergisst.
 *
 * Wochentag und Uhrzeit standen bis eben als Konstanten im Backend — für die
 * eine Gruppe, für die das geschrieben wurde, stimmten sie.
 */
function MeetingScheduleCard() {
  const schedule = useMeetingSchedule();
  const update = useUpdateMeetingSchedule();
  const toast = useToast();
  const [entwurf, setEntwurf] = useState<{
    weekday: string;
    intervalWeeks: string;
    startTime: string;
    timeZone: string;
  } | null>(null);

  const current = schedule.data?.data;
  const wert = entwurf ?? {
    weekday: String(current?.weekday ?? 2),
    intervalWeeks: String(current?.intervalWeeks ?? 1),
    startTime: current?.startTime ?? '18:00',
    timeZone: current?.timeZone ?? 'Europe/Berlin',
  };

  const unverändert =
    Number(wert.weekday) === current?.weekday &&
    Number(wert.intervalWeeks) === current?.intervalWeeks &&
    wert.startTime === current?.startTime &&
    wert.timeZone === current?.timeZone;

  const anlegt = current?.autoGenerate ?? true;

  return (
    <section>
      <SectionTitle>Termin-Rhythmus</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

        {/* Der Schalter steht über allem anderen, denn er entscheidet, ob das
            Übrige überhaupt eine Frage ist — dasselbe Muster wie bei den
            Gebetsbuddys. Er schreibt sofort, das Formular darunter auf
            Knopfdruck: Ein Haken ist eine Entscheidung, ein Formular sind
            vier. */}
        <Checkbox
          label="Termine automatisch anlegen"
          description="Die App hält immer sieben Abende im Voraus bereit. Aus heißt: Ihr legt eure Termine selbst an — was schon im Kalender steht, bleibt stehen."
          checked={anlegt}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              { autoGenerate: event.target.checked },
              {
                onSuccess: () =>
                  toast.success(
                    event.target.checked
                      ? 'Ab jetzt legt ihr eure Termine selbst an.'
                      : 'Die App legt wieder Termine an.',
                  ),
              },
            )
          }
        />

        {anlegt && (
          <>
            <p className="text-[11px] leading-relaxed text-stone-400">
              Hier stellst du den Rhythmus eurer Treffen ein. Er gilt für
              Termine, die der Zeitplaner ab jetzt anlegt. Was schon im Kalender
              steht, behält seinen Tag und seine Zeit — dafür hat längst jemand
              zugesagt.
            </p>

            <Field label="Wochentag">
              <Select
                value={wert.weekday}
                onChange={(event) =>
                  setEntwurf({ ...wert, weekday: event.target.value })
                }
              >
                {WEEKDAYS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Der Abstand als Auswahl und nicht als Zahlenfeld: „alle 9 Wochen"
            ist keine Frage, die jemand hat — und ein Feld, das sie zulässt,
            müsste sie beantworten. */}
            <Field label="Abstand">
              <Select
                value={wert.intervalWeeks}
                onChange={(event) =>
                  setEntwurf({ ...wert, intervalWeeks: event.target.value })
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
              hint="Ab wann der Inhalt eines Themas allen gehört, richtet sich danach."
            >
              <TextInput
                type="time"
                value={wert.startTime}
                onChange={(event) =>
                  setEntwurf({ ...wert, startTime: event.target.value })
                }
              />
            </Field>

            {/* Die dritte Angabe desselben Satzes: „dienstags um 18 Uhr" ist ohne
            sie nicht zu deuten — und „welchen Tag haben wir" ebenso wenig. Ein
            Server in UTC hielt den Termin von gestern bis zwei Uhr nachts für
            kommend. */}
            <Field
              label="Zeitzone"
              hint="In dieser Zone gilt die Uhrzeit — und in ihr zählt die App die Tage."
            >
              <Select
                value={wert.timeZone}
                onChange={(event) =>
                  setEntwurf({ ...wert, timeZone: event.target.value })
                }
              >
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>

            <Button
              variant="secondary"
              className="w-full"
              loading={update.isPending}
              disabled={unverändert}
              onClick={() =>
                update.mutate(
                  {
                    weekday: Number(wert.weekday),
                    intervalWeeks: Number(wert.intervalWeeks),
                    startTime: wert.startTime,
                    timeZone: wert.timeZone,
                  },
                  {
                    onSuccess: () => {
                      setEntwurf(null);
                      toast.success('Rhythmus gespeichert.');
                    },
                  },
                )
              }
            >
              Speichern
            </Button>

            {/* Unter dem Speichern-Knopf und ohne ihn: Er sagt etwas über die
                **Art** der Abende, nicht über ihre Lage — und schreibt deshalb
                sofort, wie der Schalter ganz oben. */}
            <Checkbox
              label="Lobpreis- und Gebetsabende"
              description="Der jeweils letzte Termin im Monat wird ein Abend mit Liedern und Testimony statt mit Thema. Gilt für neue Termine — ein Lobpreisabend, der schon steht, bleibt einer."
              checked={current?.praiseEvenings ?? true}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate(
                  { praiseEvenings: event.target.checked },
                  {
                    onSuccess: () =>
                      toast.success(
                        event.target.checked
                          ? 'Der letzte Abend im Monat wird wieder ein Lobpreisabend.'
                          : 'Ab jetzt werden alle Abende als Standard-Termin angelegt.',
                      ),
                  },
                )
              }
            />
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

/**
 * Der Actionstep der Woche — der Vorsatz, den man die Woche über vor sich
 * herträgt.
 *
 * Eine eigene Karte, obwohl er in derselben Zeile wie der Termin-Rhythmus
 * steht: Er ist keine Aussage darüber, wann ihr euch trefft, sondern darüber,
 * was danach stehen bleibt. Er wohnt nur dort, weil „die Woche" die zwischen
 * zwei Terminen ist.
 */
function WeeklyActionstepCard() {
  const schedule = useMeetingSchedule();
  const update = useUpdateMeetingSchedule();
  const toast = useToast();

  const current = schedule.data?.data;

  return (
    <section>
      <SectionTitle>Actionstep der Woche</SectionTitle>
      <Card>
        <Checkbox
          label={'Auf „Heute" anzeigen'}
          description="Der Vorsatz vom letzten Abend, mit Haken, plus die wöchentliche Erinnerung. An Einheiten und über die Nachbereitung bleibt der Actionstep so oder so."
          checked={current?.weeklyActionstep ?? true}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              { weeklyActionstep: event.target.checked },
              {
                onSuccess: () =>
                  toast.success(
                    event.target.checked
                      ? 'Der Actionstep steht wieder auf „Heute".'
                      : 'Der Actionstep der Woche ist aus.',
                  ),
              },
            )
          }
        />
      </Card>
    </section>
  );
}

function PrayerBuddyConfigCard() {
  const config = usePrayerBuddyConfig();
  const update = useUpdatePrayerBuddyConfig();
  const rotate = useRotatePrayerBuddies();
  const toast = useToast();
  const [weeks, setWeeks] = useState('');

  const current = config.data?.data;
  const value = weeks || String(current?.periodLengthWeeks ?? 2);

  return (
    <section>
      <SectionTitle>Gebets-Rhythmus</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

        {/* Der Schalter steht über allem anderen, denn er entscheidet, ob das
            Übrige überhaupt eine Frage ist. Aus heißt ganz aus: kein Tab, keine
            Karte auf „Heute", keine Benachrichtigungsart. Bestehende Runden
            bleiben stehen und sind beim Wiedereinschalten wieder da. */}
        <Checkbox
          label="Gebetsbuddys"
          description="Alle paar Wochen neue Zweier- und Dreiergruppen, die füreinander beten. Ohne sie fällt der Gebets-Tab weg."
          checked={current?.enabled ?? true}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              { enabled: event.target.checked },
              {
                onSuccess: () =>
                  toast.success(
                    event.target.checked
                      ? 'Gebetsbuddys sind aus.'
                      : 'Gebetsbuddys sind wieder da.',
                  ),
              },
            )
          }
        />

        {current?.enabled !== false && (
          <>
            <p className="text-[11px] leading-relaxed text-stone-400">
              Hier kannst du einstellen, wie viele Wochen eine Gebetsrunde
              dauert. Vorgabe sind zwei Wochen. Die Änderung gilt für die
              Runden, die ab jetzt angelegt werden.
            </p>

            <Field label="Länge einer Runde" hint="Angabe in Wochen">
              <TextInput
                type="number"
                min="1"
                max="12"
                value={value}
                onChange={(event) => setWeeks(event.target.value)}
              />
            </Field>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                loading={update.isPending}
                disabled={Number(value) === current?.periodLengthWeeks}
                onClick={() =>
                  update.mutate(
                    { periodLengthWeeks: Number(value) },
                    {
                      onSuccess: () => toast.success('Rhythmus gespeichert.'),
                    },
                  )
                }
              >
                Speichern
              </Button>
              <Button
                className="flex-1"
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
                Jetzt weiterschalten
              </Button>
            </div>

            {/* Nicht mehr „neu würfeln": seit fünf Runden im Voraus stehen, wird
            nicht neu ausgelost, sondern die nächste geplante vorgezogen. */}
            <p className="text-[11px] leading-relaxed text-stone-400">
              Beendet die laufende Runde und zieht die nächste geplante auf
              heute vor. Danach steht der Vorlauf wieder voll.
            </p>
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
  pending: boolean;
  run: () => void;
}

function JobsCard() {
  const toast = useToast();

  // Die Hooks stehen einzeln da und nicht in einer Schleife — die Reihenfolge
  // von Hook-Aufrufen muss über Renderdurchläufe hinweg dieselbe sein.
  //
  // **Die Erinnerungs-Läufe standen einmal hier und sind weg.** Sieben Knöpfe,
  // die alle dasselbe taten: eine Nachricht von Hand auslösen, die der Cron um
  // neun ohnehin schickt. Sie waren zum Ausprobieren da; was blieb, waren
  // sieben Gelegenheiten, der Gruppe versehentlich etwas zu schicken. Übrig
  // sind die Läufe, die etwas anlegen oder aufräumen.
  const generate = useGenerateMeetings();
  const planRounds = usePlanPrayerBuddyRounds();
  const repairRound = useRepairPrayerBuddyRound();
  const syncAbsences = useSyncAbsences();
  const purgeLocations = usePurgeAbandonedLocations();

  const fail = (error: unknown) => toast.error(errorMessage(error));

  const jobs: Job[] = [
    {
      label: 'Termine vorausplanen',
      hint: 'Legt Standard- und Lobpreis-Termine an, bis sieben im Voraus stehen.',
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
      hint: 'Legt Runden an, bis fünf im Voraus stehen. Meldet niemandem etwas — das passiert, wenn eine Runde beginnt.',
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
      hint: 'Zieht die laufende Runde nach: niemand steht draußen, niemand bleibt allein, keine Gruppe größer als drei. Wird nicht neu gewürfelt.',
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
      hint: 'Sagt Termine ab, für die jemand als abwesend eingetragen ist.',
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
      hint: 'Löscht stillgelegte Orte, an denen kein Termin und niemand mehr hängt.',
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
        {jobs.map((job) => (
          <div
            key={job.label}
            className="flex items-center gap-3 rounded-md border border-line p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-stone-800">{job.label}</p>
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
