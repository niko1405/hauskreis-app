'use client';

/**
 * Ein Lied an den Abend bringen — beide Wege hinter einem Knopf.
 *
 * Am Termin standen dafür zwei Knöpfe untereinander: „Aus dem Archiv" öffnete
 * ein Sheet, „Lied vorschlagen" klappte ein Formular in der Karte auf. Zwei
 * Knöpfe für **eine** Absicht, in zwei verschiedenen Bauformen, und wer das
 * Lied nicht auswendig kannte, musste raten, welcher der richtige ist. Jetzt
 * fragt ein Sheet zuerst, worum es geht.
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
 */
import { useDeferredValue, useState } from 'react';
import { ArrowLeft, Check, Library, Music, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useAddMeetingSong, useSongSearch } from '@/lib/api/hooks';
import { formatRelativeDay } from '@/lib/date';
import { OpenLinkButton } from './lyrics-link';
import { SongAiAssist } from './song-ai-assist';
import { SongPickerBody } from './song-picker-body';

type Step = 'root' | 'archiv' | 'neu';

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
    <Sheet
      open={open}
      onClose={close}
      title={chrome.title}
      subtitle={chrome.subtitle}
      footer={chrome.footer}
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
 * Das Eintrag-Formular — unverändert aus der Liederkarte hierher gezogen.
 *
 * Es stand dort als aufklappender Block mitten in der Karte und war damit die
 * einzige Eingabe der Seite ohne eigene Fläche.
 *
 * Als Haken und nicht als Komponente, weil sein Inhalt in zwei Attribute des
 * Sheets muss — Rumpf und Fußzeile. Dieselbe Lösung wie `useLocationForm`.
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
}): { fields: React.ReactNode; footer: React.ReactNode; reset: () => void } {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyricsUrl, setLyricsUrl] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Wie im Archiv: die Eingabe bleibt flüssig, die Abfrage hinkt nach.
  const search = useSongSearch(useDeferredValue(title), active);
  const add = useAddMeetingSong(meetingId);

  const trimmedTitle = title.trim();
  const hits = search.data?.items ?? [];
  /**
   * Ein Lied, das genau so schon in der Datenbank steht. Dann ist „neu
   * anlegen" fast immer ein Versehen — man hat den Treffer übersehen.
   */
  const exactHit = hits.find(
    (song) => song.title.toLowerCase() === trimmedTitle.toLowerCase(),
  );

  const reset = () => {
    setTitle('');
    setArtist('');
    setLyricsUrl('');
    setConfirming(false);
  };

  const submit = (songId?: string) => {
    const payload = songId
      ? { songId }
      : {
          title: trimmedTitle,
          artist: artist.trim() === '' ? null : artist.trim(),
          lyricsUrl: lyricsUrl.trim() === '' ? null : lyricsUrl.trim(),
        };

    if (!songId && trimmedTitle === '') return;

    add.mutate(payload, { onSuccess: onAdded });
  };

  const fields = (
    <div className="space-y-2">
      {/* Kein autoFocus: auf dem Telefon schöbe die Tastatur sonst genau die
          Trefferliste aus dem Bild, die man gleich braucht. */}
      <TextInput
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Titel"
        aria-label="Titel des Liedes"
      />

      {/* Treffer aus der Song-Datenbank: schneller und ohne Dubletten. */}
      {hits.length > 0 && (
        <ul className="space-y-1">
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
                    {song.artist ?? 'Unbekannt'} · {song.timesPlayed}× gesungen
                    {song.lastPlayedAt &&
                      `, zuletzt ${formatRelativeDay(song.lastPlayedAt)}`}
                  </span>
                </span>
                <Check size={13} className="shrink-0 text-stone-300" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TextInput
        value={artist}
        onChange={(event) => setArtist(event.target.value)}
        placeholder="Interpret (optional)"
        aria-label="Interpret"
      />

      {/* Der Knopf daneben erscheint erst, wenn im Feld eine Adresse steht —
          gerade beim KI-Vorschlag ist „einmal draufsehen" die nächste Frage. */}
      <div className="flex items-center gap-2">
        <TextInput
          type="url"
          inputMode="url"
          value={lyricsUrl}
          onChange={(event) => setLyricsUrl(event.target.value)}
          placeholder="Link zu Text/Akkorden (optional)"
          aria-label="Link zu Text/Akkorden"
        />
        <OpenLinkButton url={lyricsUrl.trim()} />
      </div>

      {/* Gespeichert wird nur der Link, nie der Text selbst (CLAUDE.md §6). */}

      <SongAiAssist
        draft={{ title, artist, lyricsUrl }}
        onApply={(patch) => {
          if (patch.title !== undefined) setTitle(patch.title);
          if (patch.artist !== undefined) setArtist(patch.artist);
          if (patch.lyricsUrl !== undefined) setLyricsUrl(patch.lyricsUrl);
        }}
      />
    </div>
  );

  const footer = confirming ? (
    <div className="space-y-2 rounded-md border border-topic-line bg-topic-bg p-3">
      <p className="text-xs leading-relaxed text-topic">
        {exactHit ? (
          <>
            „{exactHit.title}" steht schon in eurer Liederliste. Willst du
            wirklich einen zweiten Eintrag anlegen?
          </>
        ) : (
          <>
            „{trimmedTitle}" kennt die App noch nicht. Neu anlegen? Es landet
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
          loading={add.isPending}
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
        disabled={trimmedTitle === ''}
        onClick={() => setConfirming(true)}
      >
        Hinzufügen
      </Button>
    </div>
  );

  return { fields, footer, reset };
}
