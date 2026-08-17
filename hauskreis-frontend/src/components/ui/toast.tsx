'use client';

/**
 * Kurze Rückmeldungen — gespeichert, abgesagt, Fehler beim Speichern.
 *
 * Bewusst schlicht: eine Meldung zur Zeit, oben eingeschwebt, nach ein paar
 * Sekunden weg. Alles, was länger sichtbar bleiben muss (ein Konflikt etwa),
 * gehört an die Stelle, an der es passiert ist, nicht hierher.
 */
import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const TINTS = {
  success: 'text-music',
  error: 'text-alert',
  info: 'text-terracotta-500',
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    nextId.current += 1;
    setToast({ id: nextId.current, kind, message });
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message: string) => show(message, 'success'),
      error: (message: string) => show(message, 'error'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // `pt-safe`, sonst schiebt die Animation den Toast um 16 px nach unten
        // und damit auf Geräten mit Aussparung mitten in die Dynamic Island.
        className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 16 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex w-full max-w-sm items-start gap-3 rounded-md border border-stone-800 bg-stone-900 p-4 text-stone-100 shadow-2xl"
            >
              {(() => {
                const Icon = ICONS[toast.kind];
                return (
                  <Icon
                    size={18}
                    className={`mt-0.5 shrink-0 ${TINTS[toast.kind]}`}
                  />
                );
              })()}
              <p className="text-xs leading-relaxed font-semibold">
                {toast.message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast außerhalb des ToastProvider benutzt');
  return value;
}
