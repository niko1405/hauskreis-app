'use client';

/**
 * Ein Lied — `/lied?id=<uuid>`, vom Termin aus mit `&termin=<uuid>`.
 *
 * Die Id steht in der Query und nicht im Pfad, aus demselben Grund wie bei
 * `app/(app)/einheit/page.tsx`: Beim statischen Export verlangt ein `[id]` eine
 * zur Bauzeit bekannte Liste aller Adressen, und Lieder entstehen im Betrieb.
 */
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BackButton } from '@/components/layout/back-button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { SongDetailScreen } from '@/features/songs/song-detail-screen';

function Detail() {
  const params = useSearchParams();
  const id = params.get('id');

  if (!id) {
    return (
      <div className="space-y-4 px-5 pt-safe-4">
        <BackButton fallback="/archiv?register=lieder" />
        <ErrorState error={new Error('Lied nicht gefunden')} />
      </div>
    );
  }

  return <SongDetailScreen songId={id} meetingId={params.get('termin')} />;
}

export default function LiedPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-5 pt-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      }
    >
      <Detail />
    </Suspense>
  );
}
