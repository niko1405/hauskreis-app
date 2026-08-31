'use client';

/**
 * Der Platz ganz unten — und wer ihn gerade hat.
 *
 * **Warum es ihn gibt.** Auf der Terminseite steht unten der Antwort-Balken
 * statt der Tab-Leiste: Man ist *in* einem Termin, und die fünf Ziele der
 * Navigation meint man dort gerade nicht — der Weg heraus ist der Zurück-Pfeil
 * oben links. Die Frage „bist du dabei?" dagegen stellt sich bei jedem Besuch.
 *
 * **Warum ein Portal.** Der Balken wird von der Terminseite gerendert, also
 * tief in `<main>`. Dort kann er nicht bleiben: `main` trägt
 * `overflow-x-hidden`, und damit wird `overflow-y` zu `auto` — es ist ein
 * Scroll-Container, und ein `sticky bottom-0` darin klebte an *seiner*
 * Unterkante, die weit unter dem Bildschirm liegt. Genau deshalb ist auch die
 * Tab-Leiste ein Geschwister von `main` und nicht sein Kind. Der Balken muss
 * also im DOM dorthin, wo die Leiste steht, und im React-Baum bleiben, wo
 * seine Daten sind.
 *
 * **Ein Zähler und kein Schalter**, aus demselben Grund wie in
 * `overlay-lock.ts`: React montiert Effekte im Strict Mode doppelt, und ein
 * Boolean, das einmal zu früh zurückfällt, blendet die Navigation mitten im
 * Betrieb wieder ein. Beim Wechsel von einem kommenden auf einen vergangenen
 * Termin meldet sich der alte Balken ab und kein neuer an; dass die Leiste
 * dann verlässlich wiederkommt, hängt an genau dieser Buchführung.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface BottomSlotValue {
  /** Wohin portiert wird. `null`, bis der Ausgang gerendert ist. */
  target: HTMLElement | null;
  setTarget: (element: HTMLElement | null) => void;
  /** Meldet einen Anspruch an und gibt seine Rücknahme zurück. */
  claim: () => () => void;
  /** Ob gerade jemand den Platz hat. */
  taken: boolean;
}

const Context = createContext<BottomSlotValue | null>(null);

function useSlot(): BottomSlotValue {
  const slot = useContext(Context);
  if (!slot) throw new Error('BottomSlot außerhalb des BottomSlotProvider');
  return slot;
}

export function BottomSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);

  // Stabil, und das ist tragend: `BottomSlot` hängt seinen Effekt an genau
  // diese Funktion. Entstünde sie bei jedem Render neu, liefe der Effekt jedes
  // Mal ab — er würde also freigeben und neu anmelden, und weil das den Zähler
  // bewegt, ginge das ohne Ende so weiter.
  const claim = useCallback(() => {
    setClaims((count) => count + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      setClaims((count) => count - 1);
    };
  }, []);

  const value = useMemo(
    () => ({ target, setTarget, claim, taken: claims > 0 }),
    [target, claim, claims],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Der Platz im Gerüst. Solange ihn niemand hat, steht hier der Fallback —
 * also die Tab-Leiste.
 */
export function BottomSlotOutlet({ fallback }: { fallback: React.ReactNode }) {
  const { setTarget, taken } = useSlot();

  return (
    <>
      {/* `contents`: Der Kasten hier erzeugt selbst keine Box, seine Kinder
          hängen direkt in der Spalte des Gerüsts. Das ist nicht Kosmetik —
          `position: sticky` wirkt nur innerhalb seines Elternkastens, und der
          wäre hier genau so hoch wie der Balken selbst. Er hätte damit keinen
          Weg zu kleben und säße einfach am Fuß der Seite, statt am unteren
          Rand des Bildschirms zu bleiben. Genau daran scheiterte auch schon
          der Gedanke, ihn in `<main>` zu rendern. */}
      <div ref={setTarget} className="contents" />
      {!taken && fallback}
    </>
  );
}

/** Portiert seinen Inhalt an den Platz unten und meldet ihn als belegt. */
export function BottomSlot({ children }: { children: React.ReactNode }) {
  const { target, claim } = useSlot();

  useEffect(() => claim(), [claim]);

  return target ? createPortal(children, target) : null;
}
