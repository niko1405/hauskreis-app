'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
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
  zoomable = true,
  className,
}: {
  person?: PersonRef | null;
  size?: AvatarSize;
  /**
   * Antippen zeigt das Bild groß — **überall, voreingestellt**.
   *
   * Es war einmal nur an zwei Stellen erlaubt, in der Mitgliederliste und auf
   * dem Gebets-Bildschirm. Wer ein Gesicht sah, konnte aber nicht wissen, an
   * welchen beiden es ging; ein Bild, das sich an einer Stelle öffnen lässt
   * und an der nächsten nicht, liest sich als Fehler. Jetzt geht es überall,
   * und `false` setzt nur, wer selbst schon eine Aktion hat: ein Link, eine
   * Zeile zum Auswählen, ein Knopf. Dort wäre der Avatar ein Knopf im Knopf,
   * und der Tipp gehört der Aktion, die die Fläche verspricht.
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
  // Das Sheet entsteht erst beim ersten Öffnen und bleibt danach, damit es
  // beim Schließen noch hinausfahren kann. Vorher braucht es niemand — und
  // auf dem Server gibt es kein `document`, an das es sich hängen könnte.
  const [opened, setOpened] = useState(false);

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
          onClick={(event) => {
            // Eine Zeile mit eigenem Handler, die beim Durchsehen übersehen
            // wurde, soll den Tipp aufs Bild nicht auch noch bekommen.
            event.stopPropagation();
            setOpened(true);
            setZoomed(true);
          }}
          className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
        >
          {img}
        </button>
        {/* An `document.body` und nicht hier: `Sheet` rendert ohne Portal, und
            seit das Bild überall aufgeht, sitzt es irgendwann in einem
            Vorfahren mit `transform` — einer gedrückten Karte, einer
            wischbaren Zeile. Der wäre dann der Bezugsrahmen für das
            `position: fixed` des Sheets, und es säße in der Zeile statt über
            der Seite. */}
        {opened &&
          createPortal(
            <Sheet
              open={zoomed}
              onClose={() => setZoomed(false)}
              title={person.name}
            >
              {/* Quadratisch und nicht rund: Gespeichert ist ein quadratischer
                  Zuschnitt (`AVATAR_CROP`), und rund zeigt weniger, als da
                  ist — in klein ist die Form Schmuck, in groß wäre sie ein
                  Beschnitt. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.data}
                alt={person.name}
                className="w-full rounded-card object-cover"
              />
            </Sheet>,
            document.body,
          )}
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
  zoomable = true,
}: {
  people: PersonRef[];
  size?: AvatarSize;
  max?: number;
  /** Wie bei `Avatar`: `false` nur, wo der Stapel in einem Link oder Knopf sitzt. */
  zoomable?: boolean;
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
          zoomable={zoomable}
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
