'use client';

/**
 * Die beiden Abkürzungen beim Erfassen eines Liedes (CLAUDE.md §6).
 *
 * Beide auf Knopfdruck, nie beim Tippen: jeder Aufruf dauert Sekunden und
 * kostet etwas. Ein Feld, das sich bei jedem Buchstaben von selbst ändert,
 * wäre außerdem unheimlich.
 *
 * Die Komponente füllt **nur leere Felder**. Steht schon etwas anderes drin,
 * wird es nicht überschrieben, sondern als antippbarer Vorschlag angeboten —
 * sonst löscht ein Knopfdruck die eigene Korrektur.
 */
import { Link2, RotateCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  useLyricsLinkSuggestions,
  useSongLookupStatus,
  useSongMetadataFromLink,
} from '@/lib/api/hooks';
import type { LyricsLinkCandidate } from '@/lib/api/types';

export interface SongDraft {
  title: string;
  artist: string;
  lyricsUrl: string;
}

/** Was aus einem Vorschlag in die Felder übernommen werden soll. */
type Patch = Partial<SongDraft>;

export function SongAiAssist({
  draft,
  onApply,
}: {
  draft: SongDraft;
  onApply: (patch: Patch) => void;
}) {
  const status = useSongLookupStatus();
  const fromLink = useSongMetadataFromLink();
  const search = useLyricsLinkSuggestions();
  const toast = useToast();

  /** Was das Modell gefunden hat, das Feld aber schon anders belegt ist. */
  const [pending, setPending] = useState<Patch>({});
  const [candidates, setCandidates] = useState<LyricsLinkCandidate[] | null>(
    null,
  );
  /**
   * Was beim letzten Druck dazugekommen ist.
   *
   * Nur hier und nicht in der Antwort: der Server liefert das Bekannte zuerst
   * und das Neue dahinter, und die Komponente kennt die vorherige Liste. Ein
   * Feld dafür wäre eine Angabe über den Verlauf **dieser** Sitzung an einer
   * Stelle, die nichts davon weiß.
   */
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Kein Schlüssel im Backend, oder die Frage läuft noch: dann gibt es die
  // Knöpfe gar nicht erst. Ein Knopf, der nur eine Fehlermeldung erzeugt, ist
  // schlimmer als keiner.
  if (!status.data?.enabled) return null;

  const title = draft.title.trim();
  const lyricsUrl = draft.lyricsUrl.trim();

  /** Leeres Feld füllen, belegtes als Vorschlag zurückgeben. */
  const distribute = (found: Patch) => {
    const fill: Patch = {};
    const ask: Patch = {};

    for (const [key, value] of Object.entries(found) as [
      keyof SongDraft,
      string | undefined,
    ][]) {
      if (!value) continue;
      if (draft[key].trim() === '') fill[key] = value;
      else if (draft[key].trim() !== value) ask[key] = value;
    }

    if (Object.keys(fill).length > 0) onApply(fill);
    setPending(ask);
    return { filled: Object.keys(fill).length, asked: Object.keys(ask).length };
  };

  const runFromLink = () => {
    setCandidates(null);
    setFresh(new Set());
    fromLink.mutate(lyricsUrl, {
      onSuccess: (found) => {
        const { filled, asked } = distribute({
          title: found.title ?? undefined,
          artist: found.artist ?? undefined,
        });

        if (filled === 0 && asked === 0) {
          toast.error('Auf der Seite war kein Lied zu erkennen.');
        }
      },
    });
  };

  /**
   * `more` ist der zweite Druck: das Bekannte bleibt stehen, und daneben sucht
   * der Server gezielt weiter. Ohne ihn käme beliebig oft derselbe
   * Zwischenspeicher — wer einen schlechten Vorschlag bekommen hatte, war damit
   * fertig.
   */
  const runSearch = (more: boolean) => {
    setPending({});
    const bisher = candidates ?? [];

    search.mutate(
      { title, artist: draft.artist.trim() || null, more },
      {
        onSuccess: ({ candidates: found }) => {
          const bekannt = new Set(bisher.map((entry) => entry.url));
          setCandidates(found);
          setFresh(
            new Set(
              found
                .filter((entry) => !bekannt.has(entry.url))
                .map((entry) => entry.url),
            ),
          );

          if (found.length === 0) {
            toast.error(`Zu „${title}" war nichts zu finden.`);
          } else if (more && found.length === bisher.length) {
            // Sonst sähe der zweite Druck aus, als hätte er nichts getan —
            // dieselbe Liste, kein Hinweis, kein Grund.
            toast.error('Nichts Weiteres gefunden.');
          }
        },
      },
    );
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-line p-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          loading={fromLink.isPending}
          disabled={lyricsUrl === '' || search.isPending}
          onClick={runFromLink}
        >
          <Sparkles size={13} />
          Aus Link ausfüllen
        </Button>

        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          loading={search.isPending}
          disabled={title.length < 2 || fromLink.isPending}
          onClick={() => runSearch(candidates !== null)}
        >
          {candidates === null ? <Link2 size={13} /> : <RotateCw size={13} />}
          {candidates === null ? 'Link suchen' : 'Weitere suchen'}
        </Button>
      </div>

      {/* Die Suche fragt wirklich bei Google nach und prüft danach jeden Link.
          Der Spinner allein sagt nicht, ob das noch läuft oder schon hakt. */}
      {search.isPending && (
        <p className="text-[10px] text-stone-400">
          Sucht und prüft die Treffer — das dauert ein paar Sekunden.
        </p>
      )}

      {Object.entries(pending).map(([key, value]) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            onApply({ [key]: value });
            setPending((rest) => {
              const { [key as keyof SongDraft]: _taken, ...keep } = rest;
              return keep;
            });
          }}
          className="block w-full rounded-md border border-topic-line bg-topic-bg px-3 py-2 text-left text-xs text-topic hover:border-topic"
        >
          {LABELS[key as keyof SongDraft]} laut Seite: „{value}" — übernehmen?
        </button>
      ))}

      {candidates?.map((candidate) => (
        <button
          key={candidate.url}
          type="button"
          onClick={() => {
            onApply({ lyricsUrl: candidate.url });
            setCandidates(null);
            setFresh(new Set());
            // Titel und Interpret stehen auf der gefundenen Seite oft sauberer
            // als in der eigenen Eingabe — anbieten, nicht aufdrängen.
            distribute({
              title: candidate.title ?? undefined,
              artist: candidate.artist ?? undefined,
            });
          }}
          className="flex w-full items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-left hover:border-terracotta-400"
        >
          <Link2 size={13} className="shrink-0 text-stone-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-stone-700">
              {candidate.title ?? title}
            </span>
            <span className="block truncate text-[10px] text-stone-400">
              {candidate.site}
              {candidate.artist && ` · ${candidate.artist}`}
            </span>
          </span>
          {/* Ohne die Markierung wäre nach dem zweiten Druck nicht zu sehen,
              was er gebracht hat — die Liste wird nur länger. */}
          {fresh.has(candidate.url) && candidates.length > fresh.size && (
            <span className="shrink-0 rounded-full bg-terracotta-50 px-2 py-0.5 text-[9px] font-bold tracking-wide text-terracotta-600 uppercase">
              neu
            </span>
          )}
        </button>
      ))}

      {candidates !== null && candidates.length > 0 && (
        <p className="text-[10px] leading-relaxed text-stone-400">
          Nicht dabei? Noch einmal suchen — die bisherigen bleiben stehen.
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-stone-400">
        Generierte Vorschläge von einem Sprachmodell - können ungenau sein, also
        erst prüfen vor hinzufügen.
      </p>
    </div>
  );
}

const LABELS: Record<keyof SongDraft, string> = {
  title: 'Titel',
  artist: 'Interpret',
  lyricsUrl: 'Link',
};
