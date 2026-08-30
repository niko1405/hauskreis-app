'use client';

/**
 * Das Bild des Hauskreises — in der Kopfleiste klein, auf seinem Bildschirm
 * groß.
 *
 * Kein `Avatar`: Der hängt an `usePersonPhoto` und damit an einer Person. Die
 * Ähnlichkeit ist trotzdem Absicht — rund, Initialen als Rückfall, dieselben
 * Größenstufen —, denn es ist dieselbe Sorte Bild.
 *
 * Solange keins hochgeladen ist, stehen die Initialen des Namens da. Ehrlicher
 * als ein Haus-Symbol, das bei jedem Hauskreis gleich aussieht.
 */
import { cn } from '@/lib/cn';
import { useGroupPhoto } from '@/lib/api/hooks';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { initials } from '@/lib/person';

const SIZES = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-2xl',
} as const;

export function GroupAvatar({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { hauskreis } = useHauskreis();
  const photo = useGroupPhoto();
  const name = hauskreis?.name ?? '';

  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-terracotta-100 bg-cover bg-center font-bold text-terracotta-700',
        SIZES[size],
        className,
      )}
      style={
        photo.dataUrl ? { backgroundImage: `url(${photo.dataUrl})` } : undefined
      }
    >
      {/* Die Initialen bleiben im Markup, auch wenn ein Bild darüber liegt —
          sie stehen dann hinter einer deckenden Fläche. Sie herauszunehmen
          würde beim Laden einen leeren Kreis aufblitzen lassen. */}
      {!photo.dataUrl && (name ? initials(name) : '')}
    </div>
  );
}
