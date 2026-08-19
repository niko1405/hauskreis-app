'use client';

/**
 * Einen Treffpunkt anlegen oder ändern — von überall dort, wo einer fehlt oder
 * falsch steht: aus dem Archiv, beim Eintragen eines Termins, beim Anlegen
 * eines neuen.
 *
 * Bewusst nur **Orte ohne Gastgeber**, und das inzwischen auch beim Ändern. Ein
 * Zuhause entsteht nicht hier, sondern wenn jemand im Profil seine Adresse
 * einträgt; es heißt nach seinen Bewohner:innen und gehört ihnen. Ein Feld
 * „braucht einen Gastgeber" gäbe es hier also nur, um eine Wohnung ohne
 * Bewohner:innen zu erzeugen — genau den Zustand, den die App gerade loswerden
 * wollte.
 *
 * Übrig bleiben zwei Felder: Name und Anschrift. Kapazität und Gewicht sind
 * hier weg — warum, steht bei `EditSheet`.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { ConflictBanner } from '@/components/ui/states';
import { useLocation, useUpdateLocation } from '@/lib/api/hooks';
import { useLocationForm } from './location-form';
import type { Location } from '@/lib/api/types';

export function LocationSheet({
  open,
  onClose,
  onCreated,
  onSaved,
  location,
}: {
  open: boolean;
  onClose: () => void;
  /** Bekommt den neuen Ort — damit die aufrufende Stelle ihn gleich setzen kann. */
  onCreated?: (location: Location) => void;
  /**
   * Gespeichert, nicht abgebrochen.
   *
   * `onClose` allein sagt das nicht: beide Wege enden dort, und die Liste im
   * Archiv will ihre aufgeklappte Zeile nur nach dem einen von beiden wieder
   * zuklappen.
   */
  onSaved?: () => void;
  /** Gesetzt heißt: bearbeiten statt anlegen. */
  location?: Location;
}) {
  return location ? (
    <EditSheet
      open={open}
      onClose={onClose}
      onSaved={onSaved}
      location={location}
    />
  ) : (
    <CreateSheet open={open} onClose={onClose} onCreated={onCreated} />
  );
}

function CreateSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (location: Location) => void;
}) {
  const form = useLocationForm({
    onCreated: (location) => onCreated?.(location),
    onDone: onClose,
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Treffpunkt anlegen"
      subtitle="Für Orte ohne Gastgeber — bspw. im Park oder am See. Ein Zuhause entsteht über das Profil."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          {form.submitButton}
        </div>
      }
    >
      {form.fields}
    </Sheet>
  );
}

/**
 * Nur Treffpunkte, und nur Name und Anschrift.
 *
 * Eine **Wohnung** wird hier gar nicht mehr bearbeitet. Ihr Name folgt ohnehin
 * den Bewohner:innen, ihre Anschrift steht im Profil, und das Gewicht ist eine
 * Frage an die Gruppe — es lebt jetzt in der Verwaltung, wo Nicht-Admins es
 * nicht einmal sehen. Übrig bliebe ein Formular, in dem alle Felder gesperrt
 * sind.
 *
 * **Kapazität** steht nicht mehr hier, sondern dort, wo man sie beantworten
 * kann: „wie viele passen bei mir rein" ist eine Frage an die Gastgeber:innen,
 * und deren eigene Wohnung liegt im Profil. Bei einem Treffpunkt gab es nie
 * eine sinnvolle Antwort — in einen Park passen alle.
 */
function EditSheet({
  open,
  onClose,
  onSaved,
  location,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  location: Location;
}) {
  // Das Schreiben verlangt einen ETag, und der liegt beim geladenen Einzelstand
  // — die Liste aus dem Archiv bringt keinen mit.
  const resource = useLocation(location.id);
  const update = useUpdateLocation(location.id);

  const current = resource.data?.data ?? location;

  const [name, setName] = useState(current.name);
  const [address, setAddress] = useState(current.address ?? '');

  // Kommt der frische Stand nach (oder ein fremder nach einem Konflikt),
  // übernehmen die Felder ihn — sonst schriebe man über das hinweg, was man
  // gerade nachgeladen bekommen hat.
  useEffect(() => {
    const loaded = resource.data?.data;
    if (!loaded) return;

    setName(loaded.name);
    setAddress(loaded.address ?? '');
  }, [resource.data]);

  const trimmed = name.trim();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${location.name} bearbeiten`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={update.isPending}
            disabled={resource.isLoading || trimmed === ''}
            onClick={() =>
              update.mutate(
                {
                  name: trimmed,
                  address: address.trim() === '' ? null : address.trim(),
                  // Beide trotz PATCH Pflichtfelder (Zod-Vorgabe, siehe
                  // `types.ts`). Mitgeschickt wird, was ohnehin gilt — hier
                  // ändert sich weder das eine noch das andere.
                  hostWeight: current.hostWeight,
                  requiresHost: current.requiresHost,
                },
                {
                  onSuccess: () => {
                    onSaved?.();
                    onClose();
                  },
                },
              )
            }
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}

        <Field label="Name">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Adresse"
          hint="Optional — daraus entsteht der Link zur Karte."
        >
          <TextInput
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Schlossbezirk 10, 76131 Karlsruhe"
          />
        </Field>
      </div>
    </Sheet>
  );
}
