/**
 * Die Seite für eine Adresse, die es nicht gibt.
 *
 * Ohne sie liefert Next seine eigene aus — die einzige Datei im ganzen Bau,
 * die einen eigenen `prefers-color-scheme`-Block mitbringt und dann in kaltem
 * Schwarzweiß gegen die warme Palette steht. Zu erreichen ist sie im Betrieb
 * kaum: die Adressen dieser App entstehen alle aus Links. Aber ein Tippfehler
 * in der Adresszeile oder ein alter Push-Link genügen.
 *
 * Bewusst ohne `AppShell` und ohne Anmeldung: Wer hier landet, ist außerhalb
 * dessen, was die App kennt, und soll den Weg zurück finden — nicht erst eine
 * Sitzung aufbauen müssen.
 */
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-8 text-center">
        <p className="font-serif text-4xl font-bold text-stone-300">404</p>
        <h1 className="mt-2 font-serif text-2xl leading-tight font-bold text-stone-900">
          Diese Seite gibt es nicht
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Vielleicht ein alter Link, vielleicht ein Termin, den es nicht mehr
          gibt.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-terracotta-500 px-6 py-3 text-sm font-semibold text-white"
        >
          Zurück zur App
        </Link>
      </div>
    </div>
  );
}
