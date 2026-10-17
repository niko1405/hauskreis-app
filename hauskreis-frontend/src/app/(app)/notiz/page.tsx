'use client';

/**
 * Eine Notiz — `/notiz?id=<uuid>`, frisch angelegt mit `&neu=1`.
 *
 * Warum die Id in der Query steht und nicht im Pfad, steht ausführlich in
 * `app/(app)/termin/page.tsx`: Beim statischen Export verlangt ein `[id]` eine
 * zur Bauzeit bekannte Liste aller Adressen, und Notiz-Ids entstehen im
 * Betrieb.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { NoteDetailScreen } from '@/features/notes/note-detail-screen';

function Detail() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');

  if (!id) {
    return (
      <div className="px-5 pt-6">
        <ErrorState error={new Error('Notiz nicht gefunden')} />
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push('/archiv?register=notizen')}
        >
          Zurück zu den Notizen
        </Button>
      </div>
    );
  }

  // `key`: Eine andere Notiz ist ein anderer Entwurf.
  return (
    <NoteDetailScreen key={id} noteId={id} neu={params.get('neu') === '1'} />
  );
}

export default function NotizPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-5 pt-6">
          <CardSkeleton />
        </div>
      }
    >
      <Detail />
    </Suspense>
  );
}
