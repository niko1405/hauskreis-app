'use client';

/**
 * Einen Treffpunkt anlegen — von überall dort, wo einer fehlt: aus dem Archiv,
 * beim Eintragen eines Termins, beim Anlegen eines neuen.
 *
 * Bewusst nur **Orte ohne Gastgeber**. Ein Zuhause entsteht nicht hier, sondern
 * wenn jemand im Profil seine Adresse einträgt; es heißt nach seinen
 * Bewohner:innen und gehört ihnen. Ein Feld „braucht einen Gastgeber" gäbe es
 * hier also nur, um eine Wohnung ohne Bewohner:innen zu erzeugen — genau den
 * Zustand, den die App gerade loswerden wollte.
 */
import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useCreateLocation, useResolveAddress } from '@/lib/api/hooks';
import type { Location } from '@/lib/api/types';

export function LocationSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Bekommt den neuen Ort — damit die aufrufende Stelle ihn gleich setzen kann. */
  onCreated?: (location: Location) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [existing, setExisting] = useState<Location | null>(null);

  const resolve = useResolveAddress();
  const create = useCreateLocation();
  const toast = useToast();

  const close = () => {
    setName('');
    setAddress('');
    setExisting(null);
    onClose();
  };

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
            onCreated?.(location);
            close();
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

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Treffpunkt anlegen"
      subtitle="Für Orte ohne Gastgeber — Park, Café, Gemeindehaus. Ein Zuhause entsteht über das Profil."
    >
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
            {onCreated && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => {
                  onCreated(existing);
                  close();
                }}
              >
                {existing.name} verwenden
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={close}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            className="flex-1"
            loading={resolve.isPending || create.isPending}
            disabled={name.trim() === ''}
            onClick={submit}
          >
            Anlegen
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
