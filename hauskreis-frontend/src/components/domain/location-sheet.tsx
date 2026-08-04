'use client';

/**
 * Einen Treffpunkt anlegen oder ändern — von überall dort, wo einer fehlt oder
 * falsch steht: aus dem Archiv, beim Eintragen eines Termins, beim Anlegen
 * eines neuen.
 *
 * Bewusst nur **Orte ohne Gastgeber**. Ein Zuhause entsteht nicht hier, sondern
 * wenn jemand im Profil seine Adresse einträgt; es heißt nach seinen
 * Bewohner:innen und gehört ihnen. Ein Feld „braucht einen Gastgeber" gäbe es
 * hier also nur, um eine Wohnung ohne Bewohner:innen zu erzeugen — genau den
 * Zustand, den die App gerade loswerden wollte.
 *
 * Beim Ändern liegt der Fall anders: die **Kapazität** und das **Gewicht**
 * gehören der Gruppe, nicht einem Menschen. Wie oft man sich im Park treffen
 * möchte, entscheidet niemand allein im Profil — deshalb stehen die beiden
 * Zahlen hier, und nur hier.
 */
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { ConflictBanner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useCreateLocation,
  useLocation,
  useResolveAddress,
  useUpdateLocation,
} from '@/lib/api/hooks';
import type { Location } from '@/lib/api/types';

export function LocationSheet({
  open,
  onClose,
  onCreated,
  location,
}: {
  open: boolean;
  onClose: () => void;
  /** Bekommt den neuen Ort — damit die aufrufende Stelle ihn gleich setzen kann. */
  onCreated?: (location: Location) => void;
  /** Gesetzt heißt: bearbeiten statt anlegen. */
  location?: Location;
}) {
  return location ? (
    <EditSheet open={open} onClose={onClose} location={location} />
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
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={resolve.isPending || create.isPending}
            disabled={name.trim() === ''}
            onClick={submit}
          >
            Anlegen
          </Button>
        </div>
      }
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
      </div>
    </Sheet>
  );
}

/**
 * Der Zuhause-Fall ist hier nicht ausgeschlossen, sondern eingeschränkt: der
 * **Name** einer Wohnung wird aus ihren Bewohner:innen abgeleitet und ist
 * deshalb gesperrt. Kapazität und Gewicht darf man auch dort ändern — die
 * gehören der Gruppe.
 */
function EditSheet({
  open,
  onClose,
  location,
}: {
  open: boolean;
  onClose: () => void;
  location: Location;
}) {
  // Das Schreiben verlangt einen ETag, und der liegt beim geladenen Einzelstand
  // — die Liste aus dem Archiv bringt keinen mit.
  const resource = useLocation(location.id);
  const update = useUpdateLocation(location.id);

  const home = location.requiresHost;
  const current = resource.data?.data ?? location;

  const [name, setName] = useState(current.name);
  const [address, setAddress] = useState(current.address ?? '');
  const [capacity, setCapacity] = useState(
    current.capacity === null ? '' : String(current.capacity),
  );
  const [weight, setWeight] = useState(String(current.hostWeight));

  // Kommt der frische Stand nach (oder ein fremder nach einem Konflikt),
  // übernehmen die Felder ihn — sonst schriebe man über das hinweg, was man
  // gerade nachgeladen bekommen hat.
  useEffect(() => {
    const loaded = resource.data?.data;
    if (!loaded) return;

    setName(loaded.name);
    setAddress(loaded.address ?? '');
    setCapacity(loaded.capacity === null ? '' : String(loaded.capacity));
    setWeight(String(loaded.hostWeight));
  }, [resource.data]);

  const trimmed = name.trim();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${location.name} bearbeiten`}
      subtitle={
        home
          ? 'Der Name folgt den Bewohner:innen und lässt sich hier nicht ändern.'
          : undefined
      }
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
                  capacity: capacity === '' ? null : Number(capacity),
                  hostWeight: Number(weight),
                  // Trotz PATCH ein Pflichtfeld (Zod-Vorgabe, siehe
                  // `types.ts`). Mitgeschickt wird, was ohnehin gilt — ob ein
                  // Ort einen Gastgeber braucht, ändert sich hier nicht.
                  requiresHost: current.requiresHost,
                },
                { onSuccess: () => onClose() },
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
          <ConflictBanner
            onReload={() => void resource.refetch()}
            onDismiss={update.dismissConflict}
          />
        )}

        {!home && (
          <>
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
          </>
        )}

        <Field
          label="Wie viele passen rein"
          hint="Leer heißt: alle passen rein. Passen an einem Abend mehr Leute als angegeben, wird der Ort für diesen einen Abend übersprungen."
        >
          <TextInput
            type="number"
            min="1"
            value={capacity}
            placeholder="Keine Grenze"
            onChange={(event) => setCapacity(event.target.value)}
          />
        </Field>

        <Field
          label="Gewicht"
          hint={
            home
              ? 'Wie oft die Gruppe hier sein möchte, im Verhältnis zu den anderen Wohnungen.'
              : 'Ein Treffpunkt steht meist außerhalb der Rotation — dann bleibt hier 0.'
          }
        >
          <TextInput
            type="number"
            min="0"
            step="0.5"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
