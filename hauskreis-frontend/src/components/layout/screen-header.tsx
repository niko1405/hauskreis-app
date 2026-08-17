'use client';

/**
 * Die Kopfzeile mit Hintergrundbild — auf „Heute", „Gebet", „Archiv" und
 * „Profil".
 *
 * **Termine hat bewusst keine.** Dort liest man eine Liste über Wochen hinweg
 * und sucht eine Zeile; ein Foto darüber wäre nur Weg bis zur ersten davon.
 *
 * Aufbau von unten nach oben: das Bild füllt die ganze Fläche, darüber liegt
 * ein Schleier, der nach unten in die Leinwand ausläuft, und darauf steht der
 * Titel in derselben Schrift und Größe wie überall (`PageHeader`). Der Schleier
 * ist der Grund, warum die Überschrift auf **jedem** Foto lesbar bleibt — auch
 * auf einem dunklen, auch auf einem unruhigen.
 *
 * Solange niemand ein Bild hochgeladen hat, steht ein Verlauf da: ehrlicher als
 * ein Stockfoto, das so tut, als sei es das eurige, und er zeigt dasselbe
 * Layout. Jeder Bildschirm hat seinen eigenen, damit man beim Umschalten sieht,
 * wo man ist.
 */
import { ImageIcon } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useHeaderImage } from '@/lib/api/hooks';
import type { HeaderScreen } from '@/lib/api/types';
import { useState } from 'react';
import { HeaderImageSheet } from './header-image-sheet';

/**
 * Der Verlauf, solange kein eigenes Bild da ist — aus den Farbtokens der App.
 *
 * Vier verschiedene und nicht viermal derselbe: sie sind das Einzige, woran man
 * im Kopfbereich erkennt, auf welchem Bildschirm man gelandet ist, solange dort
 * noch kein Foto steht.
 *
 * Die Verläufe selbst stehen in `globals.css`, damit der Dunkelmodus sie
 * mitnimmt, ohne dass hier jemand den Modus abfragen müsste.
 */
const PLACEHOLDER: Record<HeaderScreen, string> = {
  home: 'bg-[image:var(--header-home)]',
  prayer: 'bg-[image:var(--header-prayer)]',
  archive: 'bg-[image:var(--header-archive)]',
  profile: 'bg-[image:var(--header-profile)]',
};

export function ScreenHeader({
  screen,
  title,
  subtitle,
  action,
}: {
  screen: HeaderScreen;
  title: string;
  subtitle?: string;
  /** Wie bei `PageHeader`: die eine Aktion dieser Seite, rechts neben dem Titel. */
  action?: React.ReactNode;
}) {
  const image = useHeaderImage(screen);
  const [open, setOpen] = useState(false);

  return (
    <header className="relative -mt-2 overflow-hidden">
      {/* Das Bild. Als `background` und nicht als `<img>`: es hat keinen
          Inhalt, den jemand vorgelesen bekommen müsste. */}
      <div
        className={cn(
          'absolute inset-0 bg-cover bg-center',
          !image.dataUrl && PLACEHOLDER[screen],
        )}
        style={
          image.dataUrl
            ? { backgroundImage: `url(${image.dataUrl})` }
            : undefined
        }
      />

      {/* Der Schleier. Nach unten deckend, damit der Übergang in die Leinwand
          keine Kante hat, und oben durchscheinend, damit vom Bild etwas übrig
          bleibt. */}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/85 to-canvas/25" />

      {/* Das Bild geht randlos bis unter die Statusleiste — das ist der
          native Eindruck. Nur sein Inhalt rückt um den sicheren Rand nach
          unten, damit der Titel nicht neben der Dynamic Island klebt. */}
      <div className="relative flex items-end justify-between gap-4 px-5 pt-[calc(env(safe-area-inset-top)+8rem)] pb-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>

      {/* Oben rechts und zurückhaltend: das Bild zu tauschen ist etwas, das man
          einmal tut und dann lange nicht wieder. */}
      <IconButton
        label="Hintergrundbild ändern"
        className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 bg-card/70 backdrop-blur-sm"
        onClick={() => setOpen(true)}
      >
        <ImageIcon size={15} />
      </IconButton>

      <HeaderImageSheet
        screen={screen}
        open={open}
        onClose={() => setOpen(false)}
        hasImage={image.exists}
      />
    </header>
  );
}
