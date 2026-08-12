'use client';

/**
 * „Wo trefft ihr euch?" — Gastgeber und Treffpunkt in **einer** Frage.
 *
 * Vorher waren es zwei Bedienelemente an zwei Stellen: ein Auswahlfeld für den
 * Treffpunkt im Termin-Detail und daneben das Personen-Sheet für den Gastgeber.
 * Aus der Planungstabelle war der Ort überhaupt nicht erreichbar. Dabei ist es
 * eine Entscheidung mit zwei Antworten — bei jemandem zu Hause, oder woanders.
 *
 * Der Server erzwingt das ohnehin (`MeetingService.resolveVenue`):
 *
 * - Eine Person eintragen setzt den Ort mit; ein Ort daneben wird abgewiesen.
 * - Einen Treffpunkt wählen geht nur, wenn **gleichzeitig** der Gastgeber
 *   herausfällt — sonst antwortet er mit „nimm erst den Gastgeber heraus".
 * - Den Gastgeber herausnehmen räumt seine Wohnung mit weg, ein Treffpunkt
 *   bleibt stehen.
 *
 * Zwei getrennte Bedienelemente konnten diese Kopplung nur nacherzählen. Hier
 * schickt jede Wahl beide Felder auf einmal, und die Regel ist keine Fehlermeldung
 * mehr, sondern das Register, in dem man gerade steht.
 *
 * Drei Schritte in einem Sheet, kein Stapel: `Sheet` rendert ohne Portal auf
 * derselben Ebene und registriert je einen eigenen Escape-Handler — zwei
 * übereinander schließen sich gegenseitig.
 */
import { ArrowLeft, Home, MapPin, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { useLocations } from '@/lib/api/hooks';
import { isSelectableWithoutHost } from '@/lib/location';
import { AssignmentPicker } from './assignment-picker';
import { useLocationForm } from './location-form';
import type { Location } from '@/lib/api/types';

/**
 * Was der Termin danach hat.
 *
 * `locationId` fehlt genau dann, wenn eine **Person** gewählt wurde: dort setzt
 * der Server den Ort aus ihrer Wohnung. Ihn hier mitzuschicken wäre nicht nur
 * überflüssig, sondern ein Fehler — `resolveVenue` weist einen Ort neben einem
 * Gastgeber ausdrücklich ab, statt still zu überschreiben.
 */
export interface VenueChoice {
  hostPersonId: string | null;
  locationId?: string | null;
}

type Tab = 'zuhause' | 'treffpunkte';

export function VenueSheet({
  open,
  onClose,
  meetingId,
  hostPersonId,
  locationId,
  withoutSuggestions = false,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  hostPersonId: string | null;
  locationId: string | null;
  /** Für vergangene Abende: nachtragen statt vorschlagen. */
  withoutSuggestions?: boolean;
  onSubmit: (choice: VenueChoice) => void;
}) {
  // Das Register richtet sich nach dem, was dasteht: wer einen Treffpunkt
  // gewählt hat und das Sheet noch einmal öffnet, will meistens einen anderen.
  const [tab, setTab] = useState<Tab>(
    !hostPersonId && locationId ? 'treffpunkte' : 'zuhause',
  );
  const [anlegen, setAnlegen] = useState(false);

  const waehlen = (choice: VenueChoice) => {
    onSubmit(choice);
    onClose();
  };

  if (anlegen) {
    return (
      <NewLocationStep
        onBack={() => setAnlegen(false)}
        onCreated={(location) =>
          waehlen({ hostPersonId: null, locationId: location.id })
        }
      />
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Wo trefft ihr euch?"
      subtitle="Bei jemandem zu Hause — oder woanders."
    >
      <div
        role="tablist"
        aria-label="Art des Orts"
        className="flex border-b border-line"
      >
        <VenueTab
          active={tab === 'zuhause'}
          icon={<Home size={13} />}
          onSelect={() => setTab('zuhause')}
        >
          Zuhause
        </VenueTab>
        <VenueTab
          active={tab === 'treffpunkte'}
          icon={<MapPin size={13} />}
          onSelect={() => setTab('treffpunkte')}
        >
          Treffpunkte
        </VenueTab>
      </div>

      {tab === 'zuhause' ? (
        <AssignmentPicker
          kind="HOST"
          meetingId={meetingId}
          active={open}
          selectedIds={hostPersonId ? [hostPersonId] : []}
          withoutSuggestions={withoutSuggestions}
          // **Ohne** `locationId`: der Server setzt den Ort aus der Wohnung der
          // Person. Ein Ort daneben wäre nicht nur doppelt, sondern ein Fehler.
          onToggle={(personId) => waehlen({ hostPersonId: personId })}
        />
      ) : (
        <PlacesTab
          locationId={locationId}
          onPick={(id) => waehlen({ hostPersonId: null, locationId: id })}
          onNew={() => setAnlegen(true)}
        />
      )}

      {/* Einmal unter beiden Registern, weil es für beide dasselbe heißt: kein
          Gastgeber und kein Treffpunkt. */}
      <button
        type="button"
        onClick={() => waehlen({ hostPersonId: null, locationId: null })}
        className="flex w-full items-center gap-4 rounded-md border-2 border-dashed border-terracotta-100 bg-terracotta-50/30 p-4 text-left transition-colors hover:bg-terracotta-50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-stone-400 shadow-sm">
          <X size={18} />
        </span>
        <span>
          <span className="block font-bold text-terracotta-700">
            Noch offen
          </span>
          <span className="block text-[11px] text-stone-400">
            Weder Gastgeber noch Treffpunkt — ein gültiger Zustand, kein
            Versäumnis
          </span>
        </span>
      </button>
    </Sheet>
  );
}

function VenueTab({
  active,
  icon,
  onSelect,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-2.5 text-sm font-semibold transition-colors',
        active
          ? 'border-terracotta-500 text-terracotta-600'
          : 'border-transparent text-stone-400 hover:text-stone-600',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Die Orte ohne Gastgeber. Ohne Rangliste — und das ist keine Lücke: ein
 * Treffpunkt ist eine wetterabhängige Möglichkeit, niemand, der mal wieder dran
 * wäre.
 */
function PlacesTab({
  locationId,
  onPick,
  onNew,
}: {
  locationId: string | null;
  onPick: (locationId: string) => void;
  onNew: () => void;
}) {
  const locations = useLocations();
  const treffpunkte = (locations.data ?? []).filter(isSelectableWithoutHost);

  return (
    <section className="space-y-2">
      {treffpunkte.length === 0 && (
        <p className="text-xs text-stone-400 italic">
          Noch kein Treffpunkt angelegt.
        </p>
      )}

      {treffpunkte.map((location) => (
        <button
          key={location.id}
          type="button"
          onClick={() => onPick(location.id)}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-md border bg-card p-3.5 text-left shadow-sm transition-colors',
            location.id === locationId
              ? 'border-terracotta-500'
              : 'border-transparent',
            'hover:border-line-strong focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          )}
        >
          <span className="min-w-0">
            <span className="block truncate font-bold text-stone-800">
              {location.name}
            </span>
            {location.address && (
              <span className="block truncate text-[11px] text-stone-400">
                {location.address}
              </span>
            )}
          </span>
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
              location.id === locationId
                ? 'border-terracotta-500 bg-terracotta-500'
                : 'border-line-strong',
            )}
          />
        </button>
      ))}

      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center gap-3 rounded-md border-2 border-dashed border-line-strong p-3.5 text-left text-stone-400 transition-colors hover:bg-canvas"
      >
        <Plus size={16} />
        <span className="text-sm font-semibold">Treffpunkt anlegen</span>
      </button>
    </section>
  );
}

/** Schritt 3 statt Sheet im Sheet — und danach ist der neue Ort gleich gesetzt. */
function NewLocationStep({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (location: Location) => void;
}) {
  const form = useLocationForm({ onCreated, onDone: onBack });

  return (
    <Sheet
      open
      onClose={onBack}
      title="Treffpunkt anlegen"
      subtitle="Für Orte ohne Gastgeber — Park, Café, Gemeindehaus. Ein Zuhause entsteht über das Profil."
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            <ArrowLeft size={14} /> Zurück
          </Button>
          {form.submitButton}
        </div>
      }
    >
      {form.fields}
    </Sheet>
  );
}
