import { cn } from '@/lib/cn';

/**
 * Eine Sprechblase neben einem Gesicht.
 *
 * Was darin steht, sagt jemand: ein Gebetsanliegen an die Gruppe, „hat es
 * angefangen" an einem Thema, „bereitet sie vor" an einer Einheit. Als Kasten
 * mit Rahmen sah es aus wie ein Datenfeld. Sie steht einmal, weil drei
 * Bildschirme sie brauchen — zwei Fassungen desselben Zipfels wären irgendwann
 * zwei verschiedene.
 *
 * Der Zipfel ist ein gedrehtes Quadrat in derselben Fläche und Randfarbe, dem
 * zwei Kanten fehlen — kein SVG, keine zweite Farbe, die beim Umschalten auf
 * Dunkel nachgezogen werden müsste. Die linke obere Ecke der Blase bleibt
 * eckig, damit er anschließt.
 *
 * `surface` ist die Fläche der Blase: `shell` in einer Karte, von der sie sich
 * abheben soll; `card` direkt auf der Seite, wo sie selbst die Karte ist.
 */
export function SpeechBubble({
  surface = 'shell',
  className,
  children,
}: {
  surface?: 'shell' | 'card';
  className?: string;
  children: React.ReactNode;
}) {
  const fill = surface === 'card' ? 'bg-card' : 'bg-shell';

  return (
    <div className="relative min-w-0 flex-1">
      {/* Nach links aus der Blase heraus, auf Höhe der ersten Zeile. */}
      <span
        aria-hidden
        className={cn(
          'absolute top-3 -left-[5px] size-2.5 rotate-45 border-b border-l border-line',
          fill,
        )}
      />
      <div
        className={cn(
          'rounded-lg rounded-tl-none border border-line px-3.5 py-2.5',
          fill,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
