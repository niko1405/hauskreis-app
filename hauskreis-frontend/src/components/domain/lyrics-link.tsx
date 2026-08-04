/**
 * Der Weg zum Songtext.
 *
 * Es gab ihn schon an beiden Stellen, an denen Lieder stehen — aber als
 * schmales graues Symbol ohne Beschriftung, das sich niemand als Link
 * angesehen hat. Deshalb jetzt mit Wort daneben, in Terracotta wie alles
 * andere Anklickbare, und mit einer Trefferfläche, die auf einem Telefon auch
 * getroffen wird.
 *
 * Gespeichert wird nur die Adresse, nie der Text selbst (CLAUDE.md §6).
 */
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';

export function LyricsLink({
  url,
  title,
  className,
}: {
  url: string | null | undefined;
  /** Für Screenreader: „Songtext zu …" statt neunmal „Text". */
  title: string;
  className?: string;
}) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Songtext zu ${title}`}
      // Der Klick gehört dem Link, nicht der Zeile darunter.
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1.5',
        'text-[11px] font-semibold text-terracotta-600 hover:border-terracotta-400 hover:bg-terracotta-50',
        className,
      )}
    >
      Text
      <ExternalLink size={11} />
    </a>
  );
}
