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
 *
 * `tail` sagt, wo der Sprecher steht: `left` neben der Blase (Gesicht links,
 * Blase rechts), `top` darüber — in der Zusagenliste hängt der Satz unter dem
 * Namen, und der Zipfel zeigt nach oben auf ihn. `size="sm"` ist die knappe
 * Fassung für Listen, in denen die Blase nur einen Satz trägt.
 */
export function SpeechBubble({
  surface = 'shell',
  tail = 'left',
  size = 'md',
  className,
  children,
}: {
  surface?: 'shell' | 'card';
  tail?: 'left' | 'top';
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  const fill = surface === 'card' ? 'bg-card' : 'bg-shell';

  return (
    <div className={cn('relative min-w-0', tail === 'left' && 'flex-1')}>
      <span
        aria-hidden
        className={cn(
          'absolute size-2.5 rotate-45 border-l border-line',
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
          'border border-line',
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
