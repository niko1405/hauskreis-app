import type { Metadata, Viewport } from 'next';
import {
  Instrument_Serif,
  Plus_Jakarta_Sans,
  Roboto_Slab,
} from 'next/font/google';
import { BootWatchdog } from '@/components/layout/boot-watchdog';
import { StatusBarScrim } from '@/components/layout/status-bar-scrim';
import { ThemeScript } from '@/components/layout/theme-script';
import { Providers } from './providers';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

const robotoSlab = Roboto_Slab({
  subsets: ['latin'],
  variable: '--font-roboto-slab',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Acts2',
  description:
    'Termine, Hosts, Themen, Songs, Gebetsbuddys und Actionsteps für einen Hauskreis — an einem Ort.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    // Steht unter dem Symbol auf dem Home-Bildschirm. Kurz halten: iOS kürzt
    // ab etwa zwölf Zeichen mit Auslassungspunkten.
    title: 'Acts2',
    /**
     * Der eine Schalter, der die App bis unter die Notch zieht.
     *
     * Mit `default` setzt iOS die WebView **unter** die Statusleiste. Damit ist
     * `env(safe-area-inset-top)` null — jedes `calc(env(safe-area-inset-top) +
     * …)` im Projekt fiel still auf seine Konstante zusammen, und den Streifen
     * darüber malte iOS selbst aus `themeColor`. Genau das war der schwarze
     * Balken: eine Farbe, die zur Schale gehört, über einer Leinwand, die
     * anders aussieht.
     *
     * `black-translucent` gibt uns die Fläche zurück. Der Preis: Uhr, Netz und
     * Batterie sind ab jetzt **immer weiß**, einen zweiten Wert gibt es nicht.
     * Deshalb liegt im `AppShell` ein Schleier über dem sicheren Rand — ohne
     * ihn wäre die Uhr im Hellmodus unsichtbar.
     */
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  /**
   * Die Farbe der Fläche, nicht die der Marke — und zwar der Fläche, die auf
   * einem Telefon wirklich darunter liegt.
   *
   * Das ist `--color-canvas`, nicht `--color-shell`. Die Schale ist die Farbe
   * *neben* der Telefonspalte und erst ab `md` zu sehen; auf dem Handy füllt
   * die Leinwand den Bildschirm. Hier standen die Schalenwerte, und die Kante
   * darüber war im Dunkelmodus der schwarze Balken.
   *
   * Seit `statusBarStyle: 'black-translucent'` ist der Streifen unter iOS
   * durchsichtig — diese Farbe ist der Rückfall. Er zählt zweimal: unter
   * Android malt Chrome den Streifen immer daraus, und `black-translucent`
   * führt Apple als veraltet, es kann also eines Tages wieder ein Streifen
   * sein. Dann ist er in Leinwandfarbe statt schwarz.
   *
   * Die `media`-Angaben greifen, solange niemand von Hand umgeschaltet hat;
   * danach zieht `theme.ts` das Meta-Tag nach — dieselben Werte, eine Quelle.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1815' },
  ],
  width: 'device-width',
  initialScale: 1,
  /**
   * Kein Zoom per Geste.
   *
   * Hier stand einmal das Gegenteil („Hineinzoomen darf man immer können").
   * Für eine Seite stimmt das; für eine App, die man vom Home-Bildschirm
   * startet, ist das Auseinanderziehen der ganzen Oberfläche kein Werkzeug,
   * sondern ein Versehen. Im Safari-Tab ignoriert Apple die Sperre ohnehin,
   * und die Systemschrift-Größe wirkt weiterhin.
   */
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${jakarta.variable} ${instrument.variable} ${robotoSlab.variable}`}
    >
      <body className="bg-shell font-sans text-stone-800 antialiased selection:bg-terracotta-500 selection:text-white">
        {/* Muss ganz oben stehen und vor allem anderen laufen — sonst blitzt
            die helle Fassung auf, bevor die dunkle greift. */}
        <ThemeScript />
        {/* Über allem und vor allem: Er gilt auch für die Anmeldeseite und die
            Fehlerseiten, die außerhalb des Gerüsts liegen. */}
        <StatusBarScrim />
        <Providers>{children}</Providers>
        {/* Steht bewusst außerhalb von `Providers`: er muss auch dann etwas
            anzeigen können, wenn von deren JavaScript nichts ankommt. */}
        <BootWatchdog />
      </body>
    </html>
  );
}
