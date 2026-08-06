'use client';

/**
 * Einen Termin von Hand anlegen — in der Regel ein „Custom"-Termin
 * („Geburtstag von …"). Die Standard- und Lobpreis-Termine legt das Backend
 * selbst an, damit immer mindestens sieben im Voraus zuteilbar sind.
 *
 * Neu daran sind zwei Dinge, die beide vom besonderen Termin herkommen: er darf
 * **leer** starten und sich einzeln zusammensetzen lassen, und er darf über
 * mehrere Tage gehen. Ein Hauskreis-Abend ist ein Abend; eine Freizeit von
 * Freitag bis Sonntag ist ein Termin, kein Stapel aus dreien.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { SlotToggles } from '@/components/domain/slot-toggles';
import { useCreateMeeting, useLocations } from '@/lib/api/hooks';
import {
  MEETING_TYPE_LABEL,
  applySlotToggle,
  slotDefaults,
} from '@/lib/meeting';
import { isSelectableWithoutHost } from '@/lib/location';
import { MEETING_TYPES } from '@/lib/api/types';
import { addDays, today } from '@/lib/date';
import type { MeetingSlotKey, MeetingSlots } from '@/lib/meeting';
import type { MeetingType } from '@/lib/api/types';

export function CreateMeetingSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [date, setDate] = useState(() => addDays(today(), 7));
  const [endDate, setEndDate] = useState('');
  const [type, setType] = useState<MeetingType>('CUSTOM');
  const [title, setTitle] = useState('');
  const [locationId, setLocationId] = useState('');
  const [slots, setSlots] = useState<MeetingSlots>(() =>
    slotDefaults('CUSTOM'),
  );

  const locations = useLocations();
  const create = useCreateMeeting();
  const toast = useToast();

  // Die Art wechseln heißt: von vorn mit dem, was dazugehört. Wer danach noch
  // etwas dazu- oder wegnimmt, behält das — deshalb der eigene Zustand statt
  // einer Ableitung beim Rendern.
  const changeType = (next: MeetingType) => {
    setType(next);
    setSlots(slotDefaults(next));
    if (next !== 'CUSTOM') setEndDate('');
  };

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
        type,
        title: title.trim() === '' ? null : title.trim(),
        locationId: locationId === '' ? null : locationId,
        ...slots,
      },
      {
        onSuccess: () => {
          toast.success('Termin angelegt.');
          setTitle('');
          setEndDate('');
          onClose();
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Neuer Termin">
      <div className="space-y-4">
        <Field label="Art">
          <Select
            value={type}
            onChange={(event) => changeType(event.target.value as MeetingType)}
          >
            {MEETING_TYPES.map((value) => (
              <option key={value} value={value}>
                {MEETING_TYPE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={type === 'CUSTOM' ? 'Von' : 'Datum'}>
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>

        {/* Nur beim besonderen Termin: an einem Hauskreis-Abend wäre ein
            Enddatum kein Zeitraum, sondern ein Tippfehler mit Folgen — die
            Tage dazwischen bleiben für den Terminplaner gesperrt. */}
        {type === 'CUSTOM' && (
          <Field
            label="Bis"
            hint="Optional — für eine Freizeit oder ein Wochenende."
          >
            <TextInput
              type="date"
              value={endDate}
              min={date}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        )}

        <Field
          label="Titel"
          hint="Optional — etwa „Geburtstag von Mira“. Bleibt er leer, steht die Art des Termins da."
        >
          <TextInput
            value={title}
            placeholder="Ohne Titel"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field
          label="Was gehört dazu"
          hint="Lässt sich später jederzeit ändern."
        >
          <SlotToggles slots={slots} onToggle={toggle} />
        </Field>

        {/* Immer da: man trifft sich immer irgendwo, auch bei einem
            Geburtstag. Offen bleiben darf es trotzdem. */}
        <Field
          label="Ort"
          hint="Kann offen bleiben — etwa für ein Treffen draußen. Wohnungen ergeben sich aus dem Gastgeber."
        >
          <Select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Noch offen</option>
            {/* Nur Treffpunkte: eine Wohnung folgt ihrem Gastgeber, und sie
                hier zu wählen hätte der Server ohnehin abgelehnt. */}
            {(locations.data ?? [])
              .filter((location) => isSelectableWithoutHost(location))
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
          </Select>
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
