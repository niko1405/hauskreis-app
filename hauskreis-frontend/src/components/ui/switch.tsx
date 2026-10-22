'use client';

/**
 * Ein Schalter für alles, was an oder aus ist — und **sofort** gilt.
 *
 * **Die Regel:** Ein Schalter wirkt in dem Moment, in dem man ihn umlegt, wie
 * in den Einstellungen eines Telefons. Ein Schalter, der danach noch auf
 * „Speichern" wartet, sieht aus, als wäre etwas passiert, und ist es nicht.
 * Das **Häkchen** bleibt deshalb überall dort, wo eine Angabe Teil eines
 * Formulars ist (Bausteine eines Abends, der Entwurf in der Geschenk-
 * Verwaltung) oder wo man etwas abhakt oder auswählt (erledigte Ideen, Filter).
 */
import { cn } from '@/lib/cn';

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Nur nötig, wenn kein `<label>` darum steht — `SwitchRow` beschriftet ihn
   * über seinen Text.
   */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full transition-colors duration-200',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none',
        'disabled:opacity-50',
        checked ? 'bg-terracotta-500' : 'bg-stone-200',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-[3px] size-6 rounded-full bg-white shadow-sm shadow-black/20 transition-transform duration-200',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

/**
 * Eine Einstellung als Zeile: was sie ist, was sie gerade bewirkt, rechts der
 * Schalter.
 *
 * Die ganze Zeile ist ein `<label>`, und ein `button` ist ein beschriftbares
 * Element — ein Tipp auf den Text legt den Schalter also mit um, und der Text
 * ist zugleich sein Name für Vorleser. Ein Ziel von fünfzig Pixeln am Rand
 * einer Zeile, durch die man liest, wäre zu wenig.
 *
 * `description` darf sich mit dem Zustand ändern: Im Profil sagt sie, was
 * der Schalter **gerade** bewirkt, statt in einer Erklärung beide Fälle
 * aufzuzählen.
 */
export function SwitchRow({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  description?: React.ReactNode;
  /** Ein Symbol in einer getönten Kachel links — für Listen von Angaben. */
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3',
        disabled && 'cursor-default',
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-terracotta-50 text-terracotta-600"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-stone-800">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-400">
            {description}
          </span>
        )}
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}
