'use client';

/**
 * Die App über sich selbst: welche Fassung läuft, und ist sie offline bereit.
 *
 * **Warum es das gibt.** Ein fehlender Service Worker sieht nach nichts aus.
 * Genau daran hing schon der Push-Fehler, den wir erst beheben konnten, als die
 * Meldung sichtbar wurde — und danach der Start ohne Netz, bei dem ein
 * schwarzer Bildschirm dieselbe Frage offen ließ: Ist etwas kaputt, oder war
 * nur noch nichts geladen? Auf einem iPhone lässt sich das ohne Mac nirgends
 * nachsehen. Also sagt es die App.
 *
 * Der Satz darunter ist kein Kleingedrucktes, sondern der eigentliche Inhalt:
 * Eine App vom Home-Bildschirm hat unter iOS **ihren eigenen Speicher**,
 * getrennt von Safari. Was Safari geladen hat, gibt es dort nicht. Nach dem
 * Installieren muss sie einmal mit Netz geöffnet werden — vorher kann ein Start
 * im Flugmodus nichts anzeigen, weil nichts da ist.
 */
import { ChevronRight, CloudOff, HardDriveDownload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, SectionTitle } from '@/components/ui/card';
import { useReleases } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';

/**
 * Ob der Service Worker diese Seite gerade steuert.
 *
 * `controller` und nicht `registration`: Angemeldet zu sein genügt nicht — erst
 * wenn er steuert, fängt er auch die nächste Navigation ab, und genau das ist
 * die Frage. Beim allerersten Besuch ist er einen Moment lang angemeldet und
 * noch nicht zuständig; `controllerchange` holt das nach.
 */
function useOfflineReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setReady(false);
      return;
    }

    const update = () => setReady(navigator.serviceWorker.controller !== null);
    update();

    navigator.serviceWorker.addEventListener('controllerchange', update);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', update);
  }, []);

  return ready;
}

export function AppCard() {
  const releases = useReleases();
  const ready = useOfflineReady();
  const newest = releases.data?.[0];

  return (
    <section>
      <SectionTitle>Die App</SectionTitle>
      <Card className="space-y-4">
        <Link
          href="/neu"
          className="flex items-center justify-between gap-3 transition-colors hover:text-terracotta-500"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-800">Was ist neu</p>
            <p className="text-[11px] text-stone-400">
              {newest ? `Version ${newest.version}` : 'Alle Änderungen'}
            </p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-stone-400" />
        </Link>

        <div className="border-t border-line pt-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                ready === true
                  ? 'bg-music-bg text-music'
                  : 'bg-stone-100 text-stone-400',
              )}
            >
              {ready === true ? (
                <HardDriveDownload size={15} />
              ) : (
                <CloudOff size={15} />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-800">
                {ready === null
                  ? 'Wird geprüft …'
                  : ready
                    ? 'Offline bereit'
                    : 'Noch nicht offline bereit'}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-400">
                {ready === false
                  ? 'Lass die App einmal mit Internet offen, dann startet sie auch ohne.'
                  : 'Die App startet auch ohne Internet und sagt dann, dass die Verbindung fehlt.'}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
            Auf dem iPhone hat die App vom Home-Bildschirm ihren eigenen
            Speicher — getrennt von Safari. Nach dem Neuinstallieren musst du
            sie deshalb einmal mit Internet öffnen.
          </p>
        </div>
      </Card>
    </section>
  );
}
