'use client';

/**
 * Die Nachbereitung eines Abends **ohne** Thema.
 *
 * Zusammenfassung und Actionstep hingen lange ausschließlich an der Einheit
 * eines Themas. Ein Abend, an dem die Gruppe nur singt und betet, hatte damit
 * keinen Ort für den Vorsatz der Woche — obwohl der dort genauso entsteht.
 *
 * Bewusst im selben Aufbau wie der Einheiten-Kasten in `topic-card.tsx`: es ist
 * dieselbe Sache, nur ohne einen Stoff darüber, der sich über mehrere Abende
 * zieht. Zwei verschiedene Formen für zweimal „was war, und was nehmen wir uns
 * vor" wären eine Unterscheidung ohne Unterschied.
 *
 * **Sie kommt und geht mit dem Abend.** Anders als Thema, Lieder und Testimony
 * steht sie nicht im Bausteinkasten: dort hätte man sie vorher angehakt, also zu
 * einem Zeitpunkt, an dem es nichts nachzubereiten gibt. Stattdessen erscheint
 * ab Terminbeginn ein Hinweis (`NotesPrompt`), ein Klick legt die Karte an, und
 * im Bearbeitungsmodus lässt sie sich wieder ganz entfernen — danach ist der
 * Hinweis zurück, als wäre nichts gewesen.
 *
 * **Anders als beim Thema wird hier nichts zurückgehalten.** Der Inhalt einer
 * Einheit gehört bis zum Abendbeginn denen, die ihn vorbereiten — an der
 * Nachbereitung hängt aber niemand, sie entsteht während oder nach dem Abend.
 * Es gibt also niemanden, dem man sie vorenthalten würde. Nur der **Haken** hat
 * seine Uhrzeit: einen Vorsatz für heute Abend hakt man nicht heute früh ab.
 *
 * **Zusammenfassung und Actionstep sind zwei getrennte Stücke**, und jedes steht
 * nur da, wenn etwas drinsteht. Vorher standen beide immer, auch leer — eine
 * Karte, die man gerade erst angelegt hatte, sah damit aus wie ein Formular mit
 * zwei unerledigten Zeilen. Nicht jeder Abend braucht beides: manchmal gibt es
 * nur einen Vorsatz und nichts zusammenzufassen. Im Bearbeitungsmodus legt ein
 * Knopf das fehlende Stück an; bleibt es leer, verschwindet es wieder.
 */
import { NotebookPen, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { FieldLabel, InlineEdit } from '@/components/ui/field';
import { ActionstepCheck } from '@/components/domain/actionstep-check';
import type { Meeting } from '@/lib/api/types';

/**
 * Der Weg zur Nachbereitung — ab Terminbeginn, an einem Abend ohne Thema.
 *
 * Bewusst ein Hinweis und keine Karte, die von selbst dasteht: **nicht jeder
 * Abend braucht eine Nachbereitung.** Eine leere Karte an jedem Termin wäre eine
 * Aufforderung, der man meistens nicht nachkommt, und neun ungefüllte Felder im
 * Archiv sähen aus wie neun vergessene Aufgaben.
 *
 * Gestrichelt und ruhig wie die leere Actionstep-Karte auf dem Startbildschirm:
 * ein Angebot, kein offener Posten.
 */
export function NotesPrompt({
  saving,
  onAdd,
}: {
  saving: boolean;
  onAdd: () => void;
}) {
  return (
    <Card className="border-dashed bg-transparent shadow-none">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas text-stone-300">
          <NotebookPen size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-700">
            Nachbereitung hinzufügen?
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-stone-400">
            Für eine Zusammenfassung des Abends und einen Actionstep für die
            Woche.
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={saving} onClick={onAdd}>
          Hinzufügen
        </Button>
      </div>
    </Card>
  );
}

/**
 * Die Karte selbst. Sie steht nie leer da: der Bildschirm zeigt sie nur, wenn
 * etwas geschrieben ist **oder** gerade bearbeitet wird — sonst den Hinweis.
 */
export function NotesCard({
  meeting,
  /** Ob jetzt gerade geschrieben werden darf — der Bearbeitungsmodus. */
  editable,
  /** Ob der Abend schon angefangen hat. Entscheidet über den Abhak-Block. */
  started,
  saving,
  onSummary,
  onActionstep,
  /** Fehlt außerhalb des Bearbeitungsmodus — dort gibt es nichts zu löschen. */
  onRemove,
}: {
  meeting: Meeting;
  editable: boolean;
  started: boolean;
  saving: boolean;
  onSummary: (next: string | null) => void;
  onActionstep: (next: string | null) => void;
  onRemove?: () => void;
}) {
  /**
   * Ein Stück, das es am Termin noch gar nicht gibt und das gerade geschrieben
   * wird. Nur hier, nicht am Server: ein leeres Feld ist nichts, was man
   * speichert — es ist ein Feld, das noch nichts ist.
   */
  const [addingSummary, setAddingSummary] = useState(false);
  const [addingActionstep, setAddingActionstep] = useState(false);

  // Der Bearbeitungsmodus zählt mit: wer ihn verlässt, während ein frisch
  // angelegtes Feld noch leer ist, soll es nicht als leere Zeile zurücklassen.
  const showSummary =
    Boolean(meeting.summaryText) || (editable && addingSummary);
  const showActionstep =
    Boolean(meeting.actionstepText) || (editable && addingActionstep);

  return (
    <section>
      <SectionTitle>Nachbereitung</SectionTitle>
      <Card className="space-y-3">
        {showSummary ? (
          <div>
            <FieldLabel>Zusammenfassung</FieldLabel>
            <InlineEdit
              label="Zusammenfassung"
              multiline
              value={meeting.summaryText}
              // Zu sehen nur, solange gespeichert wird: sonst steht dieses Feld
              // gar nicht erst da, wenn nichts drinsteht.
              emptyLabel="Noch nichts festgehalten"
              placeholder="Worum ging es an dem Abend?"
              startOpen={addingSummary}
              onDiscard={() => setAddingSummary(false)}
              saving={saving}
              onSave={editable ? onSummary : undefined}
            />
          </div>
        ) : (
          editable && (
            <AddPart saving={saving} onClick={() => setAddingSummary(true)}>
              Zusammenfassung hinzufügen
            </AddPart>
          )
        )}

        {showActionstep ? (
          <div className="rounded-lg border border-line-strong bg-canvas p-3">
            <FieldLabel>Actionstep</FieldLabel>
            <InlineEdit
              label="Actionstep"
              value={meeting.actionstepText}
              emptyLabel="Noch kein Actionstep"
              placeholder="Was nehmen wir uns für die Woche vor?"
              startOpen={addingActionstep}
              onDiscard={() => setAddingActionstep(false)}
              saving={saving}
              onSave={editable ? onActionstep : undefined}
            />

            {/* Abhaken darf jede:r für sich, auch wer den Text nicht ändern darf
                — es ist der eigene Vorsatz. */}
            {meeting.actionstepText && started && (
              <ActionstepCheck
                meetingId={meeting.id}
                done={meeting.actionstepDone}
              />
            )}
          </div>
        ) : (
          editable && (
            <AddPart saving={saving} onClick={() => setAddingActionstep(true)}>
              Actionstep hinzufügen
            </AddPart>
          )
        )}

        {/* Zurückhaltend und ganz unten: die ganze Sektion wieder wegnehmen ist
            keine Bearbeitung, sondern eine Entscheidung über den Abend. Danach
            steht wieder der Hinweis da, als wäre nichts gewesen. */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-stone-400 transition-colors hover:text-alert disabled:opacity-50"
          >
            <Trash2 size={12} />
            Nachbereitung entfernen
          </button>
        )}
      </Card>
    </section>
  );
}

/**
 * Der Knopf für ein Stück, das noch fehlt — gestrichelt wie der Hinweis, aus
 * dem die ganze Karte kommt. Er legt kein leeres Feld an, sondern öffnet gleich
 * das Eingabefeld: was danach dasteht, hat Inhalt oder ist wieder weg.
 */
function AddPart({
  saving,
  onClick,
  children,
}: {
  saving: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] font-semibold text-stone-400 transition-colors hover:border-terracotta-400 hover:text-terracotta-600 disabled:opacity-50"
    >
      <Plus size={14} />
      {children}
    </button>
  );
}
