'use client';

/**
 * Das Formular „Treffpunkt anlegen" ohne Hülle — Felder und Fußzeile getrennt.
 *
 * Herausgelöst aus `LocationSheet`, wie `AssignmentPicker` aus
 * `AssignmentSheet`: das Ort-Sheet braucht es als einen seiner Schritte, und
 * ein Sheet im Sheet geht nicht (`Sheet` rendert ohne Portal auf derselben
 * Ebene und registriert je einen eigenen Escape-Handler).
 *
 * Bewusst nur **Orte ohne Gastgeber**. Ein Zuhause entsteht nicht hier, sondern
 * wenn jemand im Profil seine Adresse einträgt; es heißt nach seinen
 * Bewohner:innen und gehört ihnen.
 */
import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useCreateLocation, useResolveAddress } from '@/lib/api/hooks';
import type { Location } from '@/lib/api/types';

export interface LocationFormHandle {
  fields: React.ReactNode;
  /** „Anlegen" — die Hülle setzt ihn neben ihren eigenen Abbrechen-Knopf. */
  submitButton: React.ReactNode;
}

/**
 * Kein Bauteil, sondern ein Hook: die Fußzeile eines `Sheet` steht außerhalb
 * des scrollenden Bereichs, Felder und Knopf können also nicht aus **einer**
 * Komponente kommen. Beides zusammenzuhalten und getrennt auszuliefern ist
 * genau das, was ein Hook kann und eine Komponente nicht.
 */
export function useLocationForm({
  onCreated,
  onDone,
}: {
  /** Bekommt den neuen (oder den vorhandenen) Ort. */
  onCreated: (location: Location) => void;
  /** Danach: schließen oder einen Schritt zurück. */
  onDone: () => void;
}): LocationFormHandle {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [existing, setExisting] = useState<Location | null>(null);

  const resolve = useResolveAddress();
  const create = useCreateLocation();
  const toast = useToast();

  const submit = () => {
    const trimmedAddress = address.trim();

    // Erst nachsehen, dann anlegen: der Server würde die doppelte Anschrift
    // zwar mit 409 abweisen, aber „gibt es schon, meinst du den?" ist eine
    // Antwort, mit der man etwas anfangen kann.
    const afterLookup = (found: Location | null) => {
      if (found) {
        setExisting(found);
        return;
      }

      create.mutate(
        {
          name: name.trim(),
          address: trimmedAddress === '' ? null : trimmedAddress,
          // Ein Treffpunkt steht außerhalb der Fairness-Rechnung: er ist eine
          // wetterabhängige Möglichkeit, nicht jemand, der mal wieder dran wäre.
          requiresHost: false,
          hostWeight: 0,
        },
        {
          onSuccess: (location) => {
            toast.success(`${location.name} angelegt.`);
            onCreated(location);
            onDone();
          },
        },
      );
    };

    if (trimmedAddress === '') {
      afterLookup(null);
      return;
    }

    resolve.mutate(trimmedAddress, {
      onSuccess: (result) => afterLookup(result.location),
    });
  };

  return {
    fields: (
      <div className="space-y-4">
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Schlosspark"
          />
        </Field>

        <Field
          label="Adresse"
          hint="Optional — daraus entsteht der Link zur Karte."
        >
          <TextInput
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setExisting(null);
            }}
            placeholder="Schlossbezirk 10, 76131 Karlsruhe"
          />
        </Field>

        {existing && (
          <div className="rounded-md border border-line bg-shell p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-stone-700">
              <MapPin size={14} className="text-terracotta-500" />
              Diese Anschrift gibt es schon
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Sie gehört zu <strong>{existing.name}</strong>. Ein zweiter
              Eintrag für dieselbe Adresse würde die Termine dort auf zwei Orte
              verteilen.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                onCreated(existing);
                onDone();
              }}
            >
              {existing.name} verwenden
            </Button>
          </div>
        )}
      </div>
    ),
    submitButton: (
      <Button
        className="flex-1"
        loading={resolve.isPending || create.isPending}
        disabled={name.trim() === ''}
        onClick={submit}
      >
        Anlegen
      </Button>
    ),
  };
}
