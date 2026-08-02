'use client';

/**
 * Das Gerüst: mobil eine Telefon-Leinwand mit Leiste unten, ab `md` eine
 * Spalte links und mehr Breite für Tabelle und Kalender.
 */
import { Sidebar, TabBar } from './nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-shell">
      <div className="flex w-full max-w-md flex-col border-line-strong/50 bg-canvas shadow-xl md:max-w-5xl md:flex-row md:border-x">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <main className="flex-1 overflow-x-hidden pt-2 pb-6">{children}</main>
          <TabBar />
        </div>
      </div>
    </div>
  );
}

/** Kopfzeile einer Seite — Titel links, Aktion rechts. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 px-5 pt-6 pb-4">
      <div>
        <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-stone-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
