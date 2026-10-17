'use client';

/**
 * „Euer Hauskreis" — Bild, Beschreibung, Ideen, Mitglieder.
 *
 * **Warum es diesen Bildschirm gibt.** Die Gruppe hatte keinen Ort. Ihr Name
 * stand als Untertitel im Profil, die Mitgliederliste als achte Karte darunter
 * — auf einem Bildschirm, der von *dir* handelt. Ein sechstes Ziel in der
 * Leiste unten machte sie eng, also führt der Weg über die Pille in der
 * Kopfleiste (`smart-header.tsx`).
 *
 * **Kein Kopfbild und keine Kopfleiste**, sondern ein Zurück-Pfeil wie auf den
 * Detailseiten: Hier ist man *in* etwas drin. Die Leiste darüber wäre die
 * zweite Navigationsebene an derselben Stelle.
 *
 * **Ändern darf jede:r** — Bild, Name, Beschreibung. Wie beim Kopfbild: Bei
 * neun Leuten ist die Selbstbeschreibung keine Verwaltungsangelegenheit.
 *
 * **Ein Knopf für beides, oben rechts.** Name und Beschreibung sind zwei
 * Felder derselben Sache — wer ihr seid —, also ein Knopf, ein Sheet und
 * **ein** Schreibvorgang; zwei getrennte Schreiber auf dieselbe Zeile wären
 * zwei Gelegenheiten für einen Versionskonflikt. Er stand einmal als Wort am
 * Fuß der Beschreibung und machte die Karte dort zum Formular; jetzt steht er
 * dort, wo auf den anderen Unterseiten das Bearbeiten steht, und die Seite
 * bleibt zum Lesen.
 */
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { BackButton } from '@/components/layout/back-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useHauskreisDetail, useUpdateHauskreis } from '@/lib/api/hooks';
import { GroupPhotoPicker } from './group-photo-picker';
import { IdeasCard } from './ideas-card';
import { MembersCard } from './members-card';
import type { Hauskreis } from '@/lib/api/types';

export function GroupScreen() {
  const detail = useHauskreisDetail();
  const update = useUpdateHauskreis();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const hauskreis = detail.data?.data;

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      {/* Zurück, wohin man kam — und nicht auf eine feste Seite.
          Die anderen Detailseiten verweisen auf ihre Liste, weil sie eine
          haben. Hierher führt die Pille aus der Kopfleiste, und die steht über
          allen fünf Tabs: Ein festes `/profil` schickte jemanden, der von
          „Heute" kam, woanders hin als dorthin, wo er war. */}
      <div className="flex items-center justify-between gap-2">
        <BackButton fallback="/" />
        {hauskreis && (
          <Button
            variant="secondary"
            size="sm"
            disabled={update.isPending}
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} /> Bearbeiten
          </Button>
        )}
      </div>

      {update.conflict && <ConflictBanner onResolve={update.resolveConflict} />}

      {detail.isLoading && <CardSkeleton />}

      {!detail.isLoading && !hauskreis && (
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      )}

      {hauskreis && (
        <>
          <Identity hauskreis={hauskreis} />

          <IdeasCard />

          <MembersCard />

          {/* Der Schlüssel wirft den Entwurf weg, sobald von außen eine neue
              Fassung kommt — sonst stünde nach dem Speichern der eigene Text
              beim nächsten Öffnen wieder da. */}
          <GroupEditSheet
            key={hauskreis.version}
            open={editing}
            hauskreis={hauskreis}
            saving={update.isPending}
            onClose={() => setEditing(false)}
            onSave={(input) =>
              update.mutate(input, {
                onSuccess: () => {
                  setEditing(false);
                  toast.success('Gespeichert.');
                },
              })
            }
          />
        </>
      )}
    </div>
  );
}

/** Bild, Name, Beschreibung — zum Lesen. */
function Identity({ hauskreis }: { hauskreis: Hauskreis }) {
  return (
    <>
      {/* Bild und Name mittig übereinander statt nebeneinander: Das ist
          kein Listeneintrag, sondern die Titelseite der Gruppe. */}
      <header className="flex flex-col items-center gap-4 text-center">
        <GroupPhotoPicker hasPhoto={hauskreis.photoUpdatedAt !== null} />
        <h1 className="w-full font-serif text-2xl font-bold text-stone-800">
          {hauskreis.name}
        </h1>
      </header>

      <Card>
        <p
          className={cn(
            'text-sm leading-relaxed whitespace-pre-line',
            hauskreis.description ? 'text-stone-700' : 'text-stone-400 italic',
          )}
        >
          {hauskreis.description ?? 'Noch nichts geschrieben — wer seid ihr?'}
        </p>
      </Card>
    </>
  );
}

/** Name und Beschreibung in einem Sheet — ein Speichern für beides. */
function GroupEditSheet({
  open,
  hauskreis,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  hauskreis: Hauskreis;
  saving: boolean;
  onClose: () => void;
  onSave: (input: { name: string; description: string | null }) => void;
}) {
  const [name, setName] = useState(hauskreis.name);
  const [description, setDescription] = useState(hauskreis.description ?? '');

  const close = () => {
    setName(hauskreis.name);
    setDescription(hauskreis.description ?? '');
    onClose();
  };

  const speichern = () => {
    const trimmed = name.trim();
    const text = description.trim();
    onSave({
      // Leer heißt „unverändert": Einen Hauskreis ohne Namen gibt es nicht,
      // bei der Beschreibung ist Leeren dagegen eine Aussage — `null` löscht,
      // und der Server unterscheidet das von „nicht mitgeschickt".
      name: trimmed === '' ? hauskreis.name : trimmed,
      description: text === '' ? null : text,
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Euer Hauskreis"
      subtitle="Name und Beschreibung sehen alle in der Gruppe."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={close}>
            Abbrechen
          </Button>
          <Button className="flex-1" loading={saving} onClick={speichern}>
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Über euch">
          <TextArea
            value={description}
            rows={5}
            placeholder="Wir treffen uns dienstags, singen, und einer bereitet ein Thema vor…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
