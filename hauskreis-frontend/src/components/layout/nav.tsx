'use client';

/**
 * Navigation. Mobil die Leiste unten wie im Entwurf, ab `md` eine Spalte
 * links — dieselben fünf Ziele, damit man nicht zwei Menüs pflegt.
 */
import { Archive, CalendarDays, Home, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export const NAV_ITEMS = [
  { href: '/', label: 'Heute', icon: Home },
  { href: '/termine', label: 'Termine', icon: CalendarDays },
  { href: '/gebet', label: 'Gebet', icon: Users },
  { href: '/archiv', label: 'Archiv', icon: Archive },
  { href: '/profil', label: 'Profil', icon: Settings },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function TabBar() {
  const isActive = useIsActive();

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
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
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

  return (
    <nav
      aria-label="Hauptnavigation"
      className="hidden w-56 shrink-0 border-r border-line px-4 py-8 md:block"
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
                <Icon size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
