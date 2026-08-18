import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Wie sich ein Druck anfühlt — dieselbe Antwort auf jedem Bedienelement.
 *
 * **Warum es das braucht.** `globals.css` schaltet mit
 * `-webkit-tap-highlight-color: transparent` die Rückmeldung des Browsers ab,
 * und das ist richtig: Das graue Rechteck von iOS sieht nach Webseite aus.
 * Ersetzt wurde sie nur nie. Übrig blieben `hover:`-Zustände, und die greifen
 * auf einem Telefon entweder gar nicht oder kleben nach dem Tippen fest.
 *
 * Wer antippte, sah also nichts, bis die Antwort da war. Bei guter Verbindung
 * sind das achtzig Millisekunden und niemand merkt es; bei schlechter eine
 * Sekunde, und die App wirkt eingefroren — sie „springt dann mit Verzögerung
 * erst dahin".
 *
 * Das Nachgeben hängt an **nichts** außer dem Finger: kein Netz, kein
 * Zustand, keine Antwort. Genau deshalb hilft es.
 *
 * `duration-75` und drei Prozent: schnell und klein genug, dass es wie Druck
 * wirkt und nicht wie eine Animation.
 */
export const PRESSABLE =
  'transition-transform duration-75 active:scale-[0.97] disabled:active:scale-100';

const VARIANTS = {
  primary:
    'bg-terracotta-500 text-white hover:bg-terracotta-700 disabled:bg-terracotta-500/50',
  secondary:
    'bg-terracotta-50 text-terracotta-700 hover:bg-terracotta-100 disabled:opacity-50',
  ghost: 'text-stone-500 hover:bg-stone-100 disabled:opacity-50',
  danger: 'bg-alert-bg text-alert hover:bg-alert-line disabled:opacity-50',
} as const;

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3.5 text-sm',
} as const;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors',
        PRESSABLE,
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Runder Knopf für ein einzelnes Symbol — Zurück, Bearbeiten, Schließen. */
export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors',
        PRESSABLE,
        'hover:bg-stone-100 hover:text-stone-700 active:bg-stone-100',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
