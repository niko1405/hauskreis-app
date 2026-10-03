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
 * **Ein Knopf für beides.** Name und Beschreibung hatten je einen eigenen Weg
 * hinein — oben ein Stift am Namen, unten ein „Bearbeiten" unter dem Text. Es
 * sind aber zwei Felder derselben Sache: wer ihr seid. Also ein Zustand, ein
 * Knopf und **ein** Schreibvorgang; zwei getrennte Schreiber auf dieselbe Zeile
 * wären zwei Gelegenheiten für einen Versionskonflikt.
 *
 * Der Knopf steht am Fuß der Beschreibung und nicht neben dem Namen: Dort ist
 * man beim Lesen angekommen, und er meint ohnehin beides.
 */
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/layout/back-button';
import { IconButton, PRESSABLE } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldLabel, TextArea, TextInput } from '@/components/ui/field';
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

  const hauskreis = detail.data?.data;

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      {/* Zurück, wohin man kam — und nicht auf eine feste Seite.
          Die anderen Detailseiten verweisen auf ihre Liste, weil sie eine
          haben. Hierher führt die Pille aus der Kopfleiste, und die steht über
          allen fünf Tabs: Ein festes `/profil` schickte jemanden, der von
          „Heute" kam, woanders hin als dorthin, wo er war. */}
      <BackButton fallback="/" />

      {detail.isLoading && <CardSkeleton />}

      {!detail.isLoading && !hauskreis && (
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      )}

      {hauskreis && (
        <>
          {/* Der Schlüssel wirft den Entwurf weg, sobald von außen eine neue
              Fassung kommt — sonst stünde nach dem Speichern der eigene Text
              noch im Zustand und beim nächsten Öffnen wieder da. */}
          <Identity key={hauskreis.version} hauskreis={hauskreis} />

          <IdeasCard />

          <MembersCard />
        </>
      )}
    </div>
  );
}

/** Bild, Name, Beschreibung — und der eine Knopf, der die letzten beiden öffnet. */
function Identity({ hauskreis }: { hauskreis: Hauskreis }) {
  const update = useUpdateHauskreis();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(hauskreis.name);
  const [description, setDescription] = useState(hauskreis.description ?? '');

  // Ohne das müsste man nach „Bearbeiten" erst ins Feld tippen. `autoFocus`
  // täte dasselbe, richtet den Fokus aber auch beim allerersten Aufbau der
  // Seite dorthin — für jemanden mit Screenreader mitten in den Inhalt hinein.
  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const verwerfen = () => {
    setName(hauskreis.name);
    setDescription(hauskreis.description ?? '');
    setEditing(false);
  };

  const speichern = () => {
    const trimmed = name.trim();
    const text = description.trim();

    setEditing(false);
    update.mutate(
      {
        // Leer heißt „unverändert": Einen Hauskreis ohne Namen gibt es nicht,
        // bei der Beschreibung ist Leeren dagegen eine Aussage — `null` löscht,
        // und der Server unterscheidet das von „nicht mitgeschickt".
        name: trimmed === '' ? hauskreis.name : trimmed,
        description: text === '' ? null : text,
      },
      { onSuccess: () => toast.success('Gespeichert.') },
    );
  };

  return (
    <>
      {update.conflict && <ConflictBanner onResolve={update.resolveConflict} />}

      {/* Bild und Name mittig übereinander statt nebeneinander: Das ist
          kein Listeneintrag, sondern die Titelseite der Gruppe. */}
      <header className="flex flex-col items-center gap-4 text-center">
        <GroupPhotoPicker hasPhoto={hauskreis.photoUpdatedAt !== null} />

        {editing ? (
          <div className="w-full space-y-1.5 text-left">
            <FieldLabel>Name</FieldLabel>
            <TextInput
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="py-1.5 text-center font-serif text-2xl font-bold"
            />
          </div>
        ) : (
          <h1 className="w-full font-serif text-2xl font-bold text-stone-800">
            {hauskreis.name}
          </h1>
        )}
      </header>

      <Card className="flex flex-col gap-3">
        {editing ? (
          <>
            <div className="space-y-1.5">
              <FieldLabel>Über euch</FieldLabel>
              <TextArea
                value={description}
                placeholder="Wir treffen uns dienstags, singen, und einer bereitet ein Thema vor…"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-1">
              <IconButton label="Verwerfen" onClick={verwerfen}>
                <X size={16} />
              </IconButton>
              <IconButton
                label="Speichern"
                onClick={speichern}
                className="text-terracotta-600"
              >
                <Check size={16} />
              </IconButton>
            </div>
          </>
        ) : (
          <>
            <p
              className={cn(
                'text-sm leading-relaxed whitespace-pre-line',
                hauskreis.description
                  ? 'text-stone-700'
                  : 'text-stone-400 italic',
              )}
            >
              {hauskreis.description ??
                'Noch nichts geschrieben — wer seid ihr?'}
            </p>
            {/* Ein Wort statt eines Bleistifts: Der sitzt oben rechts, also am
                Anfang von etwas, das man erst zu Ende liest. */}
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={update.isPending}
              className={cn(
                'self-end text-xs font-bold text-terracotta-600 disabled:opacity-50',
                PRESSABLE,
              )}
            >
              Bearbeiten
            </button>
          </>
        )}
      </Card>
    </>
  );
}
