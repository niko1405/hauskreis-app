'use client';

/**
 * Orte. `hostWeight` ist die Gewichtung aus CLAUDE.md §5: drei Haupt-Orte
 * kommen häufiger dran als die weiter außerhalb. `requiresHost = false` ist
 * der Schlosspark — dort braucht es niemanden, der aufmacht.
 */
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Checkbox, Field, TextInput } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useCreateLocation,
  useDeleteLocation,
  useLocations,
} from '@/lib/api/hooks';

export function LocationsAdmin() {
  const locations = useLocations();
  const remove = useDeleteLocation();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <SectionTitle>Orte</SectionTitle>
      <Card className="space-y-4">
        {locations.isLoading && <Skeleton className="h-24 w-full" />}

        <ul className="space-y-2">
          {(locations.data ?? []).map((location) => (
            <li
              key={location.id}
              className="flex items-center gap-3 rounded-md border border-line p-3"
            >
              <MapPin size={15} className="shrink-0 text-stone-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-stone-800">
                  {location.name}
                </p>
                <p className="truncate text-[11px] text-stone-400">
                  Gewicht {location.hostWeight}
                  {location.capacity !== null &&
                    ` · Platz für ${location.capacity}`}
                </p>
              </div>
              {!location.requiresHost && (
                <Badge variant="info">ohne Host</Badge>
              )}
              <IconButton
                label={`${location.name} löschen`}
                onClick={() => {
                  if (!window.confirm(`${location.name} wirklich löschen?`))
                    return;
                  remove.mutate(location.id, {
                    onError: (error) => toast.error(errorMessage(error)),
                  });
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>

        {adding ? (
          <LocationForm onDone={() => setAdding(false)} />
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} />
            Ort anlegen
          </Button>
        )}
      </Card>
    </section>
  );
}

function LocationForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [hostWeight, setHostWeight] = useState('1');
  const [capacity, setCapacity] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [requiresHost, setRequiresHost] = useState(true);

  const create = useCreateLocation();
  const toast = useToast();

  const submit = () => {
    // Der Server lehnt es ab, wenn nur eine der beiden Koordinaten gesetzt ist.
    if ((latitude === '') !== (longitude === '')) {
      toast.error(
        'Breiten- und Längengrad gehören zusammen — beide oder keins.',
      );
      return;
    }

    create.mutate(
      {
        name: name.trim(),
        hostWeight: Number(hostWeight),
        requiresHost,
        capacity: capacity === '' ? null : Number(capacity),
        address: address.trim() === '' ? null : address.trim(),
        latitude: latitude === '' ? null : Number(latitude),
        longitude: longitude === '' ? null : Number(longitude),
      },
      {
        onSuccess: () => {
          toast.success('Ort angelegt.');
          onDone();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Gewicht" hint="Höher = häufiger dran">
          <TextInput
            type="number"
            step="0.1"
            min="0"
            value={hostWeight}
            onChange={(event) => setHostWeight(event.target.value)}
          />
        </Field>
        <Field label="Plätze" hint="Optional">
          <TextInput
            type="number"
            min="1"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Adresse" hint="Optional">
        <TextInput
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Breitengrad">
          <TextInput
            type="number"
            step="any"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </Field>
        <Field label="Längengrad">
          <TextInput
            type="number"
            step="any"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </Field>
      </div>

      <Checkbox
        label="Braucht einen Gastgeber"
        description="Aus für Orte wie den Schlosspark — dort bleibt das Host-Feld leer."
        checked={requiresHost}
        onChange={(event) => setRequiresHost(event.target.checked)}
      />

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={onDone}>
          Abbrechen
        </Button>
        <Button
          size="sm"
          className="flex-1"
          loading={create.isPending}
          disabled={name.trim() === ''}
          onClick={submit}
        >
          Anlegen
        </Button>
      </div>
    </div>
  );
}
