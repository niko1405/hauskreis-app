'use client';

/**
 * Die Fläche der gewählten Option, die zur nächsten Wahl **gleitet**, statt
 * zu springen — in der Tab-Leiste, der Seitenspalte und jedem Umschalter.
 *
 * Gerendert wird sie nur im gewählten Element; wechselt die Wahl, steht sie im
 * nächsten, und motion/react fährt sie über `layoutId` vom alten Platz zum
 * neuen. Das ist eine Verschiebung samt Skalierung, also Grafikkarte, kein
 * Layout. Beim ersten Erscheinen bewegt sich nichts.
 *
 * **Die `id` muss je Gruppe eindeutig sein** — zwei Umschalter mit derselben
 * Kennung tauschten ihre Pillen untereinander. Feste Leisten nehmen einen
 * festen Namen, Umschalter `useId()`.
 *
 * **Der Radius kommt als Zahl, nicht als Klasse.** Zwischen zwei verschieden
 * breiten Optionen wird die Fläche unterwegs skaliert, und motion/react
 * rechnet die Ecken nur dann zurück, wenn sie im `style` stehen — sonst
 * würden sie auf dem Weg oval.
 *
 * Wer sie benutzt, macht das Element `relative` und legt den Inhalt **nach**
 * ihr in einen eigenen `relative`-Kasten: So liegt die Schrift über der Fläche,
 * ohne `z-index` zu bemühen.
 */
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { SPRING_PILL } from '@/lib/motion';

export function GlidePill({
  id,
  radius,
  className,
}: {
  id: string;
  /** Eckenradius in Pixeln; `9999` für eine Pille. */
  radius: number;
  /** Lage und Farbe der Fläche — `inset-0` oder `-inset-px` gehört dazu. */
  className: string;
}) {
  return (
    <motion.span
      aria-hidden
      layoutId={id}
      transition={SPRING_PILL}
      style={{ borderRadius: radius }}
      className={cn('pointer-events-none absolute', className)}
    />
  );
}
