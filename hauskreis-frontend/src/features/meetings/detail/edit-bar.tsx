'use client';

/**
 * Der Balken unten an einem vergangenen Termin: „Bearbeiten" oder „Fertig".
 *
 * **Warum ein vergangener Abend einen Modus hat und ein kommender nicht.** Am
 * kommenden Abend wird geplant, und jede Möglichkeit steht dort, wo man sie
 * braucht — ein Modus wäre ein Ort mehr, den man erst kennen muss. Am
 * vergangenen ist es umgekehrt: Man kommt zum **Nachlesen** her, meistens aus
 * dem Archiv, und Stifte an jeder Rolle, ein Maps-Knopf und zwölf
 * Liedvorschläge sind dort Bedienelemente für eine Frage, die sich nicht mehr
 * stellt. Bearbeiten ist hier der Ausnahmefall, wie auf der Themenseite — und
 * der bekommt einen bewussten Schritt.
 *
 * Er ersetzt die Tab-Leiste wie der Antwort-Balken und aus demselben Grund
 * über `BottomSlot`. Ein Knopf, der in beide Richtungen schaltet: Wer fertig
 * nachgetragen hat, will die Seite wieder so sehen, wie die anderen sie sehen.
 */
import { Check, Pencil } from 'lucide-react';
import { BottomSlot } from '@/components/layout/bottom-slot';
import { Button } from '@/components/ui/button';

export function EditBar({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <BottomSlot>
      <div className="pb-safe sticky bottom-0 z-30 border-t border-line bg-canvas/95 px-5 pt-3 backdrop-blur">
        <Button
          variant={editing ? 'primary' : 'secondary'}
          className="mb-3 w-full"
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
    </BottomSlot>
  );
}
