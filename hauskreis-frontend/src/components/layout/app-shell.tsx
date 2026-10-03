'use client';

/**
 * Das Gerüst: mobil eine Telefon-Leinwand mit Leiste unten, ab `md` eine
 * Spalte links und mehr Breite für Tabelle und Kalender.
 */
import { cn } from '@/lib/cn';
import { BackButton } from './back-button';
import { BottomSlotOutlet, BottomSlotProvider } from './bottom-slot';
import { GlobalProgress } from './global-progress';
import { PullToRefresh } from './pull-to-refresh';
import { SmartHeader } from './smart-header';
import { useHasSmartHeader } from './use-header-scroll';
import { useInboxDeeplink } from './use-inbox-deeplink';
import { Sidebar, TabBar } from './nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  // Steht hier und nicht in der Glocke: Der Haken muss auch dann greifen, wenn
  // die Push-Nachricht auf einen Bildschirm ohne Kopfleiste führt.
  useInboxDeeplink();

  return (
    // `min-h-dvh` statt `min-h-screen`: `100vh` rechnet auf mobilen Browsern
    // mit ausgefahrener Adressleiste und ist deshalb zu hoch.
    <BottomSlotProvider>
      <div className="px-safe flex min-h-dvh justify-center bg-shell">
        <GlobalProgress />
        <div className="flex w-full max-w-md flex-col border-line-strong/50 bg-canvas shadow-xl md:max-w-5xl md:flex-row md:border-x">
          <Sidebar />
          {/* `min-w-0` ist hier kein Zierrat. Ab `md` ist das hier ein Flex-Kind
            einer Zeile, und ein Flex-Kind darf ohne das nicht unter seine
            Inhaltsbreite schrumpfen (`min-width: auto`). Eine einzige breite
            Zeile — eine Pillenreihe, eine Tabelle, ein langes Wort — drückte
            damit die ganze Spalte auf, und der Inhalt stand über den Karten.
            Das `overflow-x-hidden` an `<main>` schnitt danach nur noch ab, was
            längst zu breit war. */}
          <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
            {/* Über dem Inhalt und nicht davor: Die Leiste trägt eine negative
              Untermarge in ihrer eigenen Höhe (`header-inset`), sodass das
              Kopfbild nahtlos darunter durchläuft.

              **Neben `<main>` und nicht darin.** `main` trägt `pt-2`, und
              innen läge die Leiste acht Pixel tiefer als die Oberkante — auf
              einem Gerät ohne Notch stünde darüber ein Streifen ungeschleiertes
              Foto. Hier beginnt sie an der Kante, und `main` behält seinen
              Abstand für den Inhalt. */}
            <SmartHeader />
            <main className="flex-1 overflow-x-hidden pt-2 pb-6">
              <PullToRefresh>{children}</PullToRefresh>
            </main>
            {/* Unten steht die Navigation — es sei denn, ein Bildschirm hat
              dort etwas Besseres zu sagen. Auf der Terminseite ist das die
              eigene Zusage; sonst nirgends. Warum das über ein Portal läuft
              und nicht über eine Prop, steht in `bottom-slot.tsx`. */}
            <BottomSlotOutlet fallback={<TabBar />} />
          </div>
        </div>
      </div>
    </BottomSlotProvider>
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
  back,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /**
   * Ein Zurück-Pfeil über dem Titel; der Wert ist das Ziel, falls es kein
   * „zurück" gibt (`BackButton`). Die Tabs tragen keinen — sie sind die Ebene,
   * auf die man zurückkehrt. Jede andere Seite mit diesem Kopf trägt einen:
   * Ohne ihn war der Weg hinaus die Tab-Leiste, also ein Sprung auf eine
   * andere Seite statt zurück auf die, von der man kam.
   */
  back?: string;
}) {
  // Auf den Tabs liegt die Kopfleiste darüber, sonst stünde der Titel dahinter.
  // Gefragt wird hier und nicht über eine Prop: Termine und Archiv tragen sie,
  // Verwaltung, Hilfe und „Was ist neu" nicht — und keine dieser Seiten sollte
  // sich das merken müssen.
  const underHeader = useHasSmartHeader();

  return (
    // `pt-safe-6` ist der sichere Rand **plus** 1.5rem in einer Regel; warum es
    // nicht `pt-safe pt-6` sein kann, steht bei der Klasse in `globals.css`.
    <header
      className={cn(
        'flex items-end justify-between gap-4 px-5 pb-4',
        underHeader ? 'pt-header-6' : 'pt-safe-6',
      )}
    >
      <div>
        {back && <BackButton fallback={back} className="mb-3" />}
        <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-stone-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
