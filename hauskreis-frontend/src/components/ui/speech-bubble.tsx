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
 * `surface` ist die Fläche der Blase: `warm` (voreingestellt) für das, was
 * jemand sagt — ein Hauch Terracotta (`--color-bubble`), hell wie dunkel; im
 * Dunkeln war die Blase sonst fast schwarz und las sich wie ein Loch in der
 * Karte. `card` steht direkt auf der Seite, wo sie selbst die Karte ist und
 * nur sagt, wer an etwas arbeitet (`PersonBubble`).
 *
 * `tail` sagt, wo der Sprecher steht: `left` neben der Blase (Gesicht links,
 * Blase rechts), `top` darüber — in der Zusagenliste hängt der Satz unter dem
 * Namen, und der Zipfel zeigt nach oben auf ihn. `size="sm"` ist die knappe
 * Fassung für Listen, in denen die Blase nur einen Satz trägt.
 */
export function SpeechBubble({
  surface = 'warm',
  tail = 'left',
  size = 'md',
  className,
  children,
}: {
  surface?: 'warm' | 'card';
  tail?: 'left' | 'top';
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  const fill =
    surface === 'card' ? 'bg-card border-line' : 'bg-bubble border-bubble-line';

  return (
    <div className={cn('relative min-w-0', tail === 'left' && 'flex-1')}>
      <span
        aria-hidden
        className={cn(
          'absolute size-2.5 rotate-45 border-l',
          // Links: auf Höhe der ersten Zeile aus der Blase heraus. Oben: kurz
          // hinter der Ecke nach oben heraus, zum Namen darüber.
          tail === 'left'
            ? 'top-3 -left-[5px] border-b'
            : '-top-[5px] left-4 border-t',
          fill,
        )}
      />
      <div
        className={cn(
          'border',
          // Eine Zeile Text in einer Blase mit dem großen Radius ist eine Pille;
          // die knappe Fassung bekommt deshalb einen kleineren.
          size === 'sm' ? 'rounded-xl px-3 py-1.5' : 'rounded-lg px-3.5 py-2.5',
          tail === 'left' && 'rounded-tl-none',
          fill,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
