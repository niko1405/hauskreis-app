'use client';

/**
 * Ein Thema und seine Einheiten — `/thema?id=<uuid>`.
 *
 * Warum die Id in der Query steht und nicht im Pfad, steht ausführlich in
 * `app/(app)/termin/page.tsx`: Beim statischen Export verlangt ein `[id]` eine
 * zur Bauzeit bekannte Liste aller Adressen, und Themen-Ids entstehen im
 * Betrieb.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { TopicDetailScreen } from '@/features/archive/topic-detail-screen';

function Detail() {
  const router = useRouter();
  const id = useSearchParams().get('id');

  if (!id) {
    return (
      <div className="px-5 pt-6">
        <ErrorState error={new Error('Thema nicht gefunden')} />
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

  return <TopicDetailScreen topicId={id} />;
}

export default function ThemaPage() {
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
