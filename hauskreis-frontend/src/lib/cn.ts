import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Klassen zusammensetzen, spätere Tailwind-Klassen gewinnen. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
