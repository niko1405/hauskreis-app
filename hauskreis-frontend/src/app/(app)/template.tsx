'use client';

/**
 * Wie eine Seite hereinkommt.
 *
 * Ein `template` und kein `layout`: Next legt es bei jedem Wechsel der Adresse
 * neu an, und genau das startet die Animation. Das Gerüst darüber —
 * Kopfleiste, Seitenspalte, Tab-Leiste — bleibt stehen; es kommt nur, was sich
 * geändert hat.
 *
 * **Drei Arten, nach Ziel und Richtung**, im Takt von iOS (`globals.css`):
 *
 * - Die fünf Tabs blenden über (`animate-tab-in`): Sie liegen nebeneinander,
 *   keiner kommt „von irgendwo". Was die Seitenspalte am Rechner zusätzlich
 *   trägt (Gruppe, Verwaltung), ist dort ein Ziel wie die Tabs.
 * - Eine Unterseite — ein Termin, ein Lied, ein Thema — gleitet von rechts
 *   herein (`animate-push-in`): Man geht in etwas hinein.
 * - Ein **Zurück** auf eine Unterseite kommt von links (`animate-back-in`),
 *   wie unter iOS die Seite, zu der man zurückkehrt. Ob es eines war, sagt
 *   `popstate` (`lib/nav-direction.ts`); von rechts hieße es „tiefer hinein".
 */
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { isSidebarRoute, isTabRoute } from '@/components/layout/nav';
import { wasBackNavigation } from '@/lib/nav-direction';

export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Einmal beim Anlegen: Die Richtung gilt für dieses Hereinkommen, nicht für
  // spätere Renderläufe derselben Seite.
  const [back] = useState(wasBackNavigation);
  const level = isTabRoute(pathname) || isSidebarRoute(pathname);

  return (
    <div
      className={
        level ? 'animate-tab-in' : back ? 'animate-back-in' : 'animate-push-in'
      }
    >
      {children}
    </div>
  );
}
