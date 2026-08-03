'use client';

/**
 * Was zu sehen ist, wenn beim Rendern einer Seite etwas wirft.
 *
 * Bis hierher gab es diese Datei nicht — ein Fehler landete damit in Next.js'
 * eingebauter Fehlerseite. In der Entwicklung ist das das Overlay mit
 * Stacktrace, in Produktion eine weiße Seite mit „Application error", und in
 * der installierten PWA steht dann kein Browser-Menü zum Neuladen daneben.
 *
 * Der häufigste Fall ist gar kein Programmfehler, sondern eine Datei, die
 * nicht ankam (siehe `chunk-error.ts`). Deshalb hat dieser Bildschirm zwei
 * Gesichter: bei einem Ladefehler lädt er selbst neu und erklärt es, bei allem
 * anderen zeigt er den Fehler und bietet beide Auswege an.
 *
 * Die Navigation aus `(app)/layout.tsx` bleibt dabei stehen — man sitzt nicht
 * fest, sondern kann auch einfach woandershin.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunk-error';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunk = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (chunk) setReloading(reloadOnceForChunkError());
  }, [chunk]);

  return (
    <div className="px-5 pt-10">
      <Card className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-500">
          {chunk ? <WifiOff size={22} /> : <RefreshCw size={22} />}
        </span>

        <div>
          <h1 className="font-serif text-xl font-bold text-stone-900">
            {chunk
              ? 'Die Seite kam nicht ganz an'
              : 'Da ist etwas schiefgegangen'}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            {chunk
              ? reloading
                ? 'Die Verbindung war kurz weg. Wird neu geladen …'
                : 'Die Verbindung war kurz weg. Sobald du wieder Netz hast, hilft ein Neuladen.'
              : 'Der Fehler liegt an der App, nicht an dir.'}
          </p>
        </div>

        {/* Der Text kommt aus dem Fehler und ist meist englisch — er steht
            trotzdem da, weil er das Einzige ist, womit man nachfragen kann. */}
        {!chunk && (
          <p className="rounded-md bg-canvas px-3 py-2 text-left font-mono text-[11px] break-words text-stone-500">
            {error.message}
            {error.digest && (
              <span className="mt-1 block text-stone-400">#{error.digest}</span>
            )}
          </p>
        )}

        <div className="flex gap-2">
          {/* `reset()` nur, wo es etwas ausrichten kann: bei einem fehlenden
              Chunk rendert es in denselben Fehler hinein. */}
          {!chunk && (
            <Button variant="secondary" className="flex-1" onClick={reset}>
              Nochmal versuchen
            </Button>
          )}
          <Button
            className="flex-1"
            loading={reloading}
            onClick={() => window.location.reload()}
          >
            Neu laden
          </Button>
        </div>
      </Card>
    </div>
  );
}
