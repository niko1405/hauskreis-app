'use client';

/**
 * Die Abschnitte der Verwaltung erscheinen zusammen, wenn alle ihre Daten
 * haben (`useReady`) — vorher ein Platzhalter. Sechs Abschnitte, die einzeln
 * aufspringen, schoben die Seite beim Hereingleiten Stück für Stück nach
 * unten.
 */
import { CardSkeleton } from '@/components/ui/states';
import { useReady } from '@/lib/use-ready';
import { useAdminData } from './admin-data';

export function AdminReady({ children }: { children: React.ReactNode }) {
  const { ready, reveal } = useReady(useAdminData());

  if (!ready) {
    return (
      <div className="space-y-6 px-5">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return <div className={reveal}>{children}</div>;
}
