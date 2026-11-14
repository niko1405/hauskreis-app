'use client';

/**
 * Navigation. Mobil die Leiste unten wie im Entwurf, ab `md` eine Spalte
 * links — dieselben fünf Ziele, damit man nicht zwei Menüs pflegt.
 *
 * **Die Spalte trägt drei Dinge mehr**, und zwar die, für die es mobil die
 * Kopfleiste gibt: den Weg zur Gruppe, die Glocke und — für Admins — die
 * Verwaltung. Unten ist die Leiste mit fünf Zielen voll; die Spalte hat Platz,
 * und eine Kopfleiste über einer Seitenspalte wäre eine zweite Navigation an
 * einem zweiten Rand (`smart-header.tsx`, dort `md:hidden`).
 */
import {
  Archive,
  CalendarDays,
  HeartHandshake,
  Home,
  Settings,
  Shield,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useUnreadFirstSteps } from '@/features/help/use-unread-help';
import { useUnreadRelease } from '@/features/releases/use-unread-release';
import { useUnreadAdmin } from '@/features/admin/use-unread-admin';
import { useMe } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { useKeyboardOpen } from '@/lib/use-keyboard-open';
import { NavIcon } from './nav-icon';
import { SidebarBell } from './notification-bell';
import { NotificationInbox } from './notification-inbox';

export const NAV_ITEMS = [
  { href: '/', label: 'Heute', icon: Home },
  { href: '/termine', label: 'Termine', icon: CalendarDays },
  // Nicht `Users`: Am Rechner steht „Gruppe" in derselben Spalte, und zwei
  // Ziele mit demselben Bild sind eines zu viel. Dasselbe Symbol trägt die
  // Gebets-Nachricht in der Box.
  { href: '/gebet', label: 'Gebet', icon: HeartHandshake },
  { href: '/archiv', label: 'Archiv', icon: Archive },
  { href: '/profil', label: 'Profil', icon: Settings },
] as const;

/**
 * Wo Neues wohnt.
 *
 * Der Punkt hängt an dieser Konstante und nicht an einem Feld in `NAV_ITEMS` —
 * dort stünde bei vier von fünf Zielen ein `false`, das nie etwas bedeutet.
 * Kommt einmal ein zweiter Punkt dazu, ist das der Moment, das Tupel zu
 * erweitern; für einen ist es Ballast.
 */
const UNREAD_HREF = '/profil';

/** Die beiden Ziele, die es nur in der Spalte gibt — mobil führt ein Knopf hin. */
const GROUP_ITEM = { href: '/hauskreis', label: 'Gruppe', icon: UsersRound };
const ADMIN_ITEM = { href: '/admin', label: 'Verwaltung', icon: Shield };

/**
 * Ob diese Adresse am Rechner ein Ziel der Spalte ist, ohne ein Tab zu sein.
 *
 * Dort braucht die Seite keinen Zurück-Pfeil: Der Weg hinein und hinaus ist
 * die Spalte, wie bei den Tabs. Mobil behalten sie ihn — dort führt ein Knopf
 * im Profil oder in der Kopfleiste hin.
 */
export function isSidebarRoute(pathname: string): boolean {
  return [GROUP_ITEM.href, ADMIN_ITEM.href].some((href) =>
    matches(href, pathname),
  );
}

/**
 * Drei Gründe, ein Punkt.
 *
 * Alle drei Wege enden mobil im Profil — „Was ist neu", „Hilfe" und der
 * Admin-Bereich. Ein zweiter Punkt daneben würde die Leiste nicht genauer
 * machen, sondern nur unruhiger; welcher gemeint ist, sagt der Bildschirm eine
 * Ebene tiefer.
 *
 * Der dritte gilt **nur Admins**: Bei allen anderen steht der Knopf gar nicht
 * da, und ein Punkt, der auf etwas Unsichtbares zeigt, bliebe für immer stehen.
 * In der Spalte hat die Verwaltung ihren eigenen Platz und damit ihren eigenen
 * Punkt (`admin: false`).
 */
function useUnreadProfile({ admin: withAdmin }: { admin: boolean }): boolean {
  const release = useUnreadRelease();
  const firstSteps = useUnreadFirstSteps();
  const admin = useUnreadAdmin();
  const me = useMe();

  return (
    release.unread ||
    firstSteps.unread ||
    (withAdmin && me.isAdmin && admin.unread)
  );
}

/**
 * Die Ziele, die dieser Hauskreis tatsächlich hat.
 *
 * `NAV_ITEMS` bleibt die **vollständige** Liste, denn sie beantwortet noch eine
 * zweite Frage: ob ein Bildschirm die Kopfleiste trägt (`useHasSmartHeader`).
 * Filterte man dort, verlöre `/gebet` sie in dem Moment, in dem jemand mit
 * einem Lesezeichen darauf landet — und zwar auf einer Seite, die es dann
 * erklären müsste.
 */
function useNavItems(): readonly (typeof NAV_ITEMS)[number][] {
  const { hauskreis } = useHauskreis();
  const prayer = hauskreis?.features.prayerBuddies ?? true;

  return prayer ? NAV_ITEMS : NAV_ITEMS.filter(({ href }) => href !== '/gebet');
}

/** Ob ein Ziel der Leiste zu dieser Adresse gehört. `/termin` ist kein `/termine`. */
function matches(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Ob diese Adresse einer der fünf Tabs ist — und nicht eine Seite darunter.
 *
 * Daran hängen zwei Dinge: die Kopfleiste (`useHasSmartHeader`) und die Leiste
 * unten (`app-shell.tsx`). Beide gibt es nur auf der Ebene, auf die man
 * zurückkehrt. Eine Unterseite hat ihren Zurück-Pfeil, und die fünf Ziele
 * darunter meinte dort niemand — auf der Gruppe, im Profil-Unterbau, in einem
 * Thema oder einer Einheit ist man *in* etwas.
 */
export function isTabRoute(pathname: string): boolean {
  return NAV_ITEMS.some(({ href }) => matches(href, pathname));
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => matches(href, pathname);
}

export function TabBar() {
  const isActive = useIsActive();
  const unread = useUnreadProfile({ admin: true });
  const items = useNavItems();
  const keyboard = useKeyboardOpen();

  return (
    <nav
      aria-label="Hauptnavigation"
      inert={keyboard}
      // Bei offener Tastatur geht sie nach unten weg: Liegt das Feld weit
      // unten, schiebt iOS den Ausschnitt an den Seitenfuß, und sonst stünde
      // sie direkt über der Tastatur. **Verschoben, nicht entfernt** — sie
      // klebt im Fluss, und `hidden` kürzte das Dokument um ihre Höhe; am
      // Seitenende spränge der Inhalt dann mitten im Tippen.
      className={cn(
        'pb-safe sticky bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur transition-[translate,opacity] duration-200 md:hidden',
        keyboard && 'translate-y-full opacity-0',
      )}
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors',
                  active ? 'text-terracotta-500' : 'text-stone-400',
                )}
              >
                <NavIcon
                  icon={Icon}
                  size={20}
                  strokeWidth={active ? 2.4 : 1.8}
                  unread={unread && href === UNREAD_HREF}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar() {
  const isActive = useIsActive();
  const profileUnread = useUnreadProfile({ admin: false });
  const adminUnread = useUnreadAdmin();
  const me = useMe();
  const items = useNavItems();
  const [inbox, setInbox] = useState(false);

  // Die Gruppe steht vor dem Profil: Sie ist ein Ort, an den man geht, das
  // Profil der, an dem man sich einstellt — und das steht in jeder Liste der
  // App am Ende.
  const main = [
    ...items.filter(({ href }) => href !== UNREAD_HREF),
    GROUP_ITEM,
    ...items.filter(({ href }) => href === UNREAD_HREF),
  ];

  const item = (
    { href, label, icon }: { href: string; label: string; icon: LucideIcon },
    unread: boolean,
  ) => {
    const active = isActive(href);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
            active
              ? 'bg-terracotta-50 text-terracotta-700'
              : 'text-stone-500 hover:bg-stone-100',
          )}
        >
          <NavIcon icon={icon} size={18} unread={unread} />
          {label}
        </Link>
      </li>
    );
  };

  return (
    // **Sie bleibt stehen, während die Seite scrollt** (`sticky` mit der
    // Fensterhöhe). Sie war ein gewöhnliches Kind der Zeile, so hoch wie die
    // Seite, und die Ziele scrollten mit dem Inhalt aus dem Bild — am Ende
    // einer langen Liste war der Weg woandershin eine Bildschirmhöhe weit
    // oben. Ihr Rand reicht damit auch immer über das ganze Fenster.
    //
    // **Gescrollt wird nur die Liste, nicht die Spalte.** Die Blase hinter der
    // Glocke ragt rechts über die Spalte hinaus; ein `overflow` an ihr schnitte
    // sie ab. `z-40` hebt sie samt Blase über den Inhalt daneben.
    <aside className="hidden w-56 shrink-0 border-r border-line md:sticky md:top-0 md:z-40 md:flex md:h-dvh md:flex-col md:self-start print:hidden">
      <nav
        aria-label="Hauptnavigation"
        // Der sichere Rand kommt zum vorhandenen Abstand dazu: Auf dem iPad vom
        // Home-Bildschirm reicht die App bis unter die Statusleiste, und dort
        // stünde sonst „Hauskreis" unter der Uhr.
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-[calc(var(--safe-top)+2rem)] pb-4"
      >
        <p className="mb-6 px-3 font-serif text-2xl font-bold text-stone-900">
          Hauskreis
        </p>
        <ul className="space-y-1">
          {main.map((entry) =>
            item(entry, profileUnread && entry.href === UNREAD_HREF),
          )}
        </ul>

        {/* Abgesetzt: Die Ziele darüber hat jede:r, dieses nur, wer die Gruppe
            verwaltet. Am Rechner steht es hier statt als Knopf im Profil. */}
        {me.isAdmin && (
          <ul className="mt-3 space-y-1 border-t border-line pt-3">
            {item(ADMIN_ITEM, adminUnread.unread)}
          </ul>
        )}
      </nav>

      {/* Unten, abgesetzt von den Zielen: Die Glocke ist kein Ort, sondern
          eine Box, die über der Seite aufgeht. Aussehen tut sie trotzdem wie
          eine Zeile der Spalte — eine Karte darum war eine zweite Fläche für
          etwas, das man mehrmals am Tag drückt. */}
      <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="relative">
          <SidebarBell open={inbox} onClick={() => setInbox(true)} />
          <NotificationInbox
            placement="sidebar"
            open={inbox}
            onClose={() => setInbox(false)}
          />
        </div>
      </div>
    </aside>
  );
}
