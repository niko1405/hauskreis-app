'use client';

/**
 * Der Balken unten an einer Seite, auf der Bearbeiten der Ausnahmefall ist:
 * „Bearbeiten" oder „Fertig". Am vergangenen Termin und auf der Seite eines
 * Lieds.
 *
 * **Warum ein vergangener Abend einen Modus hat und ein kommender nicht.** Am
 * kommenden Abend wird geplant, und jede Möglichkeit steht dort, wo man sie
 * braucht — ein Modus wäre ein Ort mehr, den man erst kennen muss. Am
 * vergangenen ist es umgekehrt: Man kommt zum **Nachlesen** her, meistens aus
 * dem Archiv, und Stifte an jeder Rolle, ein Maps-Knopf und zwölf
 * Liedvorschläge sind dort Bedienelemente für eine Frage, die sich nicht mehr
 * stellt. Bearbeiten ist hier der Ausnahmefall, wie auf der Themenseite — und
 * der bekommt einen bewussten Schritt. Auf der Liedseite gilt dasselbe: Man
 * kommt, um den Text zu lesen.
 *
 * Er ersetzt die Tab-Leiste wie der Antwort-Balken und aus demselben Grund
 * über `BottomSlot`. Ein Knopf, der in beide Richtungen schaltet: Wer fertig
 * ist, will die Seite wieder so sehen, wie die anderen sie sehen. Daneben darf
 * eine Seite einen zweiten Knopf stellen (`aside`) — die Liedseite das
 * „Entfernen" vom Termin, das man ohne Bearbeitungsmodus erreicht.
 */
import { Check, Pencil } from 'lucide-react';
import { BottomSlot } from '@/components/layout/bottom-slot';
import { Button } from '@/components/ui/button';

export function EditBar({
  editing,
  onToggle,
  aside,
  busy = false,
}: {
  editing: boolean;
  onToggle: () => void;
  /** „Fertig" speichert gerade — etwa an einer Notiz, wo es das Speichern ist. */
  busy?: boolean;
  /** Ein Knopf links neben „Bearbeiten" — nur, solange nicht bearbeitet wird. */
  aside?: React.ReactNode;
}) {
  return (
    <BottomSlot>
      <div className="pb-safe sticky bottom-0 z-30 border-t border-line bg-canvas/95 px-5 pt-3 backdrop-blur">
        {/* `pb-3` und nicht `mb-3`: Der Außenabstand eines Kastens fiele
            unten durch den Balken hindurch — der hat am Rechner keinen
            eigenen Abstand, `pb-safe` ist dort null —, und in dem Streifen
            darunter schiene die Seite durch. */}
        <div className="flex gap-2 pb-3">
          {!editing && aside}
          <Button
            variant={editing ? 'primary' : 'secondary'}
            className="flex-1"
            loading={busy}
            onClick={onToggle}
          >
            {editing ? (
              <>
                <Check size={16} /> Fertig
              </>
            ) : (
              <>
                <Pencil size={15} /> Bearbeiten
              </>
            )}
          </Button>
        </div>
      </div>
    </BottomSlot>
  );
}
