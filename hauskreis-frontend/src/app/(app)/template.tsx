'use client';

/**
 * Wie eine Seite hereinkommt.
 *
 * Ein `template` und kein `layout`: Next legt es bei jedem Wechsel der Adresse
 * neu an, und genau das startet die Animation. Das Gerüst darüber —
 * Kopfleiste, Seitenspalte, Tab-Leiste — bleibt stehen; es kommt nur, was sich
 * geändert hat.
 *
 * **Zwei Arten, nach dem Ziel.** Die fünf Tabs blenden über: Sie liegen
 * nebeneinander, keiner kommt „von irgendwo". Eine Unterseite — ein Termin,
 * ein Lied, ein Thema — gleitet ein Stück von rechts herein: Man geht in etwas
 * hinein. Was die Seitenspalte am Rechner zusätzlich trägt (Gruppe,
 * Verwaltung), ist dort ein Ziel wie die Tabs und blendet ebenso.
 *
 * Eine Rückkehr ist auch nur ein Wechsel der Adresse; sie gleitet deshalb
 * ebenfalls von rechts, wenn das Ziel eine Unterseite ist. Bei sechzehn Pixeln
 * fällt die Richtung nicht auf — eine Geschichte mitzuführen, um sie
 * umzudrehen, wäre mehr Mechanik, als der Effekt verdient.
 */
import { usePathname } from 'next/navigation';
import { isSidebarRoute, isTabRoute } from '@/components/layout/nav';

export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const level = isTabRoute(pathname) || isSidebarRoute(pathname);

  return (
    <div className={level ? 'animate-tab-in' : 'animate-push-in'}>
      {children}
    </div>
  );
}
