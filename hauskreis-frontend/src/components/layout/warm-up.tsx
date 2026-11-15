'use client';

/**
 * Lädt eine Seite vor, deren Eingang gerade zu sehen ist — Code und Daten.
 *
 * **Damit sie beim Öffnen schon fertig ist.** Next lädt den Code einer Seite
 * vor, sobald ihr Link im Bild ist; ihre Daten holt sie aber erst, wenn sie
 * dasteht, und dann gleitet eine halbe Seite herein, deren Abschnitte danach
 * einzeln aufspringen. Bei der Verwaltung und der Gruppe fiel das auf: viele
 * Abschnitte, und der Weg dorthin steht lange vorher im Bild (Profil,
 * Kopfleiste, Seitenspalte).
 *
 * **Erst nach einem Moment** (`DELAY_MS`): Was die Seite davor selbst lädt,
 * geht vor. Und nur so lange, bis die Antworten da sind — danach hängt nichts
 * mehr an den Abfragen, und der Zwischenspeicher hält sie eine halbe Stunde.
 * Dieselben Hooks wie die Seite (`useAdminData`, `useGroupData`), also
 * dieselben Schlüssel: Nichts wird doppelt geladen.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminData } from '@/features/admin/admin-data';
import { useGroupData } from '@/features/group/group-data';

const DELAY_MS = 1000;

const HREF = { admin: '/admin', group: '/hauskreis' } as const;

export function WarmUp({
  page,
  media,
}: {
  page: keyof typeof HREF;
  /** Nur, wenn diese Medienabfrage zutrifft — etwa die Seitenspalte am Rechner. */
  media?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<'waiting' | 'loading' | 'done'>('waiting');

  useEffect(() => {
    if (media && !window.matchMedia(media).matches) return;

    const timer = setTimeout(() => {
      setPhase((current) => (current === 'waiting' ? 'loading' : current));
      router.prefetch(HREF[page]);
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [media, page, router]);

  if (phase !== 'loading') return null;

  const done = () => setPhase('done');
  return page === 'admin' ? (
    <AdminData onDone={done} />
  ) : (
    <GroupData onDone={done} />
  );
}

function useSettled(
  queries: readonly { fetchStatus: string }[],
  onDone: () => void,
) {
  const settled = queries.every((query) => query.fetchStatus === 'idle');

  useEffect(() => {
    if (settled) onDone();
  }, [settled, onDone]);
}

function AdminData({ onDone }: { onDone: () => void }) {
  useSettled(useAdminData(), onDone);
  return null;
}

function GroupData({ onDone }: { onDone: () => void }) {
  useSettled(useGroupData(), onDone);
  return null;
}
