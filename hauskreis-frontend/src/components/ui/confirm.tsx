'use client';

/**
 * „Bist du sicher?" — in der Sprache der App statt in der des Browsers.
 *
 * `window.confirm` war schnell hingeschrieben und an fünf Stellen falsch: es
 * sieht aus wie ein Systemfehler, lässt keinen erklärenden Satz zu, und auf dem
 * iPhone friert es die PWA ein, bis jemand tippt. Vor allem aber steht dort
 * „OK" — an einer Stelle, an der „Löschen" oder „Verlassen" stehen müsste.
 *
 * Die Schnittstelle bleibt trotzdem so kurz wie die alte, sonst hätte niemand
 * sie benutzt:
 *
 * ```ts
 * const confirm = useConfirm();
 * if (!(await confirm({ title: 'Wirklich löschen?', tone: 'danger' }))) return;
 * ```
 *
 * Gebaut auf `Sheet`, nicht daneben: Escape, gesperrter Hintergrund und
 * Fokusführung stecken dort schon richtig drin, und die App hat genau ein
 * Overlay-Idiom.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Button } from './button';
import { Sheet } from './sheet';

export interface ConfirmOptions {
  title: string;
  /** Ein Satz zu den Folgen. Was verloren geht, gehört hierher. */
  body?: React.ReactNode;
  /** Beschriftung des zustimmenden Knopfes — nie „OK", immer das Verb. */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'neutral';
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);

  // Die Antwort geht an den Aufrufer zurück, der noch in seinem `await` steht.
  // Sie lebt deshalb in einer Ref und nicht im State: ein erneutes Rendern darf
  // sie nicht verlieren.
  const answer = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    answer.current?.(confirmed);
    answer.current = null;
    setPending(null);
  }, []);

  const ask = useCallback<Ask>((options) => {
    // Eine zweite Rückfrage, während die erste offen steht, gibt es nicht.
    // Falls doch, gilt die alte als abgelehnt — offen lassen hieße, den
    // Aufrufer für immer warten zu lassen.
    answer.current?.(false);

    setPending(options);
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Sheet
        open={pending !== null}
        onClose={() => settle(false)}
        title={pending?.title ?? ''}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => settle(false)}
            >
              {pending?.cancelLabel ?? 'Abbrechen'}
            </Button>
            <Button
              variant={pending?.tone === 'danger' ? 'danger' : 'primary'}
              className="flex-1"
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? 'Ja, weiter'}
            </Button>
          </div>
        }
      >
        {pending?.body && (
          <p className="text-sm leading-relaxed text-stone-600">
            {pending.body}
          </p>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm außerhalb des ConfirmProvider benutzt');
  return ask;
}
