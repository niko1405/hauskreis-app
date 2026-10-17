'use client';

/**
 * Ein unterstrichenes Register unter der Pillen-Leiste des Archivs — „Eigene
 * Themen" und „Alle Themen", „Meine Lieder" und „Alle Lieder", „Zuhause" und
 * „Treffpunkte".
 */
import { cn } from '@/lib/cn';

export function ListTab({
  active,
  count,
  onSelect,
  children,
}: {
  active: boolean;
  count: number | undefined;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'flex-1 border-b-2 pb-2.5 text-sm font-semibold transition-colors',
        active
          ? 'border-terracotta-500 text-terracotta-600'
          : 'border-transparent text-stone-400 hover:text-stone-600',
      )}
    >
      {children}
      {count !== undefined && (
        <span className="ml-1.5 text-xs opacity-60">({count})</span>
      )}
    </button>
  );
}
