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
 * **Auf dem Telefon stehen die Abzeichen unter dem Namen.** Vorher standen sie
 * daneben, in einem Behälter mit `shrink-0` und `flex-wrap` — und das ist die
 * Kombination, die nicht funktioniert: `shrink-0` gibt keinen Pixel her, der
 * Umbruch greift nie (der Behälter hat keine Breitengrenze, er wächst mit
 * seinem Inhalt), und nachgeben muss die Namensspalte. Bei fünf möglichen
 * Abzeichen blieb vom Namen nichts übrig — die Zeile zeigte, wer jemand *ist*,
 * aber nicht mehr, **wer** es ist.
 *
 * Ab `sm` ist genug Platz, dann stehen sie wieder rechts daneben.
 */
function MemberRow({ person }: { person: PersonListEntry }) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:gap-3">
      {/* Avatar und Name bleiben in jeder Breite beieinander — der Avatar
          gehört zum Namen und nicht über ihn. */}
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
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

      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {person.acceptedAt === null && (
          <Badge variant="info">
            <Clock size={11} />
            eingeladen
          </Badge>
        )}
        {person.awayToday && (
          <Badge variant="alert">
            <Palmtree size={11} />
            unterwegs
          </Badge>
        )}
        {person.playsInstrument && <Badge variant="music">Instrument</Badge>}
        {!person.canHost && <Badge>hostet nicht</Badge>}
        {person.role === 'ADMIN' && (
          <Badge variant="terracotta">
            <Shield size={11} />
            Admin
          </Badge>
        )}
      </div>
    </li>
  );
}
