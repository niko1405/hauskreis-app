import { cn } from '@/lib/cn';

const VARIANTS = {
  neutral: 'bg-stone-100 text-stone-600 border-stone-200',
  terracotta: 'bg-terracotta-50 text-terracotta-700 border-terracotta-100',
  music: 'bg-music-bg text-music border-music-line',
  topic: 'bg-topic-bg text-topic border-topic-line',
  info: 'bg-info-bg text-info border-info-line',
  alert: 'bg-alert-bg text-alert border-alert-line',
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        // `whitespace-nowrap`: Ein Abzeichen ist eine Beschriftung, kein Text.
        // Wird es eng, soll die Zeile umbrechen und nicht „hostet nicht"
        // mitten im Wort — das sieht nach Fehler aus und ist nie richtig.
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
