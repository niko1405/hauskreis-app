'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { usePersonPhoto } from '@/lib/api/hooks';
import { avatarScheme, initials } from '@/lib/person';
import { Sheet } from './sheet';
import type { PersonRef } from '@/lib/api/types';

const SIZES = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-base',
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Ohne Person ein gestrichelter Platzhalter statt eines leeren Kreises: „hier
 * fehlt noch jemand" ist eine Einladung, „—" wäre eine Fehlmeldung.
 */
export function Avatar({
  person,
  size = 'md',
  zoomable = false,
  className,
}: {
  person?: PersonRef | null;
  size?: AvatarSize;
  /**
   * Antippen zeigt das Bild groß.
   *
   * **Nur, wo man Menschen ansieht** — in der Mitgliederliste. Eine Rollen-Pille
   * zu vergrößern beantwortet keine Frage, dort ist der Avatar die Beschriftung
   * eines Namens und kein Bild.
   *
   * Ohne Bild bleibt es beim Kreis: Ein Fenster, das zwei Buchstaben vergrößert,
   * zeigt nichts, was die Zeile nicht schon zeigt.
   */
  zoomable?: boolean;
  className?: string;
}) {
  if (!person) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-full border border-dashed border-terracotta-100 text-terracotta-400',
          SIZES[size],
          className,
        )}
      >
        +
      </div>
    );
  }

  return (
    <WithPerson
      person={person}
      size={size}
      zoomable={zoomable}
      className={className}
    />
  );
}

/**
 * Eigene Komponente, weil hier ein Hook läuft und der Platzhalter-Zweig oben
 * früh zurückkehrt.
 *
 * Das Bild kommt als Data-URL aus dem Cache und nicht als `src`-Verweis: die
 * API kennt nur das Bearer-Token, ein `<img src="…/photo">` käme mit 401
 * zurück. Solange es lädt — oder wenn es keins gibt —, stehen die Initialen
 * da. Kein Ladebalken: ein springender Avatar in einer Liste ist unruhiger als
 * zwei Buchstaben, die kurz stehen bleiben.
 */
function WithPerson({
  person,
  size,
  zoomable,
  className,
}: {
  person: PersonRef;
  size: AvatarSize;
  zoomable: boolean;
  className?: string;
}) {
  const photo = usePersonPhoto(person);
  const scheme = avatarScheme(person.id);
  const [zoomed, setZoomed] = useState(false);

  if (photo.data) {
    // `next/image` ist hier falsch: es optimiert Bilder, die es abrufen
    // kann. Diese sind Data-URLs aus dem Cache, schon auf 512 Pixel
    // gerechnet und hinter einem Bearer-Token — es gäbe nichts zu
    // optimieren und keinen Weg dorthin.
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.data}
        alt={person.name}
        title={person.name}
        className={cn(
          'shrink-0 rounded-full object-cover',
          SIZES[size],
          className,
        )}
      />
    );

    if (!zoomable) return img;

    return (
      <>
        <button
          type="button"
          aria-label={`Bild von ${person.name} groß ansehen`}
          onClick={() => setZoomed(true)}
          className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
        >
          {img}
        </button>
        <Sheet
          open={zoomed}
          onClose={() => setZoomed(false)}
          title={person.name}
        >
          {/* Quadratisch und nicht rund: Gespeichert ist ein quadratischer
              Zuschnitt (`AVATAR_CROP`), und rund zeigt weniger, als da ist —
              in klein ist die Form Schmuck, in groß wäre sie ein Beschnitt. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.data}
            alt={person.name}
            className="w-full rounded-card object-cover"
          />
        </Sheet>
      </>
    );
  }

  return (
    <div
      title={person.name}
      className={cn(
        'flex items-center justify-center rounded-full font-bold',
        scheme.bg,
        scheme.text,
        SIZES[size],
        className,
      )}
    >
      {initials(person.name)}
    </div>
  );
}

/** Mehrere Personen überlappend — für Themen- und Musik-Teams. */
export function AvatarStack({
  people,
  size = 'sm',
  max = 3,
}: {
  people: PersonRef[];
  size?: AvatarSize;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((person) => (
        <Avatar
          key={person.id}
          person={person}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {rest > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-stone-100 font-bold text-stone-500 ring-2 ring-card',
            SIZES[size],
          )}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
