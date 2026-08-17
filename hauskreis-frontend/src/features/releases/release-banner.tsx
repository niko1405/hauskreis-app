'use client';

/**
 * „Es gibt was Neues" — auf „Heute", bis man es einmal angesehen hat.
 *
 * Der Weg für alle, die Push aus haben oder nie eingeschaltet haben; bei neun
 * Leuten sind das schnell drei. Ohne ihn hinge die Ankündigung allein an einer
 * Benachrichtigung, die man nicht bekommt.
 *
 * Wegklicken merkt sich das Gerät, nicht das Konto ([[release-storage]]) — und
 * das Öffnen der Seite zählt als gesehen. Ein „Verstanden"-Knopf wäre Arbeit
 * für etwas, das das Lesen schon beantwortet.
 */
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useReleases } from '@/lib/api/hooks';
import { useSeenRelease } from '@/lib/release-storage';

export function ReleaseBanner() {
  const releases = useReleases();
  const { seen, markSeen } = useSeenRelease();

  const newest = releases.data?.[0];

  // `seen === null` heißt entweder „noch nie etwas gesehen" oder „wird gerade
  // serverseitig gerendert". Beide Male ist Zeigen richtig: Beim allerersten
  // Start ist ja tatsächlich alles neu.
  if (!newest || seen === newest.version) return null;

  return (
    <div className="rounded-card border border-terracotta-400 bg-terracotta-50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-terracotta-700">
        <Sparkles size={15} className="shrink-0" />
        Es gibt was Neues
      </p>
      <p className="mt-1 text-xs leading-relaxed text-terracotta-700/80">
        {newest.title}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href="/neu">
          <Button size="sm">
            Ansehen
            <ArrowRight size={13} />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => markSeen(newest.version)}
        >
          Später
        </Button>
      </div>
    </div>
  );
}
