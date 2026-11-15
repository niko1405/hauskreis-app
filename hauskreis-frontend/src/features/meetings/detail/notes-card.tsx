'use client';

/**
 * Die Nachbereitung eines Abends **ohne** Thema.
 *
 * Ein Abend, an dem die Gruppe nur singt und betet, hat keine Einheit — der
 * Vorsatz der Woche entsteht dort aber genauso. Zusammenfassung und Actionstep
 * sehen deshalb aus wie an einer Einheit: der Actionstep hervorgehoben, mit dem
 * eigenen Haken (`ActionstepFeature`).
 *
 * **Sie kommt und geht mit dem Abend.** Anders als Thema, Lieder und Testimony
 * steht sie nicht im Bausteinkasten: dort hätte man sie vorher angehakt, also zu
 * einem Zeitpunkt, an dem es nichts nachzubereiten gibt. Stattdessen erscheint
 * ab Terminbeginn ein Hinweis (`NotesPrompt`), und ein Knopf an der Karte nimmt
 * sie wieder ganz weg — danach ist der Hinweis zurück, als wäre nichts gewesen.
 *
 * **Geschrieben wird in einem Sheet** (`NotesSheet`) — beim Anlegen wie beim
 * Ändern. Ein Formular für beide Wege: zwei wären zwei Meinungen darüber, was
 * eine Nachbereitung ausmacht. Und die Karte bleibt zum Lesen: Zwei Stifte
 * zwischen den Zeilen machten aus dem, was vom Abend bleibt, ein Formular.
 *
 * **Anders als beim Thema wird hier nichts zurückgehalten.** Der Inhalt einer
 * Einheit gehört bis zum Abendbeginn denen, die ihn vorbereiten — an der
 * Nachbereitung hängt aber niemand, sie entsteht während oder nach dem Abend.
 * Nur der **Haken** hat seine Uhrzeit: einen Vorsatz für heute Abend hakt man
 * nicht heute früh ab.
 */
import { NotebookPen, Pencil, ScrollText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ActionstepFeature } from '@/components/domain/actionstep-feature';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextArea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/lib/api/hooks';
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
export function NotesPrompt({ onAdd }: { onAdd: () => void }) {
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
            Für eine Zusammenfassung und ggf. einen Actionstep.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          Hinzufügen
        </Button>
      </div>
    </Card>
  );
}

/** Was das Sheet schreibt — leer heißt: das Stück gibt es nicht. */
export interface NotesInput {
  summaryText: string | null;
  actionstepText: string | null;
}

/**
 * Zusammenfassung und Actionstep in einem Formular — beide optional, aber eines
 * muss dastehen: Eine Nachbereitung ohne beides ist keine.
 *
 * Gerendert wird es nur, solange es offen ist; so beginnt jedes Öffnen mit dem
 * Stand, der gerade gilt, und nicht mit einem halben Entwurf vom letzten Mal.
 */
export function NotesSheet({
  meeting,
  saving,
  onSave,
  onClose,
}: {
  meeting: Meeting;
  saving: boolean;
  onSave: (input: NotesInput) => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(meeting.summaryText ?? '');
  const [actionstep, setActionstep] = useState(meeting.actionstepText ?? '');

  const next: NotesInput = {
    summaryText: summary.trim() || null,
    actionstepText: actionstep.trim() || null,
  };
  const empty = next.summaryText === null && next.actionstepText === null;
  const unchanged =
    next.summaryText === (meeting.summaryText ?? null) &&
    next.actionstepText === (meeting.actionstepText ?? null);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nachbereitung"
      subtitle="Was vom Abend bleibt — für alle, auch für die, die nicht da waren."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            disabled={empty || unchanged}
            onClick={() => onSave(next)}
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Zusammenfassung" hint="Worum ging es an dem Abend?">
          <TextArea
            value={summary}
            rows={6}
            maxLength={5000}
            placeholder="Wir haben über … gesprochen."
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>
        <Field
          label="Actionstep"
          hint="Was nehmen wir uns für die Woche vor? Erscheint auf „Heute“."
        >
          <TextArea
            value={actionstep}
            rows={2}
            maxLength={2000}
            placeholder="Diese Woche …"
            onChange={(event) => setActionstep(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}

/**
 * Die Karte selbst. Sie steht nie leer da: Der Bildschirm zeigt sie nur, wenn
 * etwas geschrieben ist — sonst den Hinweis.
 */
export function NotesCard({
  meeting,
  editable,
  started,
  saving,
  onEdit,
  onRemove,
}: {
  meeting: Meeting;
  /**
   * Ob geschrieben werden darf. An einem **vergangenen** Abend ja — die
   * Nachbereitung entsteht ja erst danach —, aber nur unter „Bearbeiten": In
   * der Leseansicht steht sie zum Lesen da, ohne Knopf und ohne Löschen. An
   * einem **abgesagten** gar nicht, dort gibt es nichts zu protokollieren.
   */
  editable: boolean;
  /** Ob der Abend schon angefangen hat. Entscheidet über den Haken. */
  started: boolean;
  saving: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const me = useMe();

  return (
    <section>
      <SectionTitle
        action={
          editable ? (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 text-xs font-bold text-terracotta-500 normal-case hover:underline"
            >
              <Pencil size={12} />
              Bearbeiten
            </button>
          ) : undefined
        }
      >
        Nachbereitung
      </SectionTitle>

      <div className="space-y-3">
        {meeting.summaryText && (
          // Dieselbe Kante wie die Infos am Termin und die Zusammenfassung auf
          // „Heute": terracotta links heißt „hier steht, was jemand der Gruppe
          // sagt".
          <Card className="border-l-[3px] border-l-terracotta-500">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
              <ScrollText size={12} />
              Zusammenfassung
            </p>
            <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-stone-700">
              {meeting.summaryText}
            </p>
          </Card>
        )}

        {meeting.actionstepText && (
          <ActionstepFeature
            text={meeting.actionstepText}
            meetingId={meeting.id}
            done={meeting.actionstepDone.some(
              (row) => row.person.id === me.me?.id,
            )}
            checkable={started}
          />
        )}

        {/* Zurückhaltend und ganz unten: die ganze Sektion wieder wegnehmen ist
            keine Bearbeitung, sondern eine Entscheidung über den Abend. Danach
            steht wieder der Hinweis da, als wäre nichts gewesen. */}
        {editable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-stone-400 transition-colors hover:text-alert disabled:opacity-50"
          >
            <Trash2 size={12} />
            Nachbereitung entfernen
          </button>
        )}
      </div>
    </section>
  );
}
