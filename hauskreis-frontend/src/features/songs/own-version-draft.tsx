'use client';

/**
 * Die eigene Version beim Anlegen eines Lieds — im Archiv wie am Termin.
 *
 * Wer ein Lied anlegt, hat es oft gerade offen: Text und Akkorde gleich mit
 * hinterlegen spart den Weg zurück. Die Version entsteht im Editor, wartet hier,
 * bis das Lied eine Id hat, und landet dann im Gerät — nie beim Server
 * (CLAUDE.md §6.7).
 *
 * **Erst mit Link.** Was in einer eigenen Version steht, hat jemand von einer
 * Seite kopiert; ohne Link gäbe es die Seite nicht, und der erste Schritt im
 * Editor zeigte ins Leere.
 *
 * Als Haken, weil zwei Dinge an zwei Orte gehören: die Karte ins Formular, der
 * Editor daneben — er ist eine eigene Ebene, und das Sheet muss zu sein,
 * solange er offen ist (`editing`). Zwei Ebenen, die beide auf Escape hören,
 * schlössen einander.
 */
import { Check, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { Button, PRESSABLE } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { isHttpUrl } from '@/components/domain/lyrics-link';
import { cn } from '@/lib/cn';
import { useSaveOwnSong } from '@/lib/own-songs/use-own-songs';
import { OwnVersionEditor, type OwnVersionResult } from './own-version-editor';

export function useOwnVersionDraft(song: {
  title: string;
  artist: string | null;
  lyricsUrl: string | null;
}) {
  const toast = useToast();
  const saveOwn = useSaveOwnSong();
  const [version, setVersion] = useState<OwnVersionResult | null>(null);
  const [editing, setEditing] = useState(false);

  const linked = isHttpUrl(song.lyricsUrl);
  const ready = song.title !== '' && linked;

  const field = (
    <div>
      <FieldLabel>Eigene Version (optional)</FieldLabel>
      {version ? (
        <div className="flex items-center gap-3 rounded-card border border-success-line bg-success-bg/40 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success-bg text-success">
            <Check size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-800">
              Eigene Version bereit
            </span>
            <span className="block text-[11px] text-stone-500">
              {[version.key && `Tonart ${version.key}`, 'nur auf diesem Gerät']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Ändern
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setVersion(null)}>
            Entfernen
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!ready}
          onClick={() => setEditing(true)}
          className={cn(
            'flex w-full items-center gap-3 rounded-card border border-dashed border-line-strong p-4 text-left transition-colors hover:border-terracotta-400 disabled:opacity-50 disabled:hover:border-line-strong',
            PRESSABLE,
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-terracotta-50 text-terracotta-600">
            <Lock size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-800">
              Text & Akkorde für dich hinterlegen
            </span>
            <span className="block text-[11px] text-stone-400">
              {song.title === ''
                ? 'Erst einen Titel eintragen.'
                : !linked
                  ? 'Erst einen Link zum Liedtext eintragen — von dort kopierst du Text & Akkorde.'
                  : 'Nur auf diesem Gerät — niemand sonst sieht sie.'}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-stone-300" />
        </button>
      )}
    </div>
  );

  const editor = editing && (
    <OwnVersionEditor
      song={song}
      initialText={version?.text}
      onSave={(result) => {
        setVersion(result);
        setEditing(false);
      }}
      onClose={() => setEditing(false)}
    />
  );

  const reset = () => {
    setVersion(null);
    setEditing(false);
  };

  /**
   * Legt die Version unter der Id ab, die das Lied jetzt hat. Scheitert das,
   * steht das Lied trotzdem in der Liste — das sagt die Meldung.
   */
  const persist = async (saved: {
    id: string;
    title: string;
    artist: string | null;
  }) => {
    if (!version) return;
    try {
      await saveOwn.mutateAsync({
        songId: saved.id,
        title: saved.title,
        artist: saved.artist,
        ...version,
      });
    } catch {
      toast.error(
        'Das Lied steht in der Liste — deine Version ließ sich auf diesem Gerät aber nicht speichern.',
      );
    }
  };

  return {
    field,
    editor,
    editing,
    version,
    reset,
    persist,
    saving: saveOwn.isPending,
  };
}
