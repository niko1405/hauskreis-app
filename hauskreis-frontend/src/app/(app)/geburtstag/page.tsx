'use client';

/**
 * Ein Geburtstag mit seinen Geschenk-Vorschlägen — `/geburtstag?id=<uuid>`.
 *
 * Warum die Id in der Query steht und nicht im Pfad, steht ausführlich in
 * `app/(app)/termin/page.tsx`: Beim statischen Export verlangt ein `[id]` eine
 * zur Bauzeit bekannte Liste aller Adressen, und diese Kennungen entstehen im
 * Betrieb.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { BirthdayDetailScreen } from '@/features/birthdays/birthday-detail-screen';

function Detail() {
  const router = useRouter();
  const id = useSearchParams().get('id');

  if (!id) {
    return (
      <div className="px-5 pt-safe-6">
        <ErrorState error={new Error('Geburtstag nicht gefunden')} />
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push('/termine')}
        >
          Zurück zu den Terminen
        </Button>
      </div>
    );
  }

  return <BirthdayDetailScreen occasionId={id} />;
}

export default function GeburtstagPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-5 pt-safe-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      }
    >
      <Detail />
    </Suspense>
  );
}
