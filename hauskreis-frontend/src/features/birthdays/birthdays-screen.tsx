'use client';

/**
 * Das Register „Geburtstage" im Termin-Bildschirm.
 *
 * Drei Abschnitte, und die Reihenfolge ist die Antwort auf „warum bin ich
 * hier": erst die **eigene Aufgabe** (habe ich etwas zu besorgen?), dann
 * **wer als nächstes dran ist**, zuletzt die **Liste aller** — die ist ein
 * Nachschlagewerk und keine Nachricht.
 *
 * **Vergangene Geburtstage gibt es nicht.** Wer gestern gefeiert hat, steht
 * ganz unten in „Kommende", nämlich mit seinem Geburtstag in einem Jahr. Das
 * ist keine Vereinfachung, sondern die Bauart des Datenmodells: Je Person gibt
 * es genau eine offene Runde, und das ist die nächste. Was war, steht nur noch
 * in den eigenen früheren Zuständigkeiten.
 */
import { ChevronDown, Gift, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { Avatar } from '@/components/ui/avatar';
import { useBirthdays } from '@/lib/api/hooks';
import { formatDayMonth } from '@/lib/date';
import { BirthdayCard, MyDutyCard } from './birthday-card';

export function BirthdaysScreen() {
  const birthdays = useBirthdays();
  const [showPast, setShowPast] = useState(false);

  if (birthdays.isLoading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (birthdays.error) {
    return (
      <div>
        <ErrorState error={birthdays.error} />
      </div>
    );
  }

  const data = birthdays.data;
  if (!data) return null;

  const withBirthdate = data.members.filter((member) => member.birthdate);
  const without = data.members.filter((member) => !member.birthdate);

  return (
    <div className="space-y-6 pb-4">
      {data.config.enabled && (data.myNext || data.myPast.length > 0) && (
        <section>
          <SectionTitle>Deine Aufgabe</SectionTitle>

          {data.myNext ? (
            <MyDutyCard occasion={data.myNext} />
          ) : (
            <Card>
              <p className="text-[11px] leading-relaxed text-stone-400">
                Gerade besorgst du für niemanden ein Geschenk. Das wechselt mit
                jedem Geburtstag, der vorbeigeht.
              </p>
            </Card>
          )}

          {data.myPast.length > 0 && (
            <details
              className="group mt-2"
              open={showPast}
              onToggle={(event) => setShowPast(event.currentTarget.open)}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-line bg-card px-4 py-2.5 text-[11px] font-semibold text-stone-500 [&::-webkit-details-marker]:hidden">
                Früher warst du dran ({data.myPast.length})
                <ChevronDown
                  size={14}
                  className="text-stone-400 transition-transform group-open:rotate-180"
                />
              </summary>

              <ul className="mt-2 space-y-1.5">
                {data.myPast.map((occasion) => (
                  <li
                    key={occasion.id}
                    className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2"
                  >
                    <Avatar person={occasion.person} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-700">
                      {occasion.person.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-stone-400">
                      {formatDayMonth(occasion.occursOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section>
        <SectionTitle>Kommende</SectionTitle>

        {data.upcoming.length === 0 ? (
          <EmptyState
            title="Noch keine Geburtstage"
            hint="Sobald jemand seinen Geburtstag im Profil einträgt, steht er hier."
          />
        ) : (
          <div className="space-y-2">
            {data.upcoming.map((occasion) => (
              <BirthdayCard key={occasion.id} occasion={occasion} />
            ))}
          </div>
        )}
      </section>

      {!data.config.enabled && (
        <Card className="flex gap-3">
          <Gift size={16} className="mt-0.5 shrink-0 text-stone-300" />
          <p className="text-[11px] leading-relaxed text-stone-400">
            Für Geschenke ist niemand eingeteilt — die Gruppe hat das
            ausgeschaltet. Die Geburtstage stehen trotzdem hier und im Kalender.
          </p>
        </Card>
      )}

      <section>
        <SectionTitle>Alle Mitglieder</SectionTitle>
        <Card className="space-y-2">
          <ul className="space-y-2">
            {withBirthdate.map((member) => (
              <li
                key={member.person.id}
                className="flex items-center gap-3 rounded-md border border-line p-3"
              >
                <Avatar person={member.person} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-stone-800">
                  {member.person.name}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-stone-500">
                  {formatDayMonth(member.birthdate!)}
                </span>
              </li>
            ))}
          </ul>

          {/* Wer keinen eingetragen hat, steht dabei — und zwar mit dem
              Grund. Ohne Datum gibt es keinen Platz in der Reihe: Die Person
              bekommt nichts und besorgt nichts, bis sie ihn nachträgt. */}
          {without.length > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="flex items-center gap-1.5 text-[11px] text-stone-400">
                <Sparkles size={11} />
                Ohne eingetragenen Geburtstag — im Profil nachtragbar
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {without.map((member) => (
                  <li
                    key={member.person.id}
                    className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[11px] text-stone-500"
                  >
                    <Avatar person={member.person} size="xs" />
                    {member.person.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
