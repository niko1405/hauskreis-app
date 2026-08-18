'use client';

/**
 * Die Läufe, die sonst der Zeitplaner im Backend anstößt — hier von Hand
 * auslösbar, mit dem Ergebnis daneben. Nützlich beim Einrichten und wenn
 * jemand wissen will, ob eine Erinnerung wirklich rausging.
 */
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, Select, TextInput } from '@/components/ui/field';
import { ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useGenerateMeetings,
  useMeetingSchedule,
  usePlanPrayerBuddyRounds,
  usePrayerBuddyConfig,
  usePurgeAbandonedLocations,
  useRotatePrayerBuddies,
  useRunActionstepReminders,
  useRunCustomMeetingReminders,
  useRunHostReminders,
  useRunSongReminders,
  useRunTopicReminders,
  useSyncAbsences,
  useUpdateMeetingSchedule,
  useUpdatePrayerBuddyConfig,
} from '@/lib/api/hooks';
import { useState } from 'react';

export function MaintenanceAdmin() {
  return (
    <>
      <MeetingScheduleCard />
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
    startTime: string;
    timeZone: string;
  } | null>(null);

  const current = schedule.data?.data;
  const wert = entwurf ?? {
    weekday: String(current?.weekday ?? 2),
    startTime: current?.startTime ?? '18:00',
    timeZone: current?.timeZone ?? 'Europe/Berlin',
  };

  const unverändert =
    Number(wert.weekday) === current?.weekday &&
    wert.startTime === current?.startTime &&
    wert.timeZone === current?.timeZone;

  return (
    <section>
      <SectionTitle>Termin-Rhythmus</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

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

        <p className="text-[11px] leading-relaxed text-stone-400">
          Gilt für Termine, die der Zeitplaner ab jetzt anlegt. Was schon im
          Kalender steht, behält seinen Tag und seine Zeit — dafür hat längst
          jemand zugesagt.
        </p>

        {current?.updatedBy && (
          <p className="text-[11px] text-stone-400">
            Zuletzt geändert von {current.updatedBy.name}.
          </p>
        )}
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

        <Field
          label="Länge einer Runde"
          hint="In Wochen. Vorgabe sind zwei — neun Personen ergeben Gruppen zu zwei und drei."
        >
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
          Beendet die laufende Runde und zieht die nächste geplante auf heute
          vor. Danach steht der Vorlauf wieder voll.
        </p>

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
  const generate = useGenerateMeetings();
  const planRounds = usePlanPrayerBuddyRounds();
  const syncAbsences = useSyncAbsences();
  const purgeLocations = usePurgeAbandonedLocations();
  const hostReminders = useRunHostReminders();
  const topicReminders = useRunTopicReminders();
  const songReminders = useRunSongReminders();
  const customMeetingReminders = useRunCustomMeetingReminders();
  const actionstepReminders = useRunActionstepReminders();

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
    {
      label: 'Host-Erinnerungen',
      hint: 'Erinnert die Gastgeber der nächsten Termine.',
      pending: hostReminders.isPending,
      run: () =>
        hostReminders.mutate(undefined, {
          onSuccess: (r) => toast.success(`${r.notified} benachrichtigt.`),
          onError: fail,
        }),
    },
    {
      label: 'Themen-Erinnerungen',
      hint: 'Erinnert die, die ein Thema vorbereiten.',
      pending: topicReminders.isPending,
      run: () =>
        topicReminders.mutate(undefined, {
          onSuccess: (r) => toast.success(`${r.notified} benachrichtigt.`),
          onError: fail,
        }),
    },
    {
      label: 'Song-Erinnerungen',
      hint: 'Erinnert an die Songauswahl vor dem Abend.',
      pending: songReminders.isPending,
      run: () =>
        songReminders.mutate(undefined, {
          onSuccess: (r) => toast.success(`${r.notified} benachrichtigt.`),
          onError: fail,
        }),
    },
    {
      label: 'Erinnerungen an besondere Termine',
      hint: 'Geht an alle, nicht nur an Zuständige — einen Geburtstag hat man nicht im Kopf wie den Dienstag.',
      pending: customMeetingReminders.isPending,
      run: () =>
        customMeetingReminders.mutate(undefined, {
          onSuccess: (r) => toast.success(`${r.notified} benachrichtigt.`),
          onError: fail,
        }),
    },
    {
      label: 'Actionstep-Erinnerungen',
      hint: 'Die wöchentliche Erinnerung an den Actionstep.',
      pending: actionstepReminders.isPending,
      run: () =>
        actionstepReminders.mutate(undefined, {
          onSuccess: (r) => toast.success(`${r.notified} benachrichtigt.`),
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
