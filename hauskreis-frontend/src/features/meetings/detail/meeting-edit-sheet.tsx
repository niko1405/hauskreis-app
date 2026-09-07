'use client';

/**
 * Titel, Uhrzeit und Infos eines Termins — in einem Sheet, mit einem Knopf.
 *
 * **Warum das drei Felder in einem Formular sind und nicht drei Stellen in der
 * Seite.** Sie hingen vorher an einem Bearbeitungsmodus, den ein Schalter ganz
 * unten ein- und ausschaltete: Der Titel bekam dann einen Stift daneben, die
 * Uhrzeit einen weiteren, die Infos einen dritten — jeder mit eigenem
 * „Übernehmen", jeder mit eigenem Schreibvorgang. Wer die Uhrzeit ändern
 * wollte, musste erst ans Seitenende scrollen, einen Schalter finden, wieder
 * hochscrollen und dann den richtigen Stift treffen.
 *
 * Es sind aber drei Angaben derselben Sache: **was dieser Abend ist**. Also ein
 * Knopf im Kopf der Seite, ein Formular, ein Speichern.
 *
 * **Geschrieben wird nur, was sich geändert hat.** Nicht aus Sparsamkeit: An
 * der Uhrzeit des nächsten Termins hängt eine Benachrichtigung an die ganze
 * Gruppe. Wer den Titel korrigiert und dabei dieselbe Zeit mitschickte, löste
 * sie mit aus.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import type { Meeting, UpdateMeetingInput } from '@/lib/api/types';

/** Leer heißt „nichts eingetragen" und nicht „ein leerer Text". */
function geleert(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export function MeetingEditSheet({
  open,
  meeting,
  placeholder,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  meeting: Meeting;
  /** Der Name, den der Abend ohne eigenen Titel trägt — als Platzhalter. */
  placeholder: string;
  saving: boolean;
  onSave: (input: UpdateMeetingInput) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(meeting.title ?? '');
  const [startTime, setStartTime] = useState(meeting.startTime);
  const [infoText, setInfoText] = useState(meeting.infoText ?? '');

  /**
   * Beim Öffnen zurück auf den gespeicherten Stand.
   *
   * Der Zustand lebt so lange wie die Seite, nicht wie das Sheet — wer
   * abbricht und noch einmal aufmacht, fände sonst seinen verworfenen Entwurf
   * wieder vor. Und hat in der Zwischenzeit jemand anders gespeichert, stünde
   * hier der alte Stand, den das nächste Speichern zurückschriebe.
   */
  useEffect(() => {
    if (!open) return;
    setTitle(meeting.title ?? '');
    setStartTime(meeting.startTime);
    setInfoText(meeting.infoText ?? '');
  }, [open, meeting.title, meeting.startTime, meeting.infoText]);

  const submit = () => {
    const input: UpdateMeetingInput = {};

    if (geleert(title) !== meeting.title) input.title = geleert(title);
    if (startTime !== meeting.startTime) input.startTime = startTime;
    if (geleert(infoText) !== meeting.infoText)
      input.infoText = geleert(infoText);

    // Nichts geändert: dann ist „Speichern" dasselbe wie „Schließen". Ein
    // leerer `PATCH` hübe nur die Version des Termins und ließe alle anderen
    // Bildschirme neu laden.
    if (Object.keys(input).length > 0) onSave(input);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Termin bearbeiten">
      <div className="space-y-4">
        <Field
          label="Titel des Termins"
          hint="Leer lassen: dann steht dort die Art des Termins."
        >
          <TextInput
            value={title}
            placeholder={placeholder}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        {/* Ein leeres Feld hieße „keine Uhrzeit", und die gibt es nicht — das
            fängt der Knopf unten ab. */}
        <Field
          label="Uhrzeit"
          hint="Ist das der nächste Termin, bekommen die anderen Bescheid."
        >
          <TextInput
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </Field>

        {/* Was man **vor** dem Abend wissen muss — „bringt Kuchen mit", „wir
            fangen später an". Das stand einmal unten zwischen Zusammenfassung
            und Actionstep und wurde dort nie rechtzeitig gelesen. */}
        <Field label="Zusätzliche Infos (optional)">
          <TextArea
            value={infoText}
            placeholder="Was sollen die anderen vorher wissen?"
            onChange={(event) => setInfoText(event.target.value)}
          />
        </Field>

        <Button
          className="w-full"
          loading={saving}
          disabled={startTime === ''}
          onClick={submit}
        >
          Speichern & Aktualisieren
        </Button>
      </div>
    </Sheet>
  );
}
