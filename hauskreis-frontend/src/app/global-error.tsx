'use client';

/**
 * Das letzte Netz: greift, wenn schon das Wurzel-Layout wirft.
 *
 * Diese Datei ersetzt das gesamte Dokument, muss `<html>` und `<body>` also
 * selbst mitbringen — und darf sich auf **nichts** verlassen, was das Layout
 * aufgebaut hätte. Deshalb Inline-Styles statt Tailwind-Klassen: wenn das
 * Stylesheet gerade das ist, was nicht ankam, wäre eine Fehlerseite ohne
 * Aussehen der zweite Fehler.
 *
 * Aus demselben Grund keine eigenen Komponenten und keine Symbole.
 */
import { useEffect, useState } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunk-error';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const chunk = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (chunk) setReloading(reloadOnceForChunkError());
  }, [chunk]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#f5efe9',
          color: '#292524',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: '22rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>
            {chunk ? 'Die App kam nicht ganz an' : 'Die App ist abgestürzt'}
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: 1.6,
              color: '#78716c',
              margin: '0 0 1.5rem',
            }}
          >
            {chunk
              ? reloading
                ? 'Die Verbindung war kurz weg. Wird neu geladen …'
                : 'Die Verbindung war kurz weg. Mit Netz hilft ein Neuladen.'
              : 'Bitte lade die Seite neu. Bleibt es dabei, sag Bescheid.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              borderRadius: '9999px',
              padding: '0.75rem 1.5rem',
              background: '#cc7a5e',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
