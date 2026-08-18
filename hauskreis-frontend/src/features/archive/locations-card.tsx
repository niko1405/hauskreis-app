'use client';

/**
 * Orte im Archiv statt in der Verwaltung.
 *
 * Zwei Sorten, die verschieden behandelt werden:
 *
 * - **Zuhause** — gehört Menschen, heißt nach ihnen. Hier steht es nur: Name,
 *   Anschrift, Weg dorthin. Ändern lässt sich nichts davon an dieser Stelle,
 *   und das ist keine Lücke — der Name folgt den Bewohner:innen, die Anschrift
 *   steht in ihrem Profil, und das Gewicht ist eine Frage an die Gruppe, die
 *   in der Verwaltung beantwortet wird.
 * - **Treffpunkt** — gehört niemandem, ist frei bearbeitbar und lässt sich
 *   stilllegen. Zu ändern gibt es Name und Anschrift.
 */
import { Home, MapPin, Navigation, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LocationSheet } from '@/components/domain/location-sheet';
import { useDeleteLocation, useLocations } from '@/lib/api/hooks';
import { isHome } from '@/lib/location';
import { mapsUrl } from '@/lib/meeting';
import type { Location } from '@/lib/api/types';
import { useLongPress } from '@/components/ui/use-long-press';
import { cn } from '@/lib/cn';

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
              <HomeRow key={location.id} location={location} />
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
              <SpotRow key={location.id} location={location} />
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

/**
 * Eine Wohnung: Name, Anschrift, Weg dorthin. Sonst nichts.
 *
 * Kein Stift, denn es gäbe nichts zu ändern — der Name folgt den
 * Bewohner:innen, die Anschrift steht im Profil. Kein Gewicht, weil das eine
 * Frage an die Gruppe ist und in die Verwaltung gehört, nicht in eine Liste,
 * die alle sehen. Und keine Kapazität: „wie viele passen bei mir rein"
 * beantwortet, wer dort wohnt.
 */
function HomeRow({ location }: { location: Location }) {
  return (
    <li
      className={
        'flex items-center gap-3 rounded-md border border-line p-3' +
        (location.active ? '' : ' opacity-60')
      }
    >
      <Home size={15} className="shrink-0 text-stone-300" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {location.name}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {location.address || 'Keine Adresse'}
        </p>
      </div>

      {!location.active && <Badge variant="neutral">stillgelegt</Badge>}

      {/* Der Grund, warum die Anschrift überhaupt gespeichert wird: damit man
          am Dienstagabend nicht abtippen muss, wo es hingeht. */}
      {(location.address || location.latitude !== null) && (
        <a
          href={mapsUrl(location)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${location.name} in Maps öffnen`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-shell hover:text-stone-600"
        >
          <Navigation size={15} />
        </a>
      )}
    </li>
  );
}

/** Ein Treffpunkt: gehört niemandem, also frei bearbeitbar und stilllegbar. */
function SpotRow({ location }: { location: Location }) {
  const remove = useDeleteLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { handlers, selectNone } = useLongPress(() => setRevealed(true));

  return (
    <li
      {...handlers}
      className={cn(
        'flex items-center gap-3 transition-colors bg-card rounded-md border p-3' +
        (location.active ? '' : ' opacity-60'),
        revealed ? 'border-terracotta-100 bg-terracotta-50/40' : 'border-line',
        selectNone,
      )}
    >
      <MapPin size={15} className="shrink-0 text-stone-300" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {location.name}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {location.address ?? 'Ohne Anschrift'}
        </p>
      </div>

      {!location.active && <Badge variant="neutral">stillgelegt</Badge>}

      {location.address ? (
        <>
          {!revealed && (
            <a
              href={mapsUrl(location)}
              target="_blank"
              rel="noreferrer"
              aria-label={`${location.name} in Maps öffnen`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-shell hover:text-stone-600"
            >
              <Navigation size={15} />
            </a>
          )}
        </>
      ) : (
        <>
          <IconButton
            label={`${location.name} bearbeiten`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
          </IconButton>

          {location.active && (
            <IconButton
              label={`${location.name} entfernen`}
              onClick={async () => {
                const ok = await confirm({
                  title: `${location.name} entfernen?`,
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
        </>
      )}

      {revealed && (
        <>
          <IconButton
            label={`${location.name} bearbeiten`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
          </IconButton>

          {location.active && (
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

          {/* Ein Weg zurück, ohne die Seite zu verlassen. Ohne ihn bliebe die
                    Zeile aufgeklappt, bis die Liste neu lädt. */}
          <IconButton label="Fertig" onClick={() => setRevealed(false)}>
            <X size={14} />
          </IconButton>
        </>
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
