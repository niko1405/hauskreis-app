'use client';

/**
 * Einen Termin von Hand anlegen. Legt die App die wöchentlichen Abende selbst
 * an, ist das meistens ein besonderer („Geburtstag von …"); führt die Gruppe
 * ihren Kalender selbst, meistens ein gewöhnlicher Dienstag. Danach richtet
 * sich die Vorgabe für „Besonderer Termin".
 *
 * Zwei Dinge unterscheiden ihn von einem erzeugten Abend: Er startet **leer**
 * und setzt sich einzeln zusammen, und er ist der übliche Weg zu einem Termin
 * über mehrere Tage. Eine Freizeit von Freitag bis Sonntag ist ein Termin,
 * kein Stapel aus dreien.
 *
 * **Ohne Ort.** Der ergibt sich meistens erst — aus dem Gastgeber, der sich
 * noch meldet, oder weil man draußen ist —, und er wird am Termin selbst
 * eingetragen wie an jedem anderen. Im Anlegen stand er als Feld, das man
 * fast immer leer ließ.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { CheckRow } from '@/components/ui/check-row';
import { SlotToggles } from '@/components/domain/slot-toggles';
import { useCreateMeeting, useMeetingSchedule } from '@/lib/api/hooks';
import { EMPTY_SLOTS, applySlotToggle } from '@/lib/meeting';
import { addDays, today } from '@/lib/date';
import type { MeetingSlotKey, MeetingSlots } from '@/lib/meeting';

export function CreateMeetingSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [date, setDate] = useState(() => addDays(today(), 7));
  const [endDate, setEndDate] = useState('');
  /**
   * Leer heißt „die Zeit der Gruppe" — den Wert setzt das Feld unten ein, sobald
   * der Rhythmus geladen ist. Ein eigener Zustand, damit eine eingetippte Zeit
   * nicht wieder überschrieben wird, wenn die Abfrage nachlädt.
   */
  const [startTime, setStartTime] = useState('');
  const [title, setTitle] = useState('');
  // Leer bis auf die Gebetsanliegen: Ein Termin von Hand muss nichts
  // erfüllen. Wer Thema und Lieder will, hakt zwei Bausteine an.
  const [slots, setSlots] = useState<MeetingSlots>(EMPTY_SLOTS);
  /**
   * `null` heißt „wie die Gruppe es eingestellt hat" — dann schickt das
   * Formular nichts, und der Server wendet dieselbe Regel an. So steht sie
   * einmal, und eine noch ladende Einstellung kann nichts Falsches mitschicken.
   */
  const [special, setSpecial] = useState<boolean | null>(null);

  const schedule = useMeetingSchedule();
  const create = useCreateMeeting();
  const toast = useToast();

  const gruppenzeit = schedule.data?.data.startTime ?? '18:00';
  const zeit = startTime || gruppenzeit;
  const besonders = special ?? schedule.data?.data.autoGenerate ?? true;

  // Über `applySlotToggle`, nicht mit einem einfachen Spread: Thema und
  // Testimony schließen einander aus, und das Formular soll gar nicht erst in
  // einen Zustand führen, den der Server mit 400 ablehnt.
  const toggle = (key: MeetingSlotKey, value: boolean) =>
    setSlots((current) => applySlotToggle(current, key, value));

  const submit = () => {
    create.mutate(
      {
        date,
        endDate: endDate === '' ? null : endDate,
        startTime: zeit,
        title: title.trim() === '' ? null : title.trim(),
        ...(special === null ? {} : { special }),
        ...slots,
      },
      {
        onSuccess: () => {
          toast.success('Termin angelegt.');
          setTitle('');
          setEndDate('');
          setStartTime('');
          setSpecial(null);
          onClose();
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Neuer Termin">
      <div className="space-y-4">
        <Field label="Von">
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>

        {/* Vorbelegt mit der Zeit der Gruppe und nicht leerbar: ein Abend ohne
            Uhrzeit ist kein Zustand, den es geben soll. Wer eine andere will,
            überschreibt sie hier. */}
        <Field label="Uhrzeit">
          <TextInput
            type="time"
            value={zeit}
            onChange={(event) =>
              setStartTime(event.target.value || gruppenzeit)
            }
          />
        </Field>

        <Field label="Bis (optional)">
          <TextInput
            type="date"
            value={endDate}
            min={date}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>

        <Field label="Titel (optional)">
          <TextInput
            value={title}
            placeholder="Ohne Titel"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <CheckRow
          label="Besonderer Termin"
          hint="Alle bekommen Bescheid und kurz vorher eine Erinnerung, und er steht in der Liste hervorgehoben."
          checked={besonders}
          onChange={setSpecial}
        />

        <Field
          label="Was gehört dazu"
          hint="Lässt sich später jederzeit ändern."
        >
          <SlotToggles slots={slots} onToggle={toggle} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={create.isPending}
            onClick={submit}
          >
            Anlegen
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
