'use client';

/**
 * Einen Termin von Hand anlegen — in der Regel ein „Custom"-Termin
 * („Geburtstag von …"). Die Standard- und Lobpreis-Termine legt das Backend
 * selbst an, damit immer mindestens sieben im Voraus zuteilbar sind.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useCreateMeeting, useLocations } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/errors';
import { MEETING_TYPE_LABEL } from '@/lib/meeting';
import { MEETING_TYPES } from '@/lib/api/types';
import { addDays, today } from '@/lib/date';
import type { MeetingType } from '@/lib/api/types';

export function CreateMeetingSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [date, setDate] = useState(() => addDays(today(), 7));
  const [type, setType] = useState<MeetingType>('CUSTOM');
  const [title, setTitle] = useState('');
  const [locationId, setLocationId] = useState('');

  const locations = useLocations();
  const create = useCreateMeeting();
  const toast = useToast();

  const submit = () => {
    create.mutate(
      {
        date,
        type,
        title: title.trim() === '' ? null : title.trim(),
        locationId: locationId === '' ? null : locationId,
      },
      {
        onSuccess: () => {
          toast.success('Termin angelegt.');
          setTitle('');
          onClose();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Neuer Termin">
      <div className="space-y-4">
        <Field label="Datum">
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>

        <Field label="Art">
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as MeetingType)}
          >
            {MEETING_TYPES.map((value) => (
              <option key={value} value={value}>
                {MEETING_TYPE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

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
          label="Ort"
          hint="Kann offen bleiben — etwa für ein Treffen draußen."
        >
          <Select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Noch offen</option>
            {(locations.data ?? []).map((location) => (
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
