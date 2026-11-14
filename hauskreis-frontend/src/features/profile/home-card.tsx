'use client';

/**
 * „Wo du wohnst" — die Adresse statt einer Auswahlliste.
 *
 * Man trägt seine eigene Anschrift ein, und die App macht daraus die Wohnung —
 * mit dem eigenen Namen dran. Eine Auswahl aus allen Orten ergäbe keinen Sinn:
 * man kann nicht in der Wohnung von jemand anderem gastgeben.
 *
 * Die Rückfrage vor dem Zusammenziehen ist der Kern: gleiche Anschrift ist ein
 * starkes Indiz für eine Wohngemeinschaft, aber ein Tippfehler sieht genauso
 * aus. Und ein stiller Zusammenzug halbierte still das Host-Gewicht beider.
 *
 * Davor kommt eine zweite, schlichtere: **„Stimmt die Adresse?"**, mit einem
 * Knopf nach Google Maps. Nach ihr findet die Gruppe hin.
 *
 * **Unter jedem Feld steht ein kurzer Satz**, was es sonst bewirkt, liegt
 * hinter dem (i) — wie in der Verwaltung. Wer hier zum zweiten Mal ist, will
 * eine Adresse ändern und keine Absätze lesen.
 */
import { ExternalLink, Home, MapPin, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextInput } from '@/components/ui/field';
import { InfoTip } from '@/components/ui/info-tip';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useUnsavedGuard } from '@/components/ui/unsaved';
import {
  useClearHome,
  useLocation,
  useResolveAddress,
  useSetHome,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { residentNames } from '@/lib/location';
import { mapsUrl } from '@/lib/meeting';
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
  const confirm = useConfirm();

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

  // Vor dem vorzeitigen Aussteigen: `useUnsavedGuard` ist ein Hook und darf
  // nicht hinter einem `return` stehen.
  const trimmed = address.trim();
  const dirty =
    trimmed !== (current?.address ?? '') ||
    capacity !==
      (current?.capacity === null ? '' : String(current?.capacity ?? ''));

  useUnsavedGuard(dirty);

  if (locationId !== null && home.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

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

  const save = async () => {
    // **Erst fragen, ob die Adresse stimmt** — mit dem Weg, es nachzusehen.
    // Nach ihr findet die Gruppe hin, und ein Zahlendreher fällt erst auf,
    // wenn alle vor der falschen Tür stehen. Nur wenn sich die Adresse
    // geändert hat: Wer nur die Zahl der Plätze ändert, hat an ihr nichts
    // geprüft, was zu bestätigen wäre.
    if (trimmed !== (current?.address ?? '')) {
      const ok = await confirm({
        title: 'Stimmt die Adresse?',
        // Inline-Elemente: `confirm.tsx` setzt den Text in ein `<p>`.
        body: (
          <>
            <strong className="block text-stone-800">{trimmed}</strong>
            <span className="mt-1 block">
              Schau kurz nach, ob die Stecknadel richtig sitzt — so findet die
              Gruppe hin.
            </span>
            <a
              href={mapsUrl({
                name: trimmed,
                address: trimmed,
                latitude: null,
                longitude: null,
              })}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-canvas py-2.5 text-sm font-semibold text-stone-700 transition-colors',
                'hover:border-line-strong focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
                PRESSABLE,
              )}
            >
              <MapPin size={15} className="text-terracotta-500" />
              In Google Maps prüfen
              <ExternalLink size={13} className="text-stone-400" />
            </a>
          </>
        ),
        cancelLabel: 'Ändern',
        confirmLabel: 'Passt, speichern',
      });
      if (!ok) return;
    }

    // Dann nachsehen, wer dort wohnt: die Frage „wohnt ihr zusammen?" lässt
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
          info={
            <>
              Sie heißt dann „Bei dir“ und taucht in den Host-Vorschlägen auf.
              Wohnt unter derselben Anschrift schon jemand, fragt die App, ob
              ihr zusammenwohnt.
            </>
          }
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
          info={
            <>
              Kommen an einem Abend mehr Leute, als hier steht, wird deine
              Wohnung für diesen einen Abend übersprungen.
              {flatmates.length > 0 &&
                ' Deine Mitbewohner:innen sehen dieselbe Zahl und können sie ändern.'}
            </>
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
            <p className="flex items-center gap-1.5 text-xs font-bold text-terracotta-700">
              Dort wohnt schon jemand
              <InfoTip label="Zusammenwohnen">
                Dann teilt ihr euch eine Wohnung — und damit auch, wie oft ihr
                als Gastgeber:innen dran seid.
              </InfoTip>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Unter dieser Anschrift wohnt{' '}
              <strong>{residentNames(sharedWith)}</strong>. Wohnt ihr zusammen?
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
          onClick={() => void save()}
        >
          Adresse speichern
        </Button>

        {locationId !== null && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            loading={clearHome.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Wohnung entfernen?',
                body: 'Ohne Adresse tauchst du nicht mehr in den Host-Vorschlägen auf. Eintragen kannst du sie jederzeit wieder.',
                confirmLabel: 'Entfernen',
                tone: 'danger',
              });
              if (!ok) return;

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
