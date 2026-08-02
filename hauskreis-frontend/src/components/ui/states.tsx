'use client';

/**
 * Die vier Zustände, die jede Ansicht kennt: lädt, leer, kaputt, im Konflikt.
 *
 * Wichtig ist der Unterschied zwischen **leer** und **fehlt**: Ein Termin ohne
 * Host ist ein Treffen im Schlosspark, kein fehlender Wert. Solche Fälle
 * bekommen ihren eigenen Text und nicht `EmptyState`.
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-stone-200/60', className)}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-card p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-6 w-2/3" />
      <div className="mt-5 flex gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-semibold text-stone-600">{title}</p>
      {hint && <p className="mt-1.5 text-xs text-stone-400">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-card border border-alert-line bg-alert-bg px-5 py-6 text-center">
      <AlertTriangle size={20} className="mx-auto text-alert" />
      <p className="mt-2 text-sm font-semibold text-alert">
        {errorMessage(error)}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onRetry}
        >
          <RefreshCw size={13} />
          Nochmal versuchen
        </Button>
      )}
    </div>
  );
}

/**
 * Der `412`-Fall. Sichtbar zu machen, dass gerade jemand anders gespeichert
 * hat, ist der einzige Zweck der ganzen ETag-Mechanik — hier darf nichts
 * stillschweigend verschwinden.
 */
export function ConflictBanner({
  onReload,
  onDismiss,
}: {
  onReload: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-md border border-topic-line bg-topic-bg p-4">
      <p className="text-sm font-bold text-topic">
        Jemand anders war schneller
      </p>
      <p className="mt-1 text-xs leading-relaxed text-topic/80">
        Während du getippt hast, wurde hier schon gespeichert. Dein Stand ist
        veraltet — lade neu und schau, was jetzt drinsteht.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onReload}>
          Neu laden
        </Button>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Später
          </Button>
        )}
      </div>
    </div>
  );
}
