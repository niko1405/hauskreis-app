'use client';

/**
 * Die Läufe, die sonst der Zeitplaner im Backend anstößt — hier von Hand
 * auslösbar, mit dem Ergebnis daneben. Nützlich beim Einrichten und wenn
 * jemand wissen will, ob eine Erinnerung wirklich rausging.
 */
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useCarryOverTopics,
  useGenerateMeetings,
  usePlanPrayerBuddyRounds,
  usePrayerBuddyConfig,
  useRotatePrayerBuddies,
  useRunActionstepReminders,
  useRunHostReminders,
  useRunSongReminders,
  useRunTopicReminders,
  useSyncAbsences,
  useUpdatePrayerBuddyConfig,
} from '@/lib/api/hooks';
import { useState } from 'react';

export function MaintenanceAdmin() {
  return (
    <>
      <PrayerBuddyConfigCard />
      <JobsCard />
    </>
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
          <ConflictBanner
            onReload={() => void config.refetch()}
            onDismiss={update.dismissConflict}
          />
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
                  onError: (error) => toast.error(errorMessage(error)),
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
                onError: (error) => toast.error(errorMessage(error)),
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
  const carryOver = useCarryOverTopics();
  const syncAbsences = useSyncAbsences();
  const hostReminders = useRunHostReminders();
  const topicReminders = useRunTopicReminders();
  const songReminders = useRunSongReminders();
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
      label: 'Laufendes Thema übertragen',
      hint: 'Belegt kommende Termine mit dem Thema, das noch läuft.',
      pending: carryOver.isPending,
      run: () =>
        carryOver.mutate(undefined, {
          onSuccess: (r) => toast.success(`${r.filled} Termine vorbelegt.`),
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
