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
import { Home, MapPin, Navigation, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LocationSheet } from '@/components/domain/location-sheet';
import { useDeleteLocation, useLocations } from '@/lib/api/hooks';
import { isHome } from '@/lib/location';
import { mapsUrl } from '@/lib/meeting';
import { SwipeActions } from '@/components/ui/swipe-actions';
import type { Location } from '@/lib/api/types';
import { ListTab } from './list-tab';

export type PlaceScope = 'zuhause' | 'treffpunkte';

/**
 * Zwei Register statt zwei Karten untereinander: Wer nach einem Treffpunkt
 * sucht, soll nicht an allen Wohnungen vorbeiscrollen. Angelegt wird ein Treffpunkt über
 * das „+" unten rechts, das auf diesem Register erscheint (`archive-screen`).
 *
 * **Stillgelegte stehen hier nicht**, auch nicht hinter einem Haken: Ein
 * ehemaliges Zuhause pro Umzug wüchse mit den Jahren zu, und genau das meint
 * man beim Nachsehen nicht. An den Abenden, an denen die Gruppe dort war,
 * stehen sie weiterhin.
 */
export function LocationsCard({
  scope,
  onScope,
}: {
  scope: PlaceScope;
  onScope: (scope: PlaceScope) => void;
}) {
  const locations = useLocations();

  const active = (locations.data ?? []).filter((location) => location.active);
  const homes = active.filter((location) => isHome(location));
  const spots = active.filter((location) => !isHome(location));

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Orte filtern"
        className="flex border-b border-line"
      >
        <ListTab
          active={scope === 'zuhause'}
          count={locations.isLoading ? undefined : homes.length}
          onSelect={() => onScope('zuhause')}
        >
          Zuhause
        </ListTab>
        <ListTab
          active={scope === 'treffpunkte'}
          count={locations.isLoading ? undefined : spots.length}
          onSelect={() => onScope('treffpunkte')}
        >
          Treffpunkte
        </ListTab>
      </div>

      {locations.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : scope === 'zuhause' ? (
        homes.length === 0 ? (
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
        )
      ) : spots.length === 0 ? (
        <EmptyState
          title="Noch kein Treffpunkt"
          hint={'Park, Café, Gemeindehaus — über das „+" unten rechts.'}
        />
      ) : (
        <ul className="space-y-2 pb-24">
          {spots.map((location) => (
            <SpotRow key={location.id} location={location} />
          ))}
        </ul>
      )}
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
    <li className="flex items-center gap-3 rounded-md border border-line bg-card p-3">
      <Home size={15} className="shrink-0 text-stone-300" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {location.name}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {location.address || 'Keine Adresse'}
        </p>
      </div>

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

/**
 * Ein Treffpunkt: gehört niemandem, also frei bearbeitbar und entfernbar.
 *
 * Stift und Papierkorb liegen hinter einem Wisch nach links (am Rechner hinter
 * dem Zeiger über der Zeile), überall gleich, ob mit Anschrift oder ohne. Der
 * Maps-Pfeil bleibt sichtbar: Die Knöpfe liegen neben der Zeile und nicht
 * darin.
 */
function SpotRow({ location }: { location: Location }) {
  const [editing, setEditing] = useState(false);
  const remove = useDeleteLocation();
  const confirm = useConfirm();
  const toast = useToast();

  const entfernen = async () => {
    const ok = await confirm({
      title: `${location.name} entfernen?`,
      // Was passiert, weiß erst der Server: hängt ein Abend daran, wird der Ort
      // nur stillgelegt. Deshalb hier beide Fälle nennen, statt einen zu
      // versprechen.
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
            : `${location.name} ist stillgelegt — vergangene Termine behalten ihn.`,
        ),
    });
  };

  return (
    <li>
      <SwipeActions
        className="rounded-md border border-line"
        actions={[
          {
            icon: <Pencil size={15} />,
            label: `${location.name} bearbeiten`,
            onClick: () => setEditing(true),
          },
          {
            icon: <Trash2 size={15} />,
            label: `${location.name} entfernen`,
            tone: 'danger',
            onClick: () => void entfernen(),
          },
        ]}
      >
        <div className="flex items-center gap-3 p-3">
          <MapPin size={15} className="shrink-0 text-stone-300" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-stone-800">
              {location.name}
            </p>
            <p className="truncate text-[11px] text-stone-400">
              {location.address ?? 'Ohne Anschrift'}
            </p>
          </div>

          {location.address && (
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
        </div>
      </SwipeActions>

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
