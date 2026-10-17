import { Suspense } from 'react';
import { CardSkeleton } from '@/components/ui/states';
import { ArchiveScreen } from '@/features/archive/archive-screen';

/**
 * In Suspense, weil das Archiv sein Register aus der Adresse liest
 * (`useSearchParams`) — beim statischen Export verlangt Next dafür eine Hülle.
 */
export default function ArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-5 pt-6">
          <CardSkeleton />
        </div>
      }
    >
      <ArchiveScreen />
    </Suspense>
  );
}
