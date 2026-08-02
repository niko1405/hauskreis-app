import { cn } from '@/lib/cn';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-card p-5 shadow-sm shadow-stone-200/40',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Dieselbe Optik, aber anklickbar — mit den Zuständen, die dazugehören. */
export function CardButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-card border border-line bg-card p-5 text-left shadow-sm shadow-stone-200/40 transition-transform',
        'hover:border-line-strong active:scale-[0.99]',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between px-1">
      <h2 className="text-xs font-bold tracking-wider text-stone-400 uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}
