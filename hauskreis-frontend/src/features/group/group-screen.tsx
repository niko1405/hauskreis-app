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
 */
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineEdit } from '@/components/ui/field';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useHauskreisDetail, useUpdateHauskreis } from '@/lib/api/hooks';
import { GroupPhotoPicker } from './group-photo-picker';
import { IdeasCard } from './ideas-card';
import { MembersCard } from './members-card';

export function GroupScreen() {
  const detail = useHauskreisDetail();
  const update = useUpdateHauskreis();
  const toast = useToast();
  const router = useRouter();

  const hauskreis = detail.data?.data;

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      {/* Zurück, wohin man kam — und nicht auf eine feste Seite.
          Die anderen Detailseiten verweisen auf ihre Liste, weil sie eine
          haben. Hierher führt die Pille aus der Kopfleiste, und die steht über
          allen fünf Tabs: Ein festes `/profil` schickte jemanden, der von
          „Heute" kam, woanders hin als dorthin, wo er war. */}
      <IconButton label="Zurück" onClick={() => router.back()}>
        <ArrowLeft size={18} />
      </IconButton>

      {detail.isLoading && <CardSkeleton />}

      {!detail.isLoading && !hauskreis && (
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      )}

      {hauskreis && (
        <>
          {update.conflict && (
            <ConflictBanner onResolve={update.resolveConflict} />
          )}

          {/* Bild und Name mittig übereinander statt nebeneinander: Das ist
              kein Listeneintrag, sondern die Titelseite der Gruppe. */}
          <header className="flex flex-col items-center gap-4 text-center">
            <GroupPhotoPicker hasPhoto={hauskreis.photoUpdatedAt !== null} />

            <div className="w-full">
              <InlineEdit
                label="Name"
                value={hauskreis.name}
                saving={update.isPending}
                className="justify-center text-center text-2xl font-bold"
                inputClassName="text-center text-2xl font-bold py-1.5" // <-- NEU
                onSave={(next) => {
                  if (!next || next.trim() === '') return;
                  update.mutate(
                    { name: next.trim() },
                    { onSuccess: () => toast.success('Gespeichert.') },
                  );
                }}
              />
            </div>
          </header>

          <Card>
            <InlineEdit
              label="Über euch"
              editLabel="Bearbeiten"
              multiline
              value={hauskreis.description}
              emptyLabel="Noch nichts geschrieben — wer seid ihr?"
              placeholder="Wir treffen uns dienstags, singen, und einer bereitet ein Thema vor…"
              saving={update.isPending}
              onSave={(next) =>
                update.mutate(
                  // `null` löscht, ein Text ersetzt. Der Server unterscheidet
                  // beides von „nicht mitgeschickt".
                  { description: next === '' ? null : next },
                  { onSuccess: () => toast.success('Gespeichert.') },
                )
              }
            />
          </Card>

          <IdeasCard />

          <MembersCard />
        </>
      )}
    </div>
  );
}
