/**
 * Der Antworttext eines Hilfe-Eintrags.
 *
 * Steht in einer eigenen Datei, seit ihn zwei Bildschirme brauchen: die Hilfe
 * selbst und die Anleitung zum Ausdrucken. Zwei Abschriften desselben
 * Renderers wären zwei Gelegenheiten, dass ein Absatz hier fett wird und dort
 * mit Sternchen dasteht.
 *
 * Leerzeile trennt Absätze, einzelner Umbruch trennt Zeilen — das erledigt
 * `whitespace-pre-line`, damit Aufzählungen nicht zu einem Fließtext
 * zusammenlaufen und es dafür keinen zweiten Mechanismus braucht.
 */
import { cn } from '@/lib/cn';

export function FaqAnswer({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    // Der Index als Schlüssel ist hier genau richtig: Die Absätze eines
    // Antworttextes stehen fest, sie kommen nicht dazu, gehen nicht weg und
    // tauschen nie den Platz.
    <div className={cn('space-y-3', className)}>
      {text.split('\n\n').map((paragraph, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <p key={index} className="whitespace-pre-line">
          <Emphasised text={paragraph} />
        </p>
      ))}
    </div>
  );
}

/**
 * `**fett**` im Antworttext.
 *
 * Ein ganzer Markdown-Übersetzer wäre für eine Auszeichnung zu viel Gepäck —
 * und Fettdruck ist die einzige, die diese Texte brauchen: Sie tragen die
 * Sätze, auf die es ankommt.
 */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {/* Auch hier ist der Index der richtige Schlüssel — und mehr noch: Er
          *ist* die Information. `split` mit Gruppe liefert abwechselnd Text und
          Auszeichnung, ungerade Stellen sind die fetten. */}
      {text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
        index % 2 === 1 ? (
          // eslint-disable-next-line react/no-array-index-key
          <strong key={index} className="font-semibold text-stone-700">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
