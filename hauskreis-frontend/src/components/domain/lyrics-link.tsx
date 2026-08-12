/**
 * Der Weg zu Text oder Akkorden.
 *
 * Es gab ihn schon an beiden Stellen, an denen Lieder stehen — aber als
 * schmales graues Symbol ohne Beschriftung, das sich niemand als Link
 * angesehen hat. Deshalb jetzt mit Wort daneben, in Terracotta wie alles
 * andere Anklickbare, und mit einer Trefferfläche, die auf einem Telefon auch
 * getroffen wird.
 *
 * Gespeichert wird nur die Adresse, nie der Text selbst (CLAUDE.md §6).
 */
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Eine Adresse, die man gefahrlos als `href` einsetzen kann.
 *
 * `javascript:` und `data:` sind gültige URLs und wären als Link ein Einfallstor
 * — und in ein Textfeld tippt sich so etwas leichter, als man denkt. Nebenbei
 * beantwortet die Prüfung die zweite Frage: halb getippter Text ist noch keine
 * Adresse, und ein Knopf, der auf `htt` zeigt, ist kaputter als keiner.
 */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function LyricsLink({
  url,
  title,
  className,
}: {
  url: string | null | undefined;
  /** Für Screenreader: „Text zu …" statt neunmal „Text". */
  title: string;
  className?: string;
}) {
  if (!isHttpUrl(url)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Text oder Akkorde zu ${title}`}
      // Der Klick gehört dem Link, nicht der Zeile darunter.
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1.5',
        'text-[11px] font-semibold text-terracotta-600 hover:border-terracotta-400 hover:bg-terracotta-50',
        className,
      )}
    >
      Text
      <ExternalLink size={11} />
    </a>
  );
}

/**
 * Den eingetragenen Link einmal ansehen, bevor man ihn abspeichert.
 *
 * Steht neben dem Eingabefeld und nicht in der Liste: dort ist die Frage „was
 * steht auf der Seite", hier „stimmt das überhaupt". Besonders bei einem
 * Vorschlag des Sprachmodells — der sieht immer plausibel aus, und ob er zum
 * richtigen Lied führt, sieht man nur, wenn man draufklickt. Bisher hieß das:
 * markieren, kopieren, woanders einfügen.
 *
 * Ohne gültige Adresse gibt es den Knopf nicht. Er ausgegraut dastehen zu lassen
 * wäre ein Ziel für den Daumen, das nichts tut.
 */
export function OpenLinkButton({ url }: { url: string | null | undefined }) {
  if (!isHttpUrl(url)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Link öffnen und prüfen"
      title="Link öffnen und prüfen"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line',
        'text-terracotta-600 transition-colors hover:border-terracotta-400 hover:bg-terracotta-50',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
      )}
    >
      <ExternalLink size={15} />
    </a>
  );
}
