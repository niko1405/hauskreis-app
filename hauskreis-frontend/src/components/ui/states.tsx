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

/**
 * Noch nichts da — gestrichelt, weil es nicht aussehen soll wie etwas, das da
 * ist.
 *
 * **Mit `icon`** steht darüber eine getönte Kachel mit dem Symbol der Sache,
 * die fehlt, und der Titel in der Schrift der Überschriften — wie „Noch
 * niemand eingeteilt" auf „Gebet". Für die Listen, in denen man eine leere
 * Fläche am häufigsten sieht (Lieder, Themen, Abwesenheiten): Dort ist sie
 * oft der erste Eindruck einer neuen Gruppe, und ein grauer Satz in einem
 * gestrichelten Kasten sah aus wie ein Fehler.
 *
 * `framed={false}` lässt den Rahmen weg — für die Stelle **in** einer Karte,
 * wo ein zweiter Rahmen eine Karte in der Karte wäre.
 */
export function EmptyState({
  title,
  hint,
  action,
  icon,
  framed = true,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  framed?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        framed
          ? 'rounded-card border border-dashed border-line-strong px-6 py-10'
          : 'px-2 py-4',
        icon && framed && 'py-8',
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-terracotta-500/30 bg-terracotta-500/10 text-terracotta-500"
        >
          {icon}
        </span>
      )}
      <p
        className={cn(
          icon
            ? 'font-serif text-base font-bold text-stone-800'
            : 'text-sm font-semibold text-stone-600',
        )}
      >
        {title}
      </p>
      {hint && (
        <p
          className={cn(
            'mt-1.5 text-xs text-stone-400',
            icon && 'max-w-xs leading-relaxed',
          )}
        >
          {hint}
        </p>
      )}
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
 *
 * Ein Satz, der sagt, was los ist — keine Erklärung der Mechanik —, und
 * **ein** Knopf, der nachlädt und den Hinweis zurücksetzt
 * (`resolveConflict`). Danach genügt ein zweiter Druck auf Speichern —
 * und der ist die Stelle, an der ein Mensch bestätigt, dass er den fremden
 * Stand überschreibt.
 */
export function ConflictBanner({
  onResolve,
}: {
  onResolve: () => void | Promise<void>;
}) {
  return (
    <div className="rounded-md border border-warn-line bg-warn-bg p-4">
      <p className="text-sm font-bold text-warn">Das hat nicht geklappt</p>
      <p className="mt-1 text-xs leading-relaxed text-warn/80">
        Dein Stand war nicht mehr der aktuelle — jemand hat hier inzwischen
        gespeichert. Wir haben ihn aufgefrischt; sieh kurz drüber und probier es
        noch einmal.
      </p>
      <div className="mt-3">
        <Button size="sm" onClick={() => void onResolve()}>
          Alles klar
        </Button>
      </div>
    </div>
  );
}

/**
 * „Mehr laden" unter einer Liste, die seitenweise nachlädt.
 *
 * Kein Endlos-Scrollen: auf einem Telefon mit
 * schlechter Verbindung ist ein Knopf ehrlicher als eine Liste, die von selbst
 * weiterlädt und dabei hängt.
 */
export function LoadMore({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  label: string;
}) {
  if (!query.hasNextPage) return null;

  return (
    <Button
      variant="secondary"
      className="mt-3 w-full"
      loading={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
    >
      {label}
    </Button>
  );
}
