'use client';

/**
 * Navigation. Mobil die Leiste unten wie im Entwurf, ab `md` eine Spalte
 * links — dieselben fünf Ziele, damit man nicht zwei Menüs pflegt.
 */
import { Archive, CalendarDays, Home, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnreadFirstSteps } from '@/features/help/use-unread-help';
import { useUnreadRelease } from '@/features/releases/use-unread-release';
import { cn } from '@/lib/cn';

export const NAV_ITEMS = [
  { href: '/', label: 'Heute', icon: Home },
  { href: '/termine', label: 'Termine', icon: CalendarDays },
  { href: '/gebet', label: 'Gebet', icon: Users },
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

/**
 * Zwei Gründe, ein Punkt.
 *
 * Beide Wege enden im Profil — „Was ist neu" und „Hilfe" stehen dort in
 * derselben Karte. Ein zweiter Punkt daneben würde die Leiste nicht genauer
 * machen, sondern nur unruhiger; welcher der beiden gemeint ist, sagt die
 * Karte eine Ebene tiefer.
 */
function useUnreadProfile(): boolean {
  const release = useUnreadRelease();
  const firstSteps = useUnreadFirstSteps();
  return release.unread || firstSteps.unread;
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Das Symbol mit dem Punkt daneben, wenn es etwas Neues zu sehen gibt.
 *
 * Der Ring in Leinwandfarbe ist kein Zierrat: Er hebt den Punkt vom Symbol ab,
 * über dem er sitzt, und zwar hell wie dunkel. Ohne ihn verschwimmt er bei
 * aktivem Ziel mit der Terracotta-Farbe darunter.
 *
 * `sr-only`: Für alle, die nicht hinsehen, ist ein farbiger Kreis nichts. Der
 * Punkt steht dort, wo er ausgesprochen gehört — im Ziel, nicht daneben.
 */
function NavIcon({
  icon: Icon,
  size,
  strokeWidth,
  unread,
}: {
  icon: (typeof NAV_ITEMS)[number]['icon'];
  size: number;
  strokeWidth?: number;
  unread: boolean;
}) {
  return (
    <span className="relative">
      <Icon size={size} strokeWidth={strokeWidth} />
      {unread && (
        <>
          <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-terracotta-500 ring-2 ring-canvas" />
          <span className="sr-only">(Neues)</span>
        </>
      )}
    </span>
  );
}

export function TabBar() {
  const isActive = useIsActive();
  const unread = useUnreadProfile();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="pb-safe sticky bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
  const unread = useUnreadProfile();

  return (
    <nav
      aria-label="Hauptnavigation"
      // Der sichere Rand kommt zum vorhandenen Abstand dazu: Auf dem iPad vom
      // Home-Bildschirm reicht die App bis unter die Statusleiste, und dort
      // stünde sonst „Hauskreis" unter der Uhr.
      className="hidden w-56 shrink-0 border-r border-line px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8 md:block"
    >
      <p className="mb-6 px-3 font-serif text-2xl font-bold text-stone-900">
        Hauskreis
      </p>
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
                <NavIcon
                  icon={Icon}
                  size={18}
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
