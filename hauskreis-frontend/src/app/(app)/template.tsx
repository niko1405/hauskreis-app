'use client';

/**
 * Wie eine Seite kommt und die alte geht.
 *
 * Ein `template` und kein `layout`: Next legt es bei jedem Wechsel der Adresse
 * neu an, und genau das ist der Anlass. Das Gerüst darüber — Kopfleiste,
 * Seitenspalte, Tab-Leiste — bleibt stehen; es bewegt sich nur, was sich
 * geändert hat.
 *
 * **Die Bewegung selbst steht in `lib/page-transition.ts`** (welche) und in
 * `globals.css` (wie). Hier wird nur angemeldet:
 *
 * - `<ViewTransition>` hängt die Seite für die Dauer eines Wechsels als eigenes
 *   Bild heraus, die alte (`page-out`) wie die neue (`page-in`). Wechselt die
 *   Tab-Leiste oder die Seitenspalte zwischen zwei Ebenen
 *   (`LEVEL_TRANSITION`), bleibt es aus: Dort blendet die neue Seite nur über.
 * - Die Klasse am Kasten ist das Überblenden der Tabs, ein Zurück, das sonst
 *   niemand bewegt, und für Browser ohne View Transitions das Hereinkommen von
 *   früher — dort gibt es kein Bild der alten Seite, also kein Hinausgleiten.
 * - `data-page` findet `navigateBack`: Für ein Zurück über `router.back()`
 *   startet es die View Transition selbst und benennt die Seiten wie React.
 *
 * **`bg-canvas` am Kasten**: Festgehalten wird, was er malt. Ohne eigene
 * Fläche wären die Bilder durchsichtig, und die alte Seite schiene durch die
 * neue.
 */
import { usePathname } from 'next/navigation';
import { ViewTransition, useLayoutEffect, useRef, useState } from 'react';
import {
  isGroupRoute,
  isSidebarRoute,
  isTabRoute,
} from '@/components/layout/nav';
import { cn } from '@/lib/cn';
import {
  LEVEL_TRANSITION,
  backIsAnimated,
  enterPage,
  wasBackNavigation,
  type PageKind,
} from '@/lib/page-transition';

function pageKindOf(pathname: string): PageKind {
  if (isTabRoute(pathname)) return 'tab';
  if (isGroupRoute(pathname)) return 'group';
  if (isSidebarRoute(pathname)) return 'side';
  return 'detail';
}

/** Das Hereinkommen per CSS — immer für Tabs, sonst nur ohne View Transitions. */
const ENTER: Record<PageKind, string> = {
  tab: 'animate-tab-in',
  side: 'page-enter-side',
  group: 'page-enter-group',
  detail: 'page-enter-push',
};

export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const kind = pageKindOf(pathname);
  // Einmal beim Anlegen: Die Richtung gilt für dieses Hereinkommen, nicht für
  // spätere Renderläufe derselben Seite.
  const [{ back, moved }] = useState(() => ({
    back: wasBackNavigation(),
    moved: backIsAnimated(),
  }));

  // Einmal je Seite, auch unter Strict Mode, der Effekte doppelt laufen lässt:
  // Ein zweites Anmelden hielte diese Seite für ihre eigene Herkunft.
  const announced = useRef(false);
  useLayoutEffect(() => {
    if (announced.current) return;
    announced.current = true;
    enterPage(kind, back);
  }, [kind, back]);

  return (
    <ViewTransition
      default="none"
      enter={{ [LEVEL_TRANSITION]: 'none', default: 'page-in' }}
      exit={{ [LEVEL_TRANSITION]: 'none', default: 'page-out' }}
    >
      <div
        data-page
        className={cn(
          'bg-canvas',
          // Ein Zurück, das niemand sonst bewegt — der Knopf des Browsers, die
          // Geste unter Android —, kommt per CSS von links (`page-transition.ts`).
          kind !== 'tab' && back ? !moved && 'animate-back-in' : ENTER[kind],
        )}
      >
        {children}
      </div>
    </ViewTransition>
  );
}
