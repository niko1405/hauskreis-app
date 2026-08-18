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
 * dran, und niemand für sich selbst. „Fest" nimmt stattdessen die Zuteilung,
 * die hier darunter steht, und behält sie Runde für Runde bei.
 */
import { Gift, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { CardSkeleton, ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useBirthdayConfig,
  useGiftPairings,
  useSetGiftPairings,
  useUpdateBirthdayConfig,
} from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/errors';
import { formatTimestamp } from '@/lib/date';

export function BirthdayGiftAdmin() {
  const config = useBirthdayConfig();
  const update = useUpdateBirthdayConfig();
  const toast = useToast();

  const [draft, setDraft] = useState<{
    enabled: boolean;
    mode: 'ROTATING' | 'MANUAL';
    freezeDays: string;
  } | null>(null);

  const current = config.data?.data;

  if (config.isLoading) {
    return (
      <section>
        <SectionTitle>Geburtstags-Geschenke</SectionTitle>
        <CardSkeleton />
      </section>
    );
  }

  const value = draft ?? {
    enabled: current?.enabled ?? false,
    mode: current?.mode ?? 'ROTATING',
    freezeDays: String(current?.freezeDays ?? 14),
  };

  const unchanged =
    value.enabled === current?.enabled &&
    value.mode === current?.mode &&
    Number(value.freezeDays) === current?.freezeDays;

  return (
    <section>
      <SectionTitle>Geburtstags-Geschenke</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner
            onReload={() => void config.refetch()}
            onDismiss={update.dismissConflict}
          />
        )}

        <Checkbox
          label="Für Geschenke jemanden einteilen"
          description="Aus heißt: Geburtstage stehen im Kalender, aber niemand bekommt eine Aufgabe."
          checked={value.enabled}
          onChange={(event) =>
            setDraft({ ...value, enabled: event.target.checked })
          }
        />

        <Field
          label="Wie wird eingeteilt?"
          hint="„Der Reihe nach“ heißt: Du besorgst das Geschenk für den, dessen Geburtstag nach deinem kommt."
        >
          <Select
            value={value.mode}
            disabled={!value.enabled}
            onChange={(event) =>
              setDraft({
                ...value,
                mode: event.target.value as 'ROTATING' | 'MANUAL',
              })
            }
          >
            <option value="ROTATING">Der Reihe nach</option>
            <option value="MANUAL">Fest zugeteilt</option>
          </Select>
        </Field>

        <Field
          label="Ab wann steht es fest"
          hint="In Tagen vor dem Geburtstag. Danach ändert sich die Zuteilung nicht mehr — auch nicht, wenn jemand seinen Geburtstag nachträgt."
        >
          <Select
            value={value.freezeDays}
            disabled={!value.enabled}
            onChange={(event) =>
              setDraft({ ...value, freezeDays: event.target.value })
            }
          >
            {[7, 14, 21, 30].map((days) => (
              <option key={days} value={days}>
                {days} Tage vorher
              </option>
            ))}
          </Select>
        </Field>

        <Button
          variant="secondary"
          disabled={unchanged}
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              {
                enabled: value.enabled,
                mode: value.mode,
                freezeDays: Number(value.freezeDays),
              },
              {
                onSuccess: () => {
                  setDraft(null);
                  toast.success('Gespeichert — die Zuteilung zieht nach.');
                },
              },
            )
          }
        >
          Speichern
        </Button>

        {current?.updatedBy && (
          <p className="text-[11px] text-stone-400">
            Zuletzt geändert von {current.updatedBy.name}.
          </p>
        )}
      </Card>

      {current?.enabled && current.mode === 'MANUAL' && (
        <PairingsCard repairedAt={current.pairingsRepairedAt} />
      )}
    </section>
  );
}

/**
 * Die feste Zuteilung: wer besorgt das Geschenk für wen.
 *
 * **Gespeichert wird sie als Ganzes**, nicht Zeile für Zeile — eine Zuteilung
 * stimmt nur vollständig. Wer B von A auf C umhängt, muss auch wissen, was aus
 * A wird; zwei Aufrufe hintereinander hätten dazwischen einen Zustand, den
 * niemand wollte, und den der Planer in der Zwischenzeit ausrollen würde.
 *
 * Aufgelistet sind **alle** mit eingetragenem Geburtstag, auch die ohne
 * Zuständigen: Ein Loch ist genau das, was man hier sehen soll.
 */
function PairingsCard({ repairedAt }: { repairedAt: string | null }) {
  const pairings = useGiftPairings();
  const save = useSetGiftPairings();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  if (pairings.isLoading) return <CardSkeleton />;

  const rows = pairings.data?.pairings ?? [];
  const current = Object.fromEntries(
    rows.map((row) => [row.birthdayPerson.id, row.responsible?.id ?? '']),
  );
  const value = draft ?? current;

  const unchanged = rows.every(
    (row) => value[row.birthdayPerson.id] === current[row.birthdayPerson.id],
  );

  return (
    <Card className="mt-2 space-y-4">
      {/* Der Hinweis, dass hier etwas ohne einen Menschen entschieden wurde.
          Er verschwindet mit dem Speichern — dann hat jemand hingesehen. */}
      {repairedAt && (
        <div className="flex gap-2.5 rounded-lg border border-alert-line bg-alert-bg p-3">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-alert" />
          <p className="text-[11px] leading-relaxed text-stone-600">
            Am {formatTimestamp(repairedAt)} hat sich die Gruppe geändert, und
            die Zuteilung war danach lückenhaft. Sie wurde automatisch
            geschlossen — sieh sie einmal durch und speichere.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.birthdayPerson.id}
            className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="flex min-w-0 items-center gap-2 sm:flex-1">
              <Avatar person={row.birthdayPerson} size="xs" />
              <span className="truncate text-[12px] font-bold text-stone-800">
                {row.birthdayPerson.name}
              </span>
              <Gift size={12} className="shrink-0 text-stone-300" />
            </span>

            <Select
              className="sm:w-48"
              value={value[row.birthdayPerson.id] ?? ''}
              onChange={(event) =>
                setDraft({
                  ...value,
                  [row.birthdayPerson.id]: event.target.value,
                })
              }
            >
              <option value="">Niemand</option>
              {rows
                .filter(
                  (other) => other.birthdayPerson.id !== row.birthdayPerson.id,
                )
                .map((other) => (
                  <option
                    key={other.birthdayPerson.id}
                    value={other.birthdayPerson.id}
                  >
                    {other.birthdayPerson.name}
                  </option>
                ))}
            </Select>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="text-[11px] leading-relaxed text-stone-400">
          Noch hat niemand seinen Geburtstag eingetragen. Ohne Datum gibt es
          keinen Platz in der Reihe.
        </p>
      )}

      <Button
        variant="secondary"
        disabled={unchanged}
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            {
              pairings: Object.entries(value)
                // Leer heißt „niemand" und ist ein gültiger Zustand — er wird
                // weggelassen statt als Zuteilung auf nichts geschickt.
                .filter(([, responsiblePersonId]) => responsiblePersonId !== '')
                .map(([birthdayPersonId, responsiblePersonId]) => ({
                  birthdayPersonId,
                  responsiblePersonId,
                })),
            },
            {
              onSuccess: () => {
                setDraft(null);
                toast.success('Zuteilung gespeichert.');
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }
      >
        Zuteilung speichern
      </Button>
    </Card>
  );
}
