/**
 * Datenschutz und Impressum, unten auf den Bildschirmen ohne Navigation.
 *
 * Genau dort werden sie gebraucht: Wer abgemeldet ist oder noch in keinem
 * Hauskreis steht, kommt an das Profil nicht heran — und dort steht die dritte
 * Fassung dieser beiden Links.
 *
 * Beide Seiten liegen außerhalb von `app/(app)/` und damit außerhalb von
 * `AuthGate`. Ein `<Link>` dorthin ist trotzdem richtig: Der App Router
 * verlässt beim Wechsel den ganzen Layout-Zweig, die Hülle wird also abgebaut.
 */
import Link from 'next/link';
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-center justify-center gap-3 text-[11px] text-stone-400 ${className}`}
    >
      <Link
        href="/datenschutz"
        className="underline-offset-2 hover:text-stone-600 hover:underline"
      >
        Datenschutz
      </Link>
      <span aria-hidden>·</span>
      <Link
        href="/impressum"
        className="underline-offset-2 hover:text-stone-600 hover:underline"
      >
        Impressum
      </Link>
    </p>
  );
}
