/**
 * Was dasteht, solange eine Seite noch nicht da ist.
 *
 * **Die Datei ist der Grund, warum ein Wechsel sofort geschieht.** Ohne sie
 * wartet Next mit dem Umschalten, bis die neue Seite geladen ist — ihr Code
 * und ihre vorbereiteten Daten —, und solange steht die alte da, als hätte
 * der Tipp nichts bewirkt. Mit ihr schaltet Next sofort um, die Tab-Leiste
 * zeigt das neue Ziel, die Seite kommt herein, und was fehlt, lädt dort nach.
 * Meistens sieht man sie gar nicht: Was in Sichtweite verlinkt ist, hat Next
 * schon vorgeladen.
 *
 * Erst nach einem Augenblick sichtbar (`animation-delay`): Ein Gerüst, das für
 * ein Zehntel aufblitzt, wirkt unruhiger als ein leerer Moment. Hoch wie der
 * Bildschirm, damit eine hereingleitende Seite keine halbe ist.
 */
import { CardSkeleton, Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Wird geladen"
      className="min-h-dvh animate-[fade-in_240ms_ease-out_160ms_backwards] space-y-4 px-5 pt-[calc(var(--safe-top)+1rem)]"
    >
      <Skeleton className="h-8 w-1/2" />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
