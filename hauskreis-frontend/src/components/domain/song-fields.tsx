'use client';

/**
 * Titel, Interpret, Link — und die beiden KI-Abkürzungen darunter.
 *
 * An drei Stellen dieselben Felder: beim Anlegen im Archiv
 * (`new-song-sheet.tsx`), beim Vorschlagen eines neuen Lieds am Termin
 * (`song-suggest-sheet.tsx`) und im Bearbeitungsmodus der Liedseite. Zwei
 * Fassungen wären zwei Meinungen darüber, was ein Lied ausmacht.
 *
 * Der Link zeigt auf Text **oder** Akkorde — bei vier Instrumentalist:innen ist
 * ein Akkordblatt genauso der richtige —, deshalb heißt das Feld nicht
 * „Songtext". Den Text selbst speichert die App nie auf dem Server; wer ihn
 * für sich haben will, legt eine eigene Version im Gerät an (CLAUDE.md §6.7).
 */
import { Field, TextInput } from '@/components/ui/field';
import { OpenLinkButton } from './lyrics-link';
import { SongAiAssist } from './song-ai-assist';

export interface SongFieldValues {
  title: string;
  artist: string;
  lyricsUrl: string;
}

export function SongFields({
  values,
  onChange,
  afterTitle,
}: {
  values: SongFieldValues;
  onChange: (patch: Partial<SongFieldValues>) => void;
  /** Was direkt unter dem Titel steht — am Termin die Treffer der Liederliste. */
  afterTitle?: React.ReactNode;
}) {
  return (
    <>
      <Field label="Titel">
        <TextInput
          value={values.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Gott ist gut"
        />
      </Field>
      {afterTitle}

      <Field label="Interpret">
        <TextInput
          value={values.artist}
          onChange={(event) => onChange({ artist: event.target.value })}
          placeholder="Outbreakband"
        />
      </Field>

      <Field label="Link zu Text/Chords">
        {/* Der Knopf daneben, nicht darunter: er gehört zu diesem Feld und
            erscheint erst, wenn darin etwas steht, das eine Adresse ist. */}
        <div className="flex items-center gap-2">
          <TextInput
            type="url"
            inputMode="url"
            value={values.lyricsUrl}
            onChange={(event) => onChange({ lyricsUrl: event.target.value })}
            placeholder="https://…"
          />
          <OpenLinkButton url={values.lyricsUrl.trim()} />
        </div>
      </Field>

      <SongAiAssist draft={values} onApply={onChange} />
    </>
  );
}

/** Was aus den Feldern an den Server geht — leere Felder als `null`. */
export function songInput(values: SongFieldValues) {
  const artist = values.artist.trim();
  const lyricsUrl = values.lyricsUrl.trim();

  return {
    title: values.title.trim(),
    artist: artist === '' ? null : artist,
    lyricsUrl: lyricsUrl === '' ? null : lyricsUrl,
  };
}
