'use client';

/**
 * „Neu in Acts2" — was mit den letzten Fassungen dazugekommen ist.
 *
 * Der Ort, auf den die Release-Benachrichtigung zeigt, und der einzige, an dem
 * man nachlesen kann, was sich geändert hat. Ohne ihn wäre eine Push-Nachricht
 * „es gibt was Neues" eine Behauptung ohne Beleg.
 *
 * Keine Kopfzeile mit Bild: Man kommt hierher aus einer Benachrichtigung, liest
 * eine Liste und geht wieder. Dasselbe Argument wie bei „Termine".
 */
import { Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { useReleases } from '@/lib/api/hooks';
import { useSeenRelease } from '@/lib/release-storage';
import { formatDayFull } from '@/lib/date';

export function ReleasesScreen() {
  const releases = useReleases();
  const { markSeen } = useSeenRelease();

  const newest = releases.data?.[0];

  // Wer hier war, hat es gesehen — der Hinweis auf „Heute" verschwindet damit
  // von selbst. Ein „Gelesen"-Knopf wäre eine Arbeit für etwas, das das Lesen
  // schon beantwortet hat.
  useEffect(() => {
    if (newest) markSeen(newest.version);
  }, [newest, markSeen]);

  return (
    <div>
      <PageHeader
        title="Neu in Acts2"
        subtitle="Was zuletzt dazugekommen ist"
      />

      <div className="space-y-4 px-5">
        {releases.isLoading && <CardSkeleton />}

        {releases.error && (
          <ErrorState
            error={releases.error}
            onRetry={() => void releases.refetch()}
          />
        )}

        {(releases.data ?? []).map((release, index) => (
          <Card key={release.version} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-xl leading-tight font-bold text-stone-900">
                  {release.title}
                </p>
                <p className="mt-1 text-[11px] text-stone-400">
                  Version {release.version} · {formatDayFull(release.date)}
                </p>
              </div>
              {/* Nur am obersten: Was danach kommt, ist Geschichte. */}
              {index === 0 && (
                <Sparkles
                  size={16}
                  className="mt-1 shrink-0 text-terracotta-500"
                  aria-hidden
                />
              )}
            </div>

            <ul className="space-y-2">
              {release.highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex gap-2.5 text-sm leading-relaxed text-stone-600"
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-terracotta-400"
                    aria-hidden
                  />
                  {highlight}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
