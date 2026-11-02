/**
 * Das Symbol eines Ziels, mit dem Punkt daneben, wenn es etwas Neues gibt.
 *
 * Eine eigene Datei, weil zwei es brauchen, die einander nicht importieren
 * dürfen: die Navigation (`nav.tsx`) und die Glocke in der Seitenspalte
 * (`notification-bell.tsx`), die von der Navigation eingebunden wird.
 *
 * Der Ring in Leinwandfarbe ist kein Zierrat: Er hebt den Punkt vom Symbol ab,
 * über dem er sitzt, und zwar hell wie dunkel. Ohne ihn verschwimmt er bei
 * aktivem Ziel mit der Terracotta-Farbe darunter.
 *
 * `sr-only`: Für alle, die nicht hinsehen, ist ein farbiger Kreis nichts. Der
 * Punkt steht dort, wo er ausgesprochen gehört — im Ziel, nicht daneben.
 */
import type { LucideIcon } from 'lucide-react';

export function NavIcon({
  icon: Icon,
  size,
  strokeWidth,
  unread,
}: {
  icon: LucideIcon;
  size: number;
  strokeWidth?: number;
  unread: boolean;
}) {
  return (
    <span className="relative">
      <Icon size={size} strokeWidth={strokeWidth} />
      {unread && (
        <>
          <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-terracotta-500 ring-2 ring-canvas" />
          <span className="sr-only">(Neues)</span>
        </>
      )}
    </span>
  );
}
