import type { Metadata, Viewport } from 'next';
import {
  Instrument_Serif,
  Plus_Jakarta_Sans,
  Roboto_Slab,
} from 'next/font/google';
import { BootWatchdog } from '@/components/layout/boot-watchdog';
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
    statusBarStyle: 'default',
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
   * Die Farbe der Fläche, nicht die der Marke.
   *
   * iOS färbt damit im Standalone-Modus den Streifen über der App. Stand dort
   * Terracotta, saß ein kräftiger Balken über einer cremefarbenen Leinwand —
   * eine sichtbare Kante genau da, wo eine native App keine hat. Die
   * `media`-Angaben greifen, solange niemand von Hand umgeschaltet hat; danach
   * zieht `theme.ts` das Meta-Tag nach.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5efe9' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1917' },
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
        <Providers>{children}</Providers>
        {/* Steht bewusst außerhalb von `Providers`: er muss auch dann etwas
            anzeigen können, wenn von deren JavaScript nichts ankommt. */}
        <BootWatchdog />
      </body>
    </html>
  );
}
