'use client';

/**
 * Ob und wie sich die Gruppe zu Geburtstagen beschenkt.
 *
 * **Aus als Vorgabe, und das ist keine Vorsicht, sondern eine Haltung.** Nicht
 * jeder Hauskreis schenkt sich etwas; für die wären verteilte Zuständigkeiten
 * und Nachrichten darüber ein Ärgernis statt einer Hilfe. Die Geburtstage im
 * Kalender kosten dagegen niemanden etwas — die stehen ohnehin da.
 *
 * **Zwei Arten zu verteilen.** „Der Reihe nach" rechnet die Zuständigkeit aus
 * den Geburtstagen selbst: Wer gerade gefeiert hat, besorgt das Geschenk für
 * den, der als nächstes dran ist. In einem Jahr ist damit jede:r genau einmal
 * dran, und niemand für sich selbst. „Benutzerdefiniert" nimmt stattdessen die
 * Zuteilung, die hier eingetragen ist, und behält sie Runde für Runde bei.
 *
 * **Die Zuteilung steht in beiden Fällen da** — bei „Der Reihe nach" zum
 * Ansehen, bei „Benutzerdefiniert" zum Ändern, in derselben Karte. Wer
 * umstellt, fängt mit genau der Zuteilung an, die bis eben galt.
 */
import { Gift, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { CheckRow } from '@/components/ui/check-row';
import { Field, Select } from '@/components/ui/field';
import { InfoTip } from '@/components/ui/info-tip';
import { Segmented } from '@/components/ui/segmented';
import { CardSkeleton, ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  useBirthdayConfig,
  useGiftPairings,
  useSetGiftPairings,
  useUpdateBirthdayConfig,
} from '@/lib/api/hooks';
import { formatTimestamp } from '@/lib/date';
import type { GiftPairings } from '@/lib/api/types';
import { useAdminDraftSection } from './admin-draft';

type Mode = 'ROTATING' | 'MANUAL';
type Row = GiftPairings['pairings'][number];

/** Für wen wer besorgt — `birthdayPersonId → responsiblePersonId`, leer heißt: noch niemand. */
type Assignment = Record<string, string>;

function assignmentOf(rows: Row[]): Assignment {
  return Object.fromEntries(
    rows.map((row) => [row.birthdayPerson.id, row.responsible?.id ?? '']),
  );
}

export function BirthdayGiftAdmin() {
  const config = useBirthdayConfig();
  const update = useUpdateBirthdayConfig();
  const pairings = useGiftPairings();
  const setPairings = useSetGiftPairings();
  const toast = useToast();

  const [draft, setDraft] = useState<{
    enabled: boolean;
    mode: Mode;
    freezeDays: number;
  } | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);

  const current = config.data?.data;
  const saved = {
    enabled: current?.enabled ?? false,
    mode: current?.mode ?? 'ROTATING',
    freezeDays: current?.freezeDays ?? 14,
  };
  const value = draft ?? saved;

  const stored = pairings.data?.pairings ?? [];
  const rotation = pairings.data?.rotation ?? [];
  const manual = value.enabled && value.mode === 'MANUAL';
  const wasManual = saved.mode === 'MANUAL';

  // Womit „Benutzerdefiniert" anfängt: mit dem, was gilt. War es schon
  // benutzerdefiniert, ist das die gespeicherte Zuteilung — sonst die
  // Rotation, genau wie der Planer beim Wechsel.
  const base = assignmentOf(wasManual ? stored : rotation);
  const pairs = assignment ?? base;
  const storedPairs = assignmentOf(stored);

  const configDirty =
    value.enabled !== saved.enabled ||
    value.mode !== saved.mode ||
    value.freezeDays !== saved.freezeDays;
  // Beim Wechsel auf „Benutzerdefiniert" wird die Zuteilung immer mit
  // geschrieben: Eine früher gespeicherte, längst veraltete stünde sonst wieder
  // in Kraft, und angezeigt wurde die Rotation.
  const pairingsDirty =
    manual &&
    (!wasManual ||
      rotation.some(
        (row) =>
          (pairs[row.birthdayPerson.id] ?? '') !==
          (storedPairs[row.birthdayPerson.id] ?? ''),
      ));
  const gap =
    manual &&
    rotation.length >= 2 &&
    rotation.some((row) => !pairs[row.birthdayPerson.id]);

  useAdminDraftSection('birthdays', {
    dirty: current !== undefined && (configDirty || pairingsDirty),
    invalid: gap ? 'Bei den Geschenken fehlt noch jemand.' : undefined,
    save: async () => {
      // Erst die Einstellungen (mit `If-Match`), dann die Zuteilung (ohne).
      // Umgekehrt höbe das Speichern der Zuteilung die Version, und die
      // Einstellungen bekämen einen Konflikt mit dem eigenen Schritt davor.
      if (configDirty) await update.mutateAsync(value);
      if (pairingsDirty) {
        await setPairings.mutateAsync({
          pairings: Object.entries(pairs)
            .filter(([, responsiblePersonId]) => responsiblePersonId !== '')
            .map(([birthdayPersonId, responsiblePersonId]) => ({
              birthdayPersonId,
              responsiblePersonId,
            })),
        });
      }
      await pairings.refetch();
      setDraft(null);
      setAssignment(null);
    },
    reset: () => {
      setDraft(null);
      setAssignment(null);
    },
  });

  if (config.isLoading) {
    return (
      <section>
        <SectionTitle>Geburtstags-Geschenke</SectionTitle>
        <CardSkeleton />
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>Geburtstags-Geschenke</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

        <CheckRow
          label="Für Geschenke jemanden einteilen"
          hint="Aus: Die Geburtstage stehen im Kalender, aber niemand wird eingeteilt."
          checked={value.enabled}
          onChange={(enabled) => setDraft({ ...value, enabled })}
        />

        {value.enabled && (
          <>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                Wie wird eingeteilt?
                <InfoTip label="Wie wird eingeteilt?">
                  <strong className="font-semibold">Der Reihe nach:</strong> Du
                  besorgst das Geschenk für den, dessen Geburtstag nach deinem
                  kommt. Die App rechnet das selbst aus, auch wenn jemand dazu
                  kommt oder geht.
                  <br />
                  <strong className="font-semibold">
                    Benutzerdefiniert:
                  </strong>{' '}
                  Ihr legt fest, wer für wen besorgt. Jede:r ist genau einmal
                  dran, und für jeden Geburtstag muss jemand eingetragen sein.
                  Kommt jemand dazu oder geht, schließt die App die Lücke und
                  sagt es hier.
                </InfoTip>
              </p>
              <Segmented<Mode>
                fill
                size="sm"
                label="Wie wird eingeteilt?"
                value={value.mode}
                onChange={(mode) => setDraft({ ...value, mode })}
                options={[
                  { value: 'ROTATING', label: 'Der Reihe nach' },
                  { value: 'MANUAL', label: 'Benutzerdefiniert' },
                ]}
              />
            </div>

            <Field
              label="Ab wann steht es fest"
              info={
                <>
                  Ab dieser Frist vor dem Geburtstag ändert sich die Zuteilung
                  nicht mehr — auch nicht, wenn jemand seinen Geburtstag
                  nachträgt oder ihr hier etwas umstellt. Steht schon ein Preis
                  dran, bleibt sie ohnehin.
                </>
              }
            >
              <Select
                value={value.freezeDays}
                onChange={(event) =>
                  setDraft({ ...value, freezeDays: Number(event.target.value) })
                }
              >
                {[7, 14, 21, 30].map((days) => (
                  <option key={days} value={days}>
                    {days} Tage vorher
                  </option>
                ))}
              </Select>
            </Field>

            {/* Der Hinweis, dass hier etwas ohne einen Menschen entschieden
                wurde. „Passt so" schreibt dieselbe Zuteilung noch einmal — dann
                hat jemand hingesehen. */}
            {manual && wasManual && current?.pairingsRepairedAt && (
              <div className="flex gap-2.5 rounded-lg border border-alert-line bg-alert-bg p-3">
                <TriangleAlert
                  size={14}
                  className="mt-0.5 shrink-0 text-alert"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[11px] leading-relaxed text-stone-600">
                    Am {formatTimestamp(current.pairingsRepairedAt)} hat sich
                    die Gruppe geändert, und die App hat die Lücke in der
                    Zuteilung geschlossen. Sieh sie einmal durch.
                  </p>
                  {!pairingsDirty && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={setPairings.isPending}
                      onClick={() =>
                        setPairings.mutate(
                          {
                            pairings: stored.flatMap((row) =>
                              row.responsible
                                ? [
                                    {
                                      birthdayPersonId: row.birthdayPerson.id,
                                      responsiblePersonId: row.responsible.id,
                                    },
                                  ]
                                : [],
                            ),
                          },
                          { onSuccess: () => toast.success('Bestätigt.') },
                        )
                      }
                    >
                      Passt so
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Pairings
              rows={rotation}
              shown={manual ? null : rotation}
              pairs={pairs}
              loading={pairings.isLoading}
              onAssign={(birthdayPersonId, responsiblePersonId) =>
                setAssignment({
                  ...pairs,
                  [birthdayPersonId]: responsiblePersonId,
                })
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
 * Wer besorgt für wen — in Geburtstagsreihenfolge, damit sich die Kette von
 * oben nach unten liest.
 *
 * **Die Richtung steht in jeder Zeile**: links, wer Geburtstag hat, rechts,
 * „wird beschenkt von" und wer besorgt. Ohne das ließe sich dieselbe Liste
 * auch andersherum lesen, und genau die Verwechslung wäre teuer.
 *
 * **Zur Wahl steht nur, wer noch frei ist.** Jede:r besorgt genau ein
 * Geschenk; eine Auswahl, die jemanden zweimal anböte, verspräche etwas, das
 * der Server ablehnt. Gerät man dabei in eine Sackgasse — in der letzten Zeile
 * ist nur noch die Person selbst übrig —, sagt die Zeile das, und eine andere
 * gibt jemanden frei.
 */
function Pairings({
  rows,
  shown,
  pairs,
  loading,
  onAssign,
}: {
  /** Alle mit Geburtstag, in Reihenfolge. */
  rows: Row[];
  /** Die Zuteilung zum Ansehen (`Der Reihe nach`); `null` heißt: zum Ändern. */
  shown: Row[] | null;
  pairs: Assignment;
  loading: boolean;
  onAssign: (birthdayPersonId: string, responsiblePersonId: string) => void;
}) {
  if (loading) return <CardSkeleton />;

  if (rows.length < 2) {
    return (
      <p className="text-[11px] leading-relaxed text-stone-400">
        {rows.length === 0
          ? 'Noch hat niemand seinen Geburtstag eingetragen. Ohne Datum gibt es keinen Platz in der Reihe.'
          : 'Bisher hat nur eine Person ihren Geburtstag eingetragen — zum Beschenken braucht es zwei.'}
      </p>
    );
  }

  const taken = new Set(Object.values(pairs).filter(Boolean));

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
        <Gift size={13} className="text-stone-400" aria-hidden />
        Wer besorgt für wen
      </p>

      <ul className="space-y-2">
        {rows.map((row) => {
          const id = row.birthdayPerson.id;
          const responsible = shown
            ? (shown.find((entry) => entry.birthdayPerson.id === id)
                ?.responsible ?? null)
            : null;
          const chosen = pairs[id] ?? '';
          const options = rows.filter(
            (other) =>
              other.birthdayPerson.id !== id &&
              (other.birthdayPerson.id === chosen ||
                !taken.has(other.birthdayPerson.id)),
          );
          const empty = !shown && chosen === '';

          return (
            <li
              key={id}
              className={cn(
                'flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:gap-3',
                empty ? 'border-alert-line bg-alert-bg/40' : 'border-line',
              )}
            >
              <span className="flex min-w-0 items-center gap-2 sm:flex-1">
                <Avatar person={row.birthdayPerson} size="xs" />
                <span className="truncate text-[12px] font-bold text-stone-800">
                  {row.birthdayPerson.name}
                </span>
                <span className="shrink-0 text-[11px] text-stone-400">
                  {formatBirthday(row.birthday)}
                </span>
              </span>

              <span className="flex min-w-0 items-center gap-2 sm:w-72 sm:shrink-0">
                <span className="shrink-0 text-[11px] text-stone-400">
                  wird beschenkt von
                </span>

                {shown ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Avatar person={responsible} size="xs" />
                    <span className="truncate text-[12px] font-semibold text-stone-700">
                      {responsible?.name ?? 'niemandem'}
                    </span>
                  </span>
                ) : options.length === 0 && chosen === '' ? (
                  <span className="text-[11px] text-alert">
                    Niemand mehr frei — ändere eine andere Zeile.
                  </span>
                ) : (
                  <Select
                    className={cn('min-w-0 flex-1', empty && 'border-alert')}
                    value={chosen}
                    aria-label={`Wer besorgt das Geschenk für ${row.birthdayPerson.name}`}
                    onChange={(event) => onAssign(id, event.target.value)}
                  >
                    <option value="" disabled>
                      Bitte wählen …
                    </option>
                    {options.map((other) => (
                      <option
                        key={other.birthdayPerson.id}
                        value={other.birthdayPerson.id}
                      >
                        {other.birthdayPerson.name}
                      </option>
                    ))}
                  </Select>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** `MM-DD` → „12. Mai". Im Schaltjahr 2000 gerechnet, damit es den 29. Februar gibt. */
function formatBirthday(monthDay: string): string {
  const [month, day] = monthDay.split('-').map(Number);
  return new Date(
    Date.UTC(2000, (month ?? 1) - 1, day ?? 1),
  ).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
