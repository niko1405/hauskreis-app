'use client';

/**
 * Ein Termin im Detail — `/termin?id=<uuid>`.
 *
 * Die Id steht in der Query und nicht im Pfad, und das hat einen einzigen
 * Grund: Diese App wird als **statischer Export** ausgeliefert
 * (`output: 'export'`, Cloudflare Pages). Ein Pfadsegment `[id]` verlangt dabei
 * `generateStaticParams` — eine Liste aller Adressen, die es geben wird. Die
 * gibt es hier nicht: Termin-Ids sind UUIDs, entstehen im Betrieb und liegen
 * hinter einem Token, das der Bauprozess nicht hat.
 *
 * Der Rest bleibt, wie er war. Die Seite hat nie serverseitig geladen — das
 * Token lebt im Browser —, sie war schon vorher nur eine Hülle um
 * `MeetingDetailScreen`.
 *
 * **`useSearchParams`, nicht `window.location.search`.** Von einem Termin führt
 * ein Link auf einen anderen (die Themen-Karte zeigt auf den vorigen Abend
 * desselben Themas); dabei wechselt die Query, ohne dass die Seite neu montiert
 * wird. Ein einmal ausgelesener Wert bliebe auf der alten Id stehen.
 *
 * Das `<Suspense>` verlangt Next beim statischen Export: `useSearchParams` hat
 * zur Bauzeit noch keine Antwort, also wird der Fallback ins HTML geschrieben
 * und der echte Inhalt nach der Hydration nachgereicht. Ohne die Grenze bricht
 * der Build ab.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { MeetingDetailScreen } from '@/features/meetings/detail/meeting-detail-screen';

function Detail() {
  const router = useRouter();
  const id = useSearchParams().get('id');

  // Keine Id in der Adresse heißt: ein kaputter Link, kein Serverfehler. Wir
  // sagen dasselbe wie der Bildschirm bei einer unbekannten Id, statt eine
  // Anfrage nach `undefined` loszuschicken.
  if (!id) {
    return (
      <div className="px-5 pt-6">
        <ErrorState error={new Error('Termin nicht gefunden')} />
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

  return <MeetingDetailScreen meetingId={id} />;
}

export default function TerminPage() {
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
