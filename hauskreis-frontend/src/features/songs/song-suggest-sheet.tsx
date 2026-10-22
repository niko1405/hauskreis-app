'use client';

/**
 * Ein Lied an den Abend bringen — beide Wege hinter einem Knopf.
 *
 * Ein Knopf für **eine** Absicht: Das Sheet fragt zuerst, worum es geht —
 * ein Lied aus dem Archiv oder ein neues.
 *
 * **Ein Sheet mit Schritten, keine gestapelten Sheets.** `Sheet` rendert ohne
 * Portal auf derselben Ebene und meldet seinen eigenen Escape-Handler an; zwei
 * übereinander schließen einander und fangen den Fokus im falschen Panel. Der
 * Schritt ersetzt also den Rumpf, statt sich darüberzulegen — dieselbe Lösung
 * wie in `venue-sheet.tsx` und `topic-choice-sheet.tsx`.
 *
 * Und deshalb steht hier auch **ein** `Sheet` und nicht drei: Sonst verschwände
 * es beim Schließen aus einem Schritt heraus schlagartig, statt hinauszufahren
 * — `AnimatePresence` braucht das Element, um es animieren zu können. Der
 * Formular-Rumpf kommt als Haken herein (`useNewSongForm`), wie bei
 * `useLocationForm` und aus demselben Grund: Er füllt Inhalt **und** Fußzeile
 * des Sheets, und die gehören zwei verschiedenen Attributen.
 *
 * Das Archiv steht oben, weil es meistens der richtige Weg ist: Die Gruppe
 * singt vieles wieder.
 *
 * **„Neues Lied" ist dasselbe Formular wie im Archiv** (`SongFields`), mit den
 * Treffern der Liederliste unter dem Titel und der eigenen Version darunter.
 * Die eigene Version ist eine Ebene über dem Sheet; solange sie offen ist,
 * ist das Sheet zu (`open && !editing`), wie im Archiv.
 */
import { useDeferredValue, useState } from 'react';
import { ArrowLeft, Check, Library, Music, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { SongPickerBody } from '@/components/domain/song-picker-body';
import {
  SongFields,
  songInput,
  type SongFieldValues,
} from '@/components/domain/song-fields';
import { useAddMeetingSong, useSongSearch } from '@/lib/api/hooks';
import { formatRelativeDay } from '@/lib/date';
import { useOwnVersionDraft } from './own-version-draft';

type Step = 'root' | 'archiv' | 'neu';

const EMPTY: SongFieldValues = { title: '', artist: '', lyricsUrl: '' };

export function SongSuggestSheet({
  open,
  onClose,
  meetingId,
  /** Was schon am Abend hängt — steht im Archiv dabei und lässt sich nicht doppeln. */
  alreadyPicked,
}: {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  alreadyPicked: readonly string[];
}) {
  const [step, setStep] = useState<Step>('root');

  // Beim Schließen zurück auf den Anfang und mit leerem Formular: Wer das
  // Sheet das nächste Mal aufmacht, will die Frage sehen und nicht den halben
  // Titel von vorhin.
  const close = () => {
    setStep('root');
    form.reset();
    onClose();
  };

  const form = useNewSongForm({
    meetingId,
    // Das Sheet bleibt geschlossen mit im Baum, damit es hinausfahren kann —
    // die Suche darf deshalb nur laufen, während man wirklich in dem Schritt
    // steht. (Sie käme ohnehin erst ab zwei Zeichen los, aber ein Feld, das
    // man beim Zurückgehen stehen lässt, fragt sonst weiter.)
    active: step === 'neu',
    onAdded: close,
    onBack: () => setStep('root'),
  });

  const chrome = {
    root: {
      title: 'Lied vorschlagen',
      subtitle: 'Für diesen Abend',
      footer: undefined,
    },
    archiv: {
      title: 'Aus dem Archiv',
      subtitle: 'Lieder, die die Gruppe schon kennt',
      footer: (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setStep('root')}
        >
          <ArrowLeft size={14} /> Zurück
        </Button>
      ),
    },
    neu: {
      title: 'Neues Lied',
      subtitle: 'Es landet zugleich in eurer Liederliste',
      footer: form.footer,
    },
  }[step];

  return (
    <>
      <Sheet
        open={open && !form.editing}
        onClose={close}
        title={chrome.title}
        subtitle={chrome.subtitle}
        footer={chrome.footer}
        // Nur die Suche steht fest hoch: Die beiden anderen Schritte haben
        // einen Inhalt, der sich beim Tippen nicht in der Höhe ändert.
        size={step === 'archiv' ? 'tall' : 'auto'}
      >
        {step === 'root' && (
          <div className="space-y-2">
            <ChoiceRow
              icon={<Library size={16} />}
              title="Aus dem Archiv"
              hint="Lieder, die ihr schon kennt"
              onSelect={() => setStep('archiv')}
            />
            <ChoiceRow
              icon={<Plus size={16} />}
              title="Neues Lied"
              hint="Steht noch nicht in eurer Liederliste"
              onSelect={() => setStep('neu')}
            />
          </div>
        )}

        {step === 'archiv' && (
          <SongPickerBody meetingId={meetingId} alreadyPicked={alreadyPicked} />
        )}

        {step === 'neu' && form.fields}
      </Sheet>
      {form.editor}
    </>
  );
}

function ChoiceRow({
  icon,
  title,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-card p-3 text-left transition-colors hover:border-terracotta-300"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-sm font-bold text-stone-900">
          {title}
        </span>
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Das Eintrag-Formular.
 *
 * Als Haken und nicht als Komponente, weil sein Inhalt in zwei Attribute des
 * Sheets muss — Rumpf und Fußzeile. Dieselbe Lösung wie `useLocationForm`.
 * Dazu kommt die Ebene der eigenen Version, die neben das Sheet gehört.
 */
function useNewSongForm({
  meetingId,
  active,
  onAdded,
  onBack,
}: {
  meetingId: string;
  active: boolean;
  onAdded: () => void;
  onBack: () => void;
}): {
  fields: React.ReactNode;
  footer: React.ReactNode;
  editor: React.ReactNode;
  editing: boolean;
  reset: () => void;
} {
  const toast = useToast();
  const [values, setValues] = useState<SongFieldValues>(EMPTY);
  const [confirming, setConfirming] = useState(false);

  const input = songInput(values);
  const own = useOwnVersionDraft(input);

  // Wie im Archiv: die Eingabe bleibt flüssig, die Abfrage hinkt nach.
  const search = useSongSearch(useDeferredValue(values.title), active);
  const add = useAddMeetingSong(meetingId);

  const hits = search.data?.items ?? [];
  /**
   * Ein Lied, das genau so schon in der Datenbank steht. Dann ist „neu
   * anlegen" fast immer ein Versehen — man hat den Treffer übersehen.
   */
  const exactHit = hits.find(
    (song) => song.title.toLowerCase() === input.title.toLowerCase(),
  );

  const reset = () => {
    setValues(EMPTY);
    setConfirming(false);
    own.reset();
  };

  const submit = (songId?: string) => {
    if (!songId && input.title === '') return;

    add.mutate(songId ? { songId } : input, {
      onSuccess: async (entry) => {
        if (own.version) {
          await own.persist(entry.song);
          toast.success('Deine Version liegt auf diesem Gerät.');
        }
        onAdded();
      },
    });
  };

  const fields = (
    <div className="space-y-4">
      <SongFields
        values={values}
        onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        afterTitle={
          // Treffer aus der Liederliste: schneller und ohne Dubletten.
          hits.length > 0 && (
            <ul className="-mt-2 space-y-1">
              {hits.map((song) => (
                <li key={song.id}>
                  <button
                    type="button"
                    onClick={() => submit(song.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-left hover:border-terracotta-400"
                  >
                    <Music size={13} className="shrink-0 text-stone-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-stone-700">
                        {song.title}
                      </span>
                      <span className="block truncate text-[10px] text-stone-400">
                        {song.artist ?? 'Unbekannt'} · {song.timesPlayed}×
                        gesungen
                        {song.lastPlayedAt &&
                          `, zuletzt ${formatRelativeDay(song.lastPlayedAt)}`}
                      </span>
                    </span>
                    <Check size={13} className="shrink-0 text-stone-300" />
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      />

      {own.field}
    </div>
  );

  const footer = confirming ? (
    <div className="space-y-2 rounded-md border border-warn-line bg-warn-bg p-3">
      <p className="text-xs leading-relaxed text-warn">
        {exactHit ? (
          <>
            „{exactHit.title}" steht schon in eurer Liederliste. Willst du
            wirklich einen zweiten Eintrag anlegen?
          </>
        ) : (
          <>
            „{input.title}" kennt die App noch nicht. Neu anlegen? Es landet
            dann in eurer Liederliste und lässt sich beim nächsten Mal einfach
            auswählen.
          </>
        )}
      </p>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={() => setConfirming(false)}
        >
          Nochmal ansehen
        </Button>
        <Button
          size="sm"
          className="flex-1"
          loading={add.isPending || own.saving}
          onClick={() => submit()}
        >
          {exactHit ? 'Trotzdem anlegen' : 'Anlegen'}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button variant="ghost" className="flex-1" onClick={onBack}>
        <ArrowLeft size={14} /> Zurück
      </Button>
      <Button
        className="flex-1"
        disabled={input.title === ''}
        onClick={() => setConfirming(true)}
      >
        Hinzufügen
      </Button>
    </div>
  );

  return { fields, footer, editor: own.editor, editing: own.editing, reset };
}
