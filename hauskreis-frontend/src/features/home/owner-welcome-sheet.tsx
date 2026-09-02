'use client';

/**
 * Was ein frisch gegründeter Hauskreis als Erstes braucht.
 *
 * **Warum es diesen Hinweis gibt.** Nach dem Gründen steht man vor einem
 * Startbildschirm ohne Termine und ohne Menschen. Der Admin-Bereich, in dem man
 * beides ändert, ist ein Knopf im Profil — zwei Ebenen tief, und nichts sagt,
 * dass es ihn gibt. Das war der einzige Moment in der App, in dem sie einem
 * etwas schuldig blieb.
 *
 * Zwei Wege heraus und keiner mehr: einladen und einstellen (die Verwaltung),
 * und den anderen erklären, worum es geht (die Anleitung). Alles Weitere findet
 * man von selbst.
 *
 * Ein `Sheet` und kein eigener Kasten: Es ist die Overlay-Form dieser App, und
 * ein zweites Aussehen für dieselbe Sache wäre eines zu viel.
 */
import { FileText, Shield } from 'lucide-react';
import Link from '@/components/ui/link';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { useOwnerWelcome } from '@/lib/owner-welcome';

export function OwnerWelcomeSheet() {
  const { open, dismiss } = useOwnerWelcome();
  const { hauskreis } = useHauskreis();

  return (
    <Sheet
      open={open}
      onClose={dismiss}
      title={`„${hauskreis?.name ?? 'Euer Hauskreis'}" steht`}
      subtitle="Zwei Dinge, dann läuft es von selbst."
      footer={
        <Button variant="ghost" className="w-full" onClick={dismiss}>
          Später
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-stone-500">
          Die App plant eure Termine ab jetzt selbst — wöchentlich, sieben im
          Voraus. Was sie noch nicht weiß: wer dabei ist und wann ihr euch
          trefft.
        </p>

        <Link href="/admin" onClick={dismiss} className="block">
          <Button variant="secondary" className="w-full">
            <Shield size={14} />
            Leute einladen und einstellen
          </Button>
        </Link>

        <p className="text-sm leading-relaxed text-stone-500">
          Und damit die anderen wissen, was sie erwartet, gibt es eine Anleitung
          zum Ausdrucken oder Weiterschicken.
        </p>

        <Link href="/anleitung" onClick={dismiss} className="block">
          <Button variant="secondary" className="w-full">
            <FileText size={14} />
            Anleitung ansehen
          </Button>
        </Link>
      </div>
    </Sheet>
  );
}
