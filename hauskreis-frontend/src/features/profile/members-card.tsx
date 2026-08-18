'use client';

/**
 * Wer alles dabei ist — sichtbar für alle, nicht nur für Admins.
 *
 * Die Verwaltung unter `/admin` bleibt, wie sie ist: sie ist zum **Einladen und
 * Entfernen** da. Diese Karte beantwortet eine andere Frage — „wer gehört
 * eigentlich dazu, und wer kann gerade was" —, und die stellt sich jede:r, nicht
 * nur wer Rechte hat.
 *
 * Die Abzeichen sind deshalb die, nach denen man beim Planen sucht: Instrument,
 * hostet gerade nicht, gerade abwesend, Einladung offen.
 */
import { Clock, Palmtree, Shield } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, SectionTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';
import { usePeople } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { PersonListEntry } from '@/lib/api/types';

export function MembersCard() {
  const people = usePeople();

  // Ausgetretene bleiben als Zeile im Archiv stehen, damit vergangene Abende
  // weiter zeigen, wer gehostet hat — in „wer ist dabei" gehören sie nicht.
  const members = (people.data ?? []).filter((person) => person.active);

  return (
    <section>
      <SectionTitle>
        Alle Mitglieder{members.length > 0 && ` (${members.length})`}
      </SectionTitle>
      <Card className="space-y-2">
        {people.isLoading && <Skeleton className="h-24 w-full" />}

        <ul className="space-y-2">
          {members.map((person) => (
            <MemberRow key={person.id} person={person} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/**
 * Eine Zeile: Avatar, Name, Abzeichen.
 *
 * **Wie viele Abzeichen es sind, entscheidet die Form der Zeile.** Bis zu zwei
 * stehen auch auf dem Telefon neben dem Namen: sie sind zusammen schmal genug,
 * der Name weicht per `truncate` und bleibt lesbar, und eine zweite Zeile für
 * „Admin" allein wäre ein Absatz für ein Wort. Ab dem dritten wird es eng, und
 * dann rutschen sie darunter.
 *
 * Vorher stand hier ein fester Umbruch ab Mobilgröße, und davor gar keiner: ein
 * Behälter mit `shrink-0` **und** `flex-wrap`, also die Kombination, die nicht
 * funktioniert — `shrink-0` gibt keinen Pixel her, der Umbruch greift nie (der
 * Behälter hat keine Breitengrenze, er wächst mit seinem Inhalt), und nachgeben
 * muss die Namensspalte. Bei fünf Abzeichen blieb vom Namen nichts übrig.
 *
 * `shrink-0` steht deshalb jetzt nur im Zweig, in dem es stimmt: bei höchstens
 * zwei Abzeichen ist die Breite beschränkt und das Nachgeben ist die richtige
 * Aufgabe für den Namen. Ab `sm` ist ohnehin Platz für alles nebeneinander.
 */
function MemberRow({ person }: { person: PersonListEntry }) {
  // Erst sammeln, dann zählen — die Anzahl bestimmt das Layout, und sie zweimal
  // von Hand aus denselben Bedingungen abzuleiten hielte nicht lange.
  const badges: React.ReactNode[] = [];

  if (person.acceptedAt === null) {
    badges.push(
      <Badge key="invited" variant="info">
        <Clock size={11} />
        eingeladen
      </Badge>,
    );
  }
  if (person.awayToday) {
    badges.push(
      <Badge key="away" variant="alert">
        <Palmtree size={11} />
        unterwegs
      </Badge>,
    );
  }
  if (person.playsInstrument) {
    badges.push(
      <Badge key="instrument" variant="music">
        Instrument
      </Badge>,
    );
  }
  if (!person.canHost) {
    badges.push(<Badge key="nohost">hostet nicht</Badge>);
  }
  if (person.role === 'ADMIN') {
    badges.push(
      <Badge key="admin" variant="terracotta">
        <Shield size={11} />
        Admin
      </Badge>,
    );
  }

  const inline = badges.length <= 2;

  return (
    <li
      className={cn(
        'flex gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:gap-3',
        inline ? 'flex-row items-center' : 'flex-col',
      )}
    >
      {/* Avatar und Name bleiben in jeder Breite beieinander — der Avatar
          gehört zum Namen und nicht über ihn. */}
      <div
        className={cn(
          'flex min-w-0 items-center gap-3 sm:flex-1',
          inline && 'flex-1',
        )}
      >
        <Avatar person={person} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-stone-800">
            {person.name}
          </p>
          {person.username && (
            <p className="truncate text-[11px] text-stone-400">
              @{person.username}
            </p>
          )}
        </div>
      </div>

      {badges.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 sm:justify-end',
            inline && 'shrink-0 justify-end',
          )}
        >
          {badges}
        </div>
      )}
    </li>
  );
}
