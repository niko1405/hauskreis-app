'use client';

/**
 * „Wo du wohnst" — die Adresse statt einer Auswahlliste.
 *
 * Vorher stand hier ein Dropdown mit allen Orten, also auch „Bei Chris". Das
 * ergab nie einen Sinn: man kann nicht in der Wohnung von jemand anderem
 * gastgeben. Jetzt trägt man seine eigene Anschrift ein, und die App macht
 * daraus die Wohnung — mit dem eigenen Namen dran.
 *
 * Die Rückfrage vor dem Zusammenziehen ist der Kern: gleiche Anschrift ist ein
 * starkes Indiz für eine Wohngemeinschaft, aber ein Tippfehler sieht genauso
 * aus. Und ein stiller Zusammenzug halbierte still das Host-Gewicht beider.
 */
import { Home, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useClearHome,
  useLocation,
  useResolveAddress,
  useSetHome,
} from '@/lib/api/hooks';
import { residentNames } from '@/lib/location';
import type { Location } from '@/lib/api/types';

export function HomeCard({
  personId,
  locationId,
}: {
  personId: string;
  locationId: string | null;
}) {
  const home = useLocation(locationId ?? undefined);
  const resolve = useResolveAddress();
  const setHome = useSetHome();
  const clearHome = useClearHome();
  const toast = useToast();

  const current = home.data?.data;

  const [address, setAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  /** Die Wohnung, in der schon jemand wohnt — Auslöser für die Rückfrage. */
  const [sharedWith, setSharedWith] = useState<Location | null>(null);

  useEffect(() => {
    setAddress(current?.address ?? '');
    setCapacity(
      current?.capacity === null ? '' : String(current?.capacity ?? ''),
    );
  }, [current]);

  if (locationId !== null && home.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const trimmed = address.trim();
  const dirty =
    trimmed !== (current?.address ?? '') ||
    capacity !==
      (current?.capacity === null ? '' : String(current?.capacity ?? ''));

  const submit = (joinExisting: boolean) => {
    setHome.mutate(
      {
        address: trimmed,
        capacity: capacity === '' ? null : Number(capacity),
        joinExisting,
      },
      {
        onSuccess: (location) => {
          setSharedWith(null);
          toast.success(
            `Gespeichert — deine Wohnung heißt jetzt ${location.name}.`,
          );
        },
      },
    );
  };

  const save = () => {
    // Erst nachsehen, wer dort wohnt: die Frage „wohnt ihr zusammen?" lässt
    // sich nur mit Namen stellen, und die stehen nur in dieser Antwort.
    resolve.mutate(trimmed, {
      onSuccess: (result) => {
        const others = (result.location?.residents ?? []).filter(
          (resident) => resident.id !== personId,
        );

        if (result.location && others.length > 0) {
          setSharedWith(result.location);
          return;
        }

        submit(false);
      },
    });
  };

  /** Alle außer mir — „Wohngemeinschaft mit dir selbst" wäre albern. */
  const flatmates = (current?.residents ?? []).filter(
    (resident) => resident.id !== personId,
  );

  return (
    <section>
      <SectionTitle>Wo du wohnst</SectionTitle>
      <Card className="space-y-4">
        {current && (
          <div className="rounded-md border border-line bg-shell p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-stone-800">
              <Home size={14} className="text-terracotta-500" />
              {current.name}
            </p>
            {flatmates.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                <Users size={12} />
                Wohngemeinschaft mit{' '}
                {residentNames({ ...current, residents: flatmates })}
              </p>
            )}
          </div>
        )}

        <Field
          label="Adresse"
          hint="Daraus wird deine Wohnung — sie heißt dann „Bei dir“ und taucht in den Host-Vorschlägen auf."
        >
          <TextInput
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setSharedWith(null);
            }}
            placeholder="Marienstraße 35, 76137 Karlsruhe"
          />
        </Field>

        <Field
          label="Wie viele passen rein"
          hint={
            flatmates.length > 0
              ? 'Gilt für eure Wohnung — deine Mitbewohner:innen sehen dieselbe Zahl und können sie ändern.'
              : 'Optional. Passen an einem Abend mehr Leute als angegeben, wird deine Wohnung für diesen einen Abend übersprungen.'
          }
        >
          <TextInput
            type="number"
            min="1"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            placeholder="Keine Grenze"
          />
        </Field>

        {sharedWith && (
          <div className="rounded-md border border-terracotta-200 bg-terracotta-50/60 p-3">
            <p className="text-xs font-bold text-terracotta-700">
              Dort wohnt schon jemand
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Unter dieser Anschrift wohnt{' '}
              <strong>{residentNames(sharedWith)}</strong>. Wohnt ihr zusammen?
              Dann teilt ihr euch eine Wohnung — und damit auch, wie oft ihr als
              Gastgeber:innen dran seid.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setSharedWith(null)}
              >
                Nein, Tippfehler
              </Button>
              <Button
                size="sm"
                className="flex-1"
                loading={setHome.isPending}
                onClick={() => submit(true)}
              >
                Ja, wir wohnen zusammen
              </Button>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          disabled={!dirty || trimmed === ''}
          loading={resolve.isPending || setHome.isPending}
          onClick={save}
        >
          Adresse speichern
        </Button>

        {locationId !== null && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            loading={clearHome.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  'Ohne Adresse tauchst du nicht mehr in den Host-Vorschlägen auf. Sicher?',
                )
              ) {
                return;
              }
              clearHome.mutate(undefined, {
                onSuccess: () => toast.success('Du hostest jetzt nicht mehr.'),
              });
            }}
          >
            Ich bringe keine Wohnung mit
          </Button>
        )}
      </Card>
    </section>
  );
}
