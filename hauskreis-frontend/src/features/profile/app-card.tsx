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
      <SectionTitle>Über die App</SectionTitle>
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

          <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
            Hier hast du eine Übersicht über Neuigkeiten und neuen Features der App, verpasse Nichts! Wir geben dir Bescheid sobald etwas Neues kommt.
          </p>
        </div>
      </Card>
    </section>
  );
}
