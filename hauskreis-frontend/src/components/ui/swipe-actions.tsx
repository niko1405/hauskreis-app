'use client';

/**
 * Eine Listenzeile, die nach links geht und rechts ihre Knöpfe freigibt.
 *
 * **Warum ein Wisch.** Zwei dauerhafte Ziele am Rand jeder Zeile träfe der
 * Daumen zuverlässiger als die Zeile selbst, und ein langer Druck steht
 * nirgends dran — wer ihn nicht kennt, hält die Liste für schreibgeschützt.
 * Ein Wisch zeigt sich beim ersten versehentlichen Ansatz.
 *
 * **Am Rechner fahren dieselben Knöpfe beim Überfahren ein.** Wischen gibt es
 * dort nicht, und eine Liste, die auf dem Telefon bearbeitbar ist und im
 * Fenster nicht, wäre keine Entscheidung, sondern ein Versäumnis. Gefragt wird
 * nach `pointerType === 'mouse'`: Ein Touchscreen schickt beim Tippen ebenfalls
 * ein `pointerenter`, und die Zeile ginge schon beim Antippen auf.
 *
 * **Immer nur eine offen.** Ein winziger Speicher wie in `overlay-lock.ts` hält
 * fest, welche Zeile gerade offen ist; wer aufgeht, schließt die andere. Ein
 * „Fertig"-Knopf je Zeile braucht es deshalb nicht.
 *
 * **Die Breite wird gemessen, nicht gerechnet.** Sie hängt an der Zahl der
 * Knöpfe, und die ist je Zeile verschieden — bei den Ideen darf nicht jede:r
 * löschen, bei den Treffpunkten nur ein aktiver. Eine feste Zahl käme bei
 * jeder zweiten Zeile zu weit oder zu kurz.
 *
 * **Ein Wisch ist kein Tipp.** Steckt in der Zeile ein Link (die Setlist am
 * Termin), endet ein Zug mit der Maus mit einem Klick auf ihn — und öffnete
 * die Seite, die man gar nicht wollte. Der Klick nach einem Zug wird deshalb
 * geschluckt; der nächste Druck setzt das zurück.
 */
import { motion, useAnimationControls } from 'motion/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { cn } from '@/lib/cn';
import { pulledLeft, pulledRight } from './swipe';

export interface SwipeAction {
  icon: React.ReactNode;
  /** Was der Knopf tut — als `aria-label` und als Tooltip. */
  label: string;
  onClick: () => void;
  /** `danger` färbt rot; alles andere bleibt neutral. */
  tone?: 'danger';
  disabled?: boolean;
}

/* ------------------------------------------------------------------ *
 * Wer gerade offen ist. Eine Zeile, gruppenweit.
 * ------------------------------------------------------------------ */

let offen: string | null = null;
const listeners = new Set<() => void>();

function setOffen(id: string | null): void {
  if (offen === id) return;
  offen = id;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useIstOffen(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => offen === id,
    () => false,
  );
}

export function SwipeActions({
  actions,
  className,
  children,
}: {
  actions: SwipeAction[];
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const auf = useIstOffen(id);
  const knoepfe = useRef<HTMLDivElement>(null);
  const gezogen = useRef(false);
  const [breite, setBreite] = useState(0);
  const controls = useAnimationControls();

  useLayoutEffect(() => {
    const element = knoepfe.current;
    if (!element) return;

    const observer = new ResizeObserver(() => setBreite(element.offsetWidth));
    observer.observe(element);
    setBreite(element.offsetWidth);

    return () => observer.disconnect();
  }, [actions.length]);

  // Beim Verschwinden aufräumen: Eine gelöschte Zeile, die als offen gemerkt
  // ist, hielte den Platz für eine Zeile, die es nicht mehr gibt.
  useEffect(() => () => setOffen(offen === id ? null : offen), [id]);

  // `animate` und nicht das `animate`-Attribut: Das Ziehen setzt `x` selbst,
  // und zwei Quellen für denselben Wert streiten sich beim Loslassen.
  useEffect(() => {
    void controls.start({
      x: auf ? -breite : 0,
      transition: { type: 'spring', damping: 30, stiffness: 300 },
    });
  }, [auf, breite, controls]);

  const zeigen = () => setOffen(id);
  const schliessen = () => setOffen(offen === id ? null : offen);

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') zeigen();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') schliessen();
      }}
    >
      {/* Fest im Hintergrund am rechten Rand — die Zeile darüber gibt sie
          frei, statt sie zu schieben. */}
      <div
        ref={knoepfe}
        className="absolute inset-y-0 right-0 flex items-stretch"
        aria-hidden={!auf}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            title={action.label}
            disabled={action.disabled}
            tabIndex={auf ? undefined : -1}
            onClick={() => {
              setOffen(null);
              action.onClick();
            }}
            className={cn(
              'flex w-12 items-center justify-center transition-colors disabled:opacity-50',
              action.tone === 'danger'
                ? 'bg-alert-bg text-alert hover:bg-alert-line'
                : 'bg-shell text-stone-500 hover:bg-line',
            )}
          >
            {action.icon}
          </button>
        ))}
      </div>

      <motion.div
        drag="x"
        // Die Richtung wird einmal entschieden und dann gehalten: Ohne das
        // würde jeder senkrechte Wisch die Zeile ein Stück mitnehmen.
        dragDirectionLock
        dragConstraints={{ left: -breite, right: 0 }}
        dragElastic={{ left: 0.05, right: 0 }}
        animate={controls}
        onPointerDown={() => {
          gezogen.current = false;
        }}
        onDragStart={() => {
          gezogen.current = true;
        }}
        onClickCapture={(event) => {
          if (!gezogen.current) return;
          gezogen.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragEnd={(_, info) => {
          if (pulledLeft(info)) zeigen();
          else if (pulledRight(info)) schliessen();
          else void controls.start({ x: auf ? -breite : 0 });
        }}
        // `pan-y`: Senkrecht scrollt die Seite wie immer, waagerecht gehört die
        // Geste uns. Ohne das entscheidet der Browser, und er entscheidet für
        // sich.
        className="relative touch-pan-y bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}
