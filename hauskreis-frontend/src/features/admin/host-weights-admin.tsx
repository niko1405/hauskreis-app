'use client';

/**
 * Wie oft die Gruppe bei wem sein möchte.
 *
 * Die Zahl stand vorher im Archiv, sichtbar für alle und dort auch änderbar.
 * Beides war falsch: sie ist keine Eigenschaft der Wohnung, sondern eine
 * Aussage der Gruppe über ihre Gastgeber:innen — „bei dir sind wir gern öfter"
 * liest sich neben dem eigenen Namen anders als in einer Verwaltungsliste. Und
 * eine 0,5 zu sehen, die man nicht ändern kann und deren Herkunft man nicht
 * kennt, wirft nur Fragen auf.
 *
 * Deshalb hier, hinter `RequireAdmin`. Der Server erzwingt das nicht —
 * `PATCH …/locations/:id` steht jedem Mitglied offen, weil Orte anzulegen und
 * zu pflegen ausdrücklich niemandes Vorrecht ist. Das ist eine Frage der
 * Oberfläche, keine Sicherheitsgrenze, und sie so zu behandeln wäre eine
 * Sicherheit, die keine ist.
 */
import { Home } from 'lucide-react';
import { useState } from 'react';
import { Card, SectionTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useLocations, useSetHostWeight } from '@/lib/api/hooks';
import { isHome, residentNames } from '@/lib/location';
import type { Location } from '@/lib/api/types';

export function HostWeightsAdmin() {
  const locations = useLocations();

  // Nur bewohnte Wohnungen: eine leere steht in keiner Rotation, und ein
  // Treffpunkt gehört gar nicht erst hinein — er ist eine wetterabhängige
  // Möglichkeit, nicht jemand, der mal wieder dran wäre.
  const homes = (locations.data ?? []).filter(
    (location) => isHome(location) && location.active,
  );

  return (
    <section>
      <SectionTitle>Gewichtung</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[11px] leading-relaxed text-stone-400">
          Wie oft die Gruppe bei wem sein möchte, im Verhältnis zueinander.
          <strong className="font-semibold text-stone-500"> 1</strong> heißt so
          oft wie alle anderen,
          <strong className="font-semibold text-stone-500"> 0</strong> heißt:
          nie vorschlagen. Wer sich zusammen eine Wohnung teilt, teilt sich auch
          die Zahl.
        </p>

        {locations.isLoading && <Skeleton className="h-24 w-full" />}

        <ul className="space-y-2">
          {homes.map((location) => (
            <WeightRow key={location.id} location={location} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function WeightRow({ location }: { location: Location }) {
  const setWeight = useSetHostWeight();
  const toast = useToast();
  const [draft, setDraft] = useState(String(location.hostWeight));

  const value = Number(draft);
  const changed = draft !== '' && value !== location.hostWeight;

  // Gespeichert wird beim Verlassen des Feldes, nicht bei jedem Tastendruck:
  // „0,5" durchläuft „0," und wäre zwischendurch eine Null.
  const save = () => {
    if (!changed || Number.isNaN(value)) {
      setDraft(String(location.hostWeight));
      return;
    }

    setWeight.mutate(
      { locationId: location.id, hostWeight: value },
      {
        onSuccess: () => toast.success(`${location.name}: ${value}.`),
        onError: () => setDraft(String(location.hostWeight)),
      },
    );
  };

  return (
    <li className="flex items-center gap-3 rounded-md border border-line p-3">
      <Home size={15} className="shrink-0 text-stone-300" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {location.name}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {residentNames(location)}
        </p>
      </div>

      <input
        type="number"
        min="0"
        max="99"
        step="0.5"
        value={draft}
        aria-label={`Gewicht für ${location.name}`}
        disabled={setWeight.isPending}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        className="w-20 shrink-0 rounded-md border border-line bg-white px-2 py-1.5 text-right text-sm font-bold text-stone-800 tabular-nums"
      />
    </li>
  );
}
