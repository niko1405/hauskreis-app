'use client';

/**
 * Titel, Uhrzeit, Infos, „besonders" und Bausteine eines Termins — in einem
 * Sheet, mit einem Knopf.
 *
 * Es sind Angaben derselben Sache: **was dieser Abend ist**. Also ein Knopf im
 * Kopf der Seite, ein Formular, ein Speichern — statt drei Stiften mit je
 * eigenem „Übernehmen" und Schreibvorgang.
 *
 * **Geschrieben wird nur, was sich geändert hat.** Nicht aus Sparsamkeit: An
 * der Uhrzeit des nächsten Termins hängt eine Benachrichtigung an die ganze
 * Gruppe. Wer den Titel korrigiert und dabei dieselbe Zeit mitschickte, löste
 * sie mit aus.
 *
 * **„Was gehört dazu" steht auch hier** — und wird mit demselben „Speichern"
 * geschrieben. Schriebe jeder Haken sofort, bekäme, wer zwei Bausteine
 * tauschen will, zwei Schreibvorgänge, zwei Rückfragen und dazwischen einen
 * Abend, den es so nie geben sollte.
 *
 * Die Ausschlüsse (Thema gegen Testimony) wirken beim Anhaken sofort sichtbar,
 * geschrieben wird erst beim Speichern. Geht dabei etwas verloren, fragt das
 * Sheet vorher — „Abbrechen" lässt es offen, und nichts ist geschrieben.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Field, FieldLabel, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CheckRow, SlotToggles } from '@/components/domain/slot-toggles';
import { MEETING_SLOT_KEYS, applySlotToggle } from '@/lib/meeting';
import type { MeetingSlots } from '@/lib/meeting';
import type { Meeting, UpdateMeetingInput } from '@/lib/api/types';
import { slotChangeQuestion } from './slot-losses';

/** Die sechs Bausteine eines Termins, ohne den Rest seiner Antwort. */
function slotsOf(meeting: Meeting): MeetingSlots {
  return Object.fromEntries(
    MEETING_SLOT_KEYS.map((key) => [key, meeting[key]]),
  ) as MeetingSlots;
}

/** Leer heißt „nichts eingetragen" und nicht „ein leerer Text". */
function geleert(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export function MeetingEditSheet({
  open,
  meeting,
  placeholder,
  cancelled,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  meeting: Meeting;
  /** Der Name, den der Abend ohne eigenen Titel trägt — als Platzhalter. */
  placeholder: string;
  /** An einem abgesagten Abend gibt es nichts umzubauen. */
  cancelled: boolean;
  saving: boolean;
  onSave: (input: UpdateMeetingInput) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(meeting.title ?? '');
  const [startTime, setStartTime] = useState(meeting.startTime);
  const [infoText, setInfoText] = useState(meeting.infoText ?? '');
  const [slots, setSlots] = useState<MeetingSlots>(() => slotsOf(meeting));
  const [special, setSpecial] = useState(meeting.special);
  const confirm = useConfirm();

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
    setSlots(slotsOf(meeting));
    setSpecial(meeting.special);
    // Die einzelnen Felder und nicht `meeting` als Ganzes: Ein Termin, der
    // im Hintergrund neu geladen wird, ist ein neues Objekt mit denselben
    // Werten — und setzte zurück, was man gerade tippt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    meeting.title,
    meeting.startTime,
    meeting.infoText,
    meeting.special,
    meeting.hasTopicSlot,
    meeting.hasSongSlot,
    meeting.hasTestimonySlot,
    meeting.hasPrayerSlot,
    meeting.hasSnackSlot,
    meeting.hasNotesSlot,
  ]);

  const submit = async () => {
    const input: UpdateMeetingInput = {};

    if (geleert(title) !== meeting.title) input.title = geleert(title);
    if (startTime !== meeting.startTime) input.startTime = startTime;
    if (geleert(infoText) !== meeting.infoText)
      input.infoText = geleert(infoText);
    if (special !== meeting.special) input.special = special;

    const slotsChanged = MEETING_SLOT_KEYS.filter(
      (key) => slots[key] !== meeting[key],
    );
    for (const key of slotsChanged) input[key] = slots[key];

    // Erst fragen, dann schreiben. Ein Nein lässt das Sheet offen: Wer sich
    // verklickt hat, soll den Haken zurücksetzen können, ohne alles andere
    // noch einmal einzugeben.
    const question =
      slotsChanged.length > 0 ? slotChangeQuestion(meeting, slots) : null;
    if (question) {
      const ok = await confirm({ ...question, tone: 'danger' });
      if (!ok) return;
    }

    // Nichts geändert: dann ist „Speichern" dasselbe wie „Schließen". Ein
    // leerer `PATCH` hübe nur die Version des Termins und ließe alle anderen
    // Bildschirme neu laden.
    if (Object.keys(input).length > 0) onSave(input);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Termin bearbeiten"
      // Im Fuß und nicht am Ende des Formulars: Mit den Bausteinen ist es
      // länger als ein Bildschirm, und Speichern soll man nicht suchen müssen.
      footer={
        <Button
          className="w-full"
          loading={saving}
          disabled={startTime === ''}
          onClick={() => void submit()}
        >
          Speichern & Aktualisieren
        </Button>
      }
    >
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
            fangen später an". */}
        <Field label="Zusätzliche Infos (optional)">
          <TextArea
            value={infoText}
            placeholder="Was sollen die anderen vorher wissen?"
            onChange={(event) => setInfoText(event.target.value)}
          />
        </Field>

        {!cancelled && (
          <CheckRow
            label="Besonderer Termin"
            hint="Ein Geburtstag, eine Freizeit — alle werden kurz vorher erinnert, und er steht in der Liste hervorgehoben."
            checked={special}
            onChange={setSpecial}
          />
        )}

        {!cancelled && (
          <div>
            <FieldLabel>Was gehört dazu</FieldLabel>
            <SlotToggles
              slots={slots}
              onToggle={(key, value) =>
                setSlots((current) => applySlotToggle(current, key, value))
              }
            />
          </div>
        )}
      </div>
    </Sheet>
  );
}
