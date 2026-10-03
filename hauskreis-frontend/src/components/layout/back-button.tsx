'use client';

/**
 * Der Zurück-Pfeil der Unterseiten — Präferenzen, Konto, Hilfe, „Was ist neu",
 * Verwaltung, Gruppe, Anleitung.
 *
 * **Zurück, wohin man kam**, und nicht auf eine feste Seite. Die Detailseiten
 * verweisen auf ihre Liste, weil sie eine haben; hier führen mehrere Wege
 * herein (das Profil, die Kopfleiste, ein Banner auf „Heute"), und ein festes
 * Ziel schickte jemanden woandershin als dorthin, wo er war.
 *
 * **`fallback` für den Fall ohne Vorgeschichte.** Führt eine Push-Nachricht
 * direkt auf `/neu`, gibt es kein „zurück" innerhalb der App — `router.back()`
 * verließe sie. Dann geht es dorthin, wo die Seite sonst herkommt.
 *
 * **Er fragt wie jeder Link**, wenn etwas ungespeichert ist (`link.tsx`). Ein
 * Knopf am oberen Rand, der als einziger Weg hinaus still verwirft, wäre genau
 * die Lücke, die der Link geschlossen hat.
 */
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useHasUnsaved } from '@/components/ui/unsaved';

export function BackButton({
  fallback,
  className,
}: {
  fallback: string;
  className?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const blocked = useHasUnsaved();

  const go = () => {
    // `1` heißt: Diese Seite ist der erste Eintrag des Tabs.
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };

  const onClick = async () => {
    if (blocked) {
      const ok = await confirm({
        title: 'Ungespeicherte Änderungen',
        body: 'Du hast etwas geändert und noch nicht gespeichert. Wenn du weitergehst, ist es weg.',
        confirmLabel: 'Verwerfen',
        cancelLabel: 'Hierbleiben',
        tone: 'danger',
      });
      if (!ok) return;
    }
    go();
  };

  return (
    <IconButton
      label="Zurück"
      onClick={() => void onClick()}
      className={className}
    >
      <ArrowLeft size={18} />
    </IconButton>
  );
}
