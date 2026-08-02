'use client';

import { cn } from '@/lib/cn';
import { avatarScheme, initials } from '@/lib/person';
import type { PersonRef } from '@/lib/api/types';

const SIZES = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-base',
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Ohne Person ein gestrichelter Platzhalter statt eines leeren Kreises: „hier
 * fehlt noch jemand" ist eine Einladung, „—" wäre eine Fehlmeldung.
 */
export function Avatar({
  person,
  size = 'md',
  className,
}: {
  person?: PersonRef | null;
  size?: AvatarSize;
  className?: string;
}) {
  if (!person) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-full border border-dashed border-terracotta-100 text-terracotta-400',
          SIZES[size],
          className,
        )}
      >
        +
      </div>
    );
  }

  const scheme = avatarScheme(person.id);

  return (
    <div
      title={person.name}
      className={cn(
        'flex items-center justify-center rounded-full font-bold',
        scheme.bg,
        scheme.text,
        SIZES[size],
        className,
      )}
    >
      {initials(person.name)}
    </div>
  );
}

/** Mehrere Personen überlappend — für Themen- und Musik-Teams. */
export function AvatarStack({
  people,
  size = 'sm',
  max = 3,
}: {
  people: PersonRef[];
  size?: AvatarSize;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((person) => (
        <Avatar
          key={person.id}
          person={person}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {rest > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-stone-100 font-bold text-stone-500 ring-2 ring-card',
            SIZES[size],
          )}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
