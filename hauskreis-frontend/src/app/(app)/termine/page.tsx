'use client';

/**
 * Die Termine — Liste, Planung, Kalender, Geburtstage.
 *
 * Das `<Suspense>` verlangt Next beim statischen Export: `MeetingsScreen` liest
 * das gewünschte Register aus der Adresse (`?tab=`), und `useSearchParams` hat
 * zur Bauzeit noch keine Antwort. Ohne die Grenze bricht der Build ab. Derselbe
 * Aufbau wie bei `app/(app)/termin/page.tsx`.
 */
import { Suspense } from 'react';
import { CardSkeleton } from '@/components/ui/states';
import { MeetingsScreen } from '@/features/meetings/meetings-screen';

export default function MeetingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-5 pt-safe-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      }
    >
      <MeetingsScreen />
    </Suspense>
  );
}
