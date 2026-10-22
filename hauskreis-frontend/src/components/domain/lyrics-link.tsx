/**
 * Links nach draußen, zu Text oder Akkorden — prüfen und öffnen.
 *
 * Der Link steht auf der Seite des Lieds ganz oben, und die Liedzeile führt
 * hin; ein zweiter Weg an jeder Zeile wäre einer zu viel.
 *
 * Gespeichert wird nur die Adresse, nie der Text selbst (CLAUDE.md §6.7).
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

/**
 * Den eingetragenen Link einmal ansehen, bevor man ihn abspeichert.
 *
 * Steht neben dem Eingabefeld und nicht in der Liste: dort ist die Frage „was
 * steht auf der Seite", hier „stimmt das überhaupt". Besonders bei einem
 * Vorschlag des Sprachmodells — der sieht immer plausibel aus, und ob er zum
 * richtigen Lied führt, sieht man nur, wenn man draufklickt — ohne den Knopf
 * hieße das: markieren, kopieren, woanders einfügen.
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
