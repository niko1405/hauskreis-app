'use client';

/**
 * Die Fläche der gewählten Option, die zur nächsten Wahl **gleitet**, statt
 * zu springen — in der Tab-Leiste, der Seitenspalte und jedem Umschalter.
 *
 * **Gemessen wird im eigenen Behälter, nicht auf dem Bildschirm.** Es gibt
 * eine Fläche je Gruppe; sie liegt im Behälter und rückt an die Stelle der
 * gewählten Option (`offsetLeft`/`offsetTop`, also Layout und nicht, wo etwas
 * gerade gemalt wird). Vorher lief es über `layoutId`, und das misst am
 * Bildschirm: Änderte sich mit derselben Wahl die Höhe eines Sheets — „Per
 * Link | Per E-Mail" tauscht den halben Inhalt —, rückte der ganze Umschalter
 * nach oben, und die Fläche fuhr ihm von der alten Stelle quer übers Bild
 * hinterher. So bewegt sie sich mit dem Behälter, und gleiten tut sie nur
 * zwischen zwei Optionen.
 *
 * **Gleiten nur beim Wechsel der Wahl.** Ändert sich die Größe — ein breiteres
 * Fenster, eine Zahl, die eine Stelle dazubekommt —, steht sie sofort richtig
 * (`ResizeObserver`); beim ersten Erscheinen bewegt sich nichts. Verschoben
 * wird über `translate`; Breite und Höhe ziehen nur mit, wo die Optionen
 * verschieden groß sind, und betreffen dann allein diese eine Fläche.
 *
 * **So benutzt man sie:** Der Behälter ist `relative`, die Fläche sein
 * **erstes** Kind, und die gewählte Option trägt `data-glide={group}`. Die
 * Optionen selbst sind `relative` (oder ihr Inhalt): So liegt die Schrift über
 * der Fläche, ohne `z-index` zu bemühen. `group` ist je Gruppe eindeutig — feste
 * Leisten nehmen einen festen Namen, Umschalter `useId()`. Ohne gewählte Option
 * ist sie unsichtbar.
 */
import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Wo ein Element im Behälter liegt, über die Kette der `offsetParent`.
 *
 * Unabhängig von jedem `transform` darüber oder daran — einem Sheet, das
 * gerade hereinfährt, einer Option, die unter dem Finger kleiner wird. `null`,
 * solange etwas davon nicht gezeichnet wird (`display: none`).
 */
function boxWithin(element: HTMLElement, container: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;

  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    // Gezählt wird ab der Innenkante des Rahmens; auf dem Weg nach oben
    // kommt der Rahmen jeder Zwischenstation dazu.
    if (parent && parent !== container) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    node = parent;
  }

  if (node !== container) return null;
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

function sameBox(a: Box, b: Box): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

export function GlidePill({
  group,
  active,
  className,
  as: Tag = 'span',
}: {
  /** Steht an der gewählten Option als `data-glide`. */
  group: string;
  /** Die gewählte Option, `null` für keine — ihr Wechsel löst das Gleiten aus. */
  active: string | null;
  /** Form und Farbe der Fläche. */
  className: string;
  /** `li` in einer Liste, deren Kinder Listeneinträge sein müssen. */
  as?: 'span' | 'li';
}) {
  const ref = useRef<HTMLElement>(null);
  const placed = useRef<Box | null>(null);

  useLayoutEffect(() => {
    const pill = ref.current;
    const container = pill?.parentElement;
    if (!pill || !container) return;

    const target = () =>
      active === null
        ? null
        : container.querySelector<HTMLElement>(
            `[data-glide="${CSS.escape(group)}"]`,
          );

    const place = (glide: boolean) => {
      const element = target();
      const box = element ? boxWithin(element, container) : null;

      if (!box) {
        pill.style.opacity = '0';
        placed.current = null;
        return;
      }

      const from = placed.current;
      if (from && sameBox(from, box)) return;
      placed.current = box;

      // Gleiten nur von einer Stelle, an der sie schon stand; der Übergang
      // selbst steht in der Klasse, `none` setzt ihn für diesen Schritt aus.
      pill.style.transition = glide && from ? '' : 'none';
      pill.style.translate = `${box.x}px ${box.y}px`;
      pill.style.width = `${box.width}px`;
      pill.style.height = `${box.height}px`;
      pill.style.opacity = '1';
    };

    place(true);

    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    const element = target();
    if (element) observer.observe(element);

    return () => observer.disconnect();
  }, [active, group]);

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-0 left-0 opacity-0 transition-[translate,width,height] duration-[420ms] ease-ios',
        className,
      )}
    />
  );
}
