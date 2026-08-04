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
import { Home, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LocationSheet } from '@/components/domain/location-sheet';
import { useDeleteLocation, useLocations } from '@/lib/api/hooks';
import { isHome, residentNames } from '@/lib/location';
import type { Location } from '@/lib/api/types';

export function LocationsCard() {
  const locations = useLocations();
  const [adding, setAdding] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  if (locations.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const all = locations.data ?? [];
  const retired = all.filter((location) => !location.active).length;
  // Stillgelegte standen bisher immer mit in der Liste, nur gedämpft. Bei einem
  // ehemaligen Zuhause pro Umzug wächst das mit den Jahren zu — und es ist
  // gerade das, was man beim Nachsehen *nicht* meint.
  const shown = showRetired ? all : all.filter((location) => location.active);

  const homes = shown.filter((location) => isHome(location));
  const spots = shown.filter((location) => !isHome(location));

  return (
    <div className="space-y-4">
      {retired > 0 && (
        <label className="flex items-center gap-2 px-1 text-[11px] font-semibold text-stone-500">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(event) => setShowRetired(event.target.checked)}
            className="h-3.5 w-3.5 accent-terracotta-500"
          />
          {retired} stillgelegte{retired === 1 ? 'n' : ''} anzeigen
        </label>
      )}

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
  const toast = useToast();
  const [editing, setEditing] = useState(false);
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

      <IconButton
        label={`${location.name} bearbeiten`}
        onClick={() => setEditing(true)}
      >
        <Pencil size={15} />
      </IconButton>

      {/* Eine Wohnung löst sich auf, indem ihre Bewohner:innen umziehen — der
          Server lehnt es sonst mit 409 ab, und ein Knopf, der immer scheitert,
          ist schlimmer als keiner. */}
      {!home && location.active && (
        <IconButton
          label={`${location.name} entfernen`}
          onClick={async () => {
            const ok = await confirm({
              title: `${location.name} entfernen?`,
              // Was passiert, weiß erst der Server: hängt ein Abend daran,
              // wird der Ort nur stillgelegt. Deshalb hier beide Fälle nennen,
              // statt einen zu versprechen.
              body: 'War die Gruppe hier schon zu Gast, bleibt der Ort im Archiv stehen und verschwindet nur aus der Auswahl. Sonst wird er ganz gelöscht.',
              confirmLabel: 'Entfernen',
              tone: 'danger',
            });
            if (!ok) return;

            remove.mutate(location.id, {
              onSuccess: (result) =>
                toast.success(
                  result.deleted
                    ? `${location.name} ist gelöscht.`
                    : `${location.name} ist stillgelegt — vergangene Abende behalten ihn.`,
                ),
            });
          }}
        >
          <Trash2 size={15} />
        </IconButton>
      )}

      {editing && (
        <LocationSheet
          open
          onClose={() => setEditing(false)}
          location={location}
        />
      )}
    </li>
  );
}
