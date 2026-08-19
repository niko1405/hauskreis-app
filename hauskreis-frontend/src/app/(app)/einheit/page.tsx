'use client';

/**
 * Eine einzelne Einheit — `/einheit?id=<uuid>`.
 *
 * Die Id steht in der Query und nicht im Pfad, aus demselben Grund wie bei
 * `app/(app)/thema/page.tsx`: Beim statischen Export verlangt ein `[id]` eine
 * zur Bauzeit bekannte Liste aller Adressen, und Einheiten entstehen im
 * Betrieb.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { SessionDetailScreen } from '@/features/archive/session-detail-screen';

function Detail() {
  const router = useRouter();
  const id = useSearchParams().get('id');

  if (!id) {
    return (
      <div className="px-5 pt-6">
        <ErrorState error={new Error('Einheit nicht gefunden')} />
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push('/archiv')}
        >
          Zurück zum Archiv
        </Button>
      </div>
    );
  }

  return <SessionDetailScreen sessionId={id} />;
}

export default function EinheitPage() {
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
