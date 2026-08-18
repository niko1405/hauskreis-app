'use client';

/**
 * Das Gerüst: mobil eine Telefon-Leinwand mit Leiste unten, ab `md` eine
 * Spalte links und mehr Breite für Tabelle und Kalender.
 */
import { GlobalProgress } from './global-progress';
import { PullToRefresh } from './pull-to-refresh';
import { Sidebar, TabBar } from './nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // `min-h-dvh` statt `min-h-screen`: `100vh` rechnet auf mobilen Browsern
    // mit ausgefahrener Adressleiste und ist deshalb zu hoch.
    <div className="px-safe flex min-h-dvh justify-center bg-shell">
      <GlobalProgress />
      <div className="flex w-full max-w-md flex-col border-line-strong/50 bg-canvas shadow-xl md:max-w-5xl md:flex-row md:border-x">
        <Sidebar />
        <div className="flex min-h-dvh flex-1 flex-col">
          <main className="flex-1 overflow-x-hidden pt-2 pb-6">
            <PullToRefresh>{children}</PullToRefresh>
          </main>
          <TabBar />
        </div>
      </div>
    </div>
  );
}

/**
 * Kopfzeile einer Seite — Titel links, Aktion rechts.
 *
 * Trägt den Abstand zur Statusleiste selbst, weil sie auf den Bildschirmen
 * ohne Kopfbild ganz oben steht (Termine, Archiv, Detailseiten). Wo ein Bild
 * liegt, macht `ScreenHeader` dasselbe eine Ebene tiefer — dort soll das Bild
 * bis an die Kante gehen, nur sein Inhalt nicht.
 */
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
    // `pt-safe-6` ist der sichere Rand **plus** 1.5rem in einer Regel; warum es
    // nicht `pt-safe pt-6` sein kann, steht bei der Klasse in `globals.css`.
    <header className="flex items-end justify-between gap-4 px-5 pt-safe-6 pb-4">
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
