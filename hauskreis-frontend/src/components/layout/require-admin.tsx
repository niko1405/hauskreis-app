'use client';

/**
 * Blendet Admin-Bereiche aus. Die Durchsetzung bleibt beim Server — hier geht
 * es nur darum, niemandem Knöpfe zu zeigen, die ohnehin `403` ergeben.
 */
import { useMe } from '@/lib/api/hooks';
import { CardSkeleton, EmptyState } from '@/components/ui/states';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const me = useMe();

  if (me.isLoading) return <CardSkeleton />;

  if (!me.isAdmin) {
    return (
      <div className="px-5 pt-6">
        <EmptyState
          title="Nur für Admins"
          hint="Dieser Bereich ist denen vorbehalten, die den Hauskreis verwalten."
        />
      </div>
    );
  }

  return <>{children}</>;
}
