'use client';

/**
 * Orte im Archiv statt in der Verwaltung.
 *
 * Zwei Sorten, die verschieden behandelt werden:
 *
 * - **Zuhause** — gehört Menschen, heißt nach ihnen. Der Name lässt sich hier
 *   nicht ändern (er wird abgeleitet) und die Wohnung nicht auflösen; beides
 *   geht über das Profil der Bewohner:innen. Was hier hingehört, ist das
 *   Gewicht: wie oft die Gruppe dort sein möchte, ist eine Frage an die
 *   Gruppe, nicht an die Gastgeber:innen.
 * - **Treffpunkt** — gehört niemandem, ist frei bearbeitbar und lässt sich
 *   stilllegen.
 */
import { Home, MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { LocationSheet } from '@/components/domain/location-sheet';
import { useDeleteLocation, useLocations } from '@/lib/api/hooks';
import { isHome, residentNames } from '@/lib/location';
import type { Location } from '@/lib/api/types';

export function LocationsCard() {
  const locations = useLocations();
  const [adding, setAdding] = useState(false);

  if (locations.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const all = locations.data ?? [];
  const homes = all.filter((location) => isHome(location));
  const spots = all.filter((location) => !isHome(location));

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-xs font-bold tracking-wide text-stone-400 uppercase">
          Zuhause
        </h3>
        {homes.length === 0 ? (
          <EmptyState
            title="Noch keine Wohnung"
            hint="Wer hosten möchte, trägt seine Adresse im Profil ein."
          />
        ) : (
          <ul className="space-y-2">
            {homes.map((location) => (
              <LocationRow key={location.id} location={location} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-xs font-bold tracking-wide text-stone-400 uppercase">
          Treffpunkte
        </h3>
        {spots.length > 0 && (
          <ul className="space-y-2">
            {spots.map((location) => (
              <LocationRow key={location.id} location={location} />
            ))}
          </ul>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setAdding(true)}
        >
          <Plus size={14} />
          Treffpunkt anlegen
        </Button>
      </Card>

      <LocationSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function LocationRow({ location }: { location: Location }) {
  const remove = useDeleteLocation();
  const confirm = useConfirm();
  const home = isHome(location);

  return (
    <li
      className={
        'flex items-center gap-3 rounded-md border border-line p-3' +
        (location.active ? '' : ' opacity-60')
      }
    >
      {home ? (
        <Home size={15} className="shrink-0 text-stone-300" />
      ) : (
        <MapPin size={15} className="shrink-0 text-stone-300" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {location.name}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {home
            ? residentNames(location) || 'Niemand wohnt mehr hier'
            : (location.address ?? 'Ohne Anschrift')}
          {home && ` · Gewicht ${location.hostWeight}`}
          {location.capacity !== null && ` · Platz für ${location.capacity}`}
        </p>
      </div>

      {!location.active && <Badge variant="neutral">stillgelegt</Badge>}

      {/* Eine Wohnung löst sich auf, indem ihre Bewohner:innen umziehen — der
          Server lehnt es sonst mit 409 ab, und ein Knopf, der immer scheitert,
          ist schlimmer als keiner. */}
      {!home && location.active && (
        <IconButton
          label={`${location.name} stilllegen`}
          onClick={async () => {
            const ok = await confirm({
              title: `${location.name} stilllegen?`,
              body: 'Vergangene Termine behalten ihn. Für kommende Abende wird er nicht mehr vorgeschlagen.',
              confirmLabel: 'Stilllegen',
              tone: 'danger',
            });
            if (ok) remove.mutate(location.id);
          }}
        >
          <Trash2 size={15} />
        </IconButton>
      )}
    </li>
  );
}
