import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Plus_Jakarta_Sans } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Hauskreis',
  description:
    'Termine, Hosts, Themen, Songs, Gebetsbuddys und Actionsteps für einen Hauskreis — an einem Ort.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Hauskreis',
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
  themeColor: '#cc7a5e',
  // Kein `maximum-scale`: Hineinzoomen darf man immer können.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${jakarta.variable} ${instrument.variable}`}>
      <body className="bg-shell font-sans text-stone-800 antialiased selection:bg-terracotta-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
