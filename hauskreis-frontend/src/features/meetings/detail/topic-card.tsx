'use client';

/**
 * Das Thema des Abends — Titel, Zusammenfassung, Actionstep an einer Stelle.
 *
 * Vorher lagen die drei über die ganze Seite verteilt: der Titel oben in der
 * Überschrift, die Zusammenfassung ganz unten, der Actionstep darunter, und das
 * Thema selbst als Rollen-Zeile dazwischen. Vier Orte für eine Sache, und keiner
 * sagte, dass sie zusammengehören.
 *
 * **Wer sie sieht.** Vor dem Abend nur, wer schreiben darf — sonst stünde der
 * Actionstep der nächsten Woche eine Woche zu früh für alle da, und darum geht
 * es bei einem Actionstep gerade nicht. Ab dem Termintag sehen ihn alle; da ist
 * er ja gesagt worden.
 *
 * **Wer sie ändert.** Wer das Thema vorbereitet — oder jede:r, solange niemand
 * dafür eingeteilt ist. Durchgesetzt wird das im Backend
 * (`EditRightsService`); hier steht nur, was man davon sieht.
 */
import { Card, SectionTitle } from '@/components/ui/card';
import { InlineEdit } from '@/components/ui/field';
import { topicTitle } from '@/lib/meeting';
import type { Meeting } from '@/lib/api/types';

export function TopicCard({
  meeting,
  /** Ob die eigene Person hier eintragen darf. */
  editable,
  saving,
  onTitle,
  onSummary,
  onActionstep,
  children,
}: {
  meeting: Meeting;
  editable: boolean;
  saving: boolean;
  onTitle: (next: string | null) => void;
  onSummary: (next: string | null) => void;
  onActionstep: (next: string | null) => void;
  /** Der Abhak-Block, den nur die Detailseite kennt. */
  children?: React.ReactNode;
}) {
  const topic = meeting.topic;

  return (
    <section>
      <SectionTitle>Thema</SectionTitle>
      <Card className="space-y-5">
        {topic ? (
          <InlineEdit
            label="Thema"
            value={topic.title}
            // Kein leerer Platzhalter, sondern ein echter Vorschlag: „Thema von
            // Niko" steht da, bis jemand etwas Besseres weiß. Abgeleitet und
            // nicht gespeichert — sonst stünde er beim nächsten Rollentausch
            // falsch da, und niemand korrigiert einen Titel, den er nie getippt
            // hat.
            emptyLabel={topicTitle(topic)}
            placeholder={topicTitle(topic)}
            className="font-serif text-lg font-bold"
            saving={saving}
            onSave={editable ? onTitle : undefined}
          />
        ) : (
          <p className="text-sm text-stone-400">
            Noch kein Thema — trag oben jemanden ein, dann entsteht eines.
          </p>
        )}

        {topic && (
          <>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                Zusammenfassung
              </p>
              <InlineEdit
                label="Zusammenfassung"
                multiline
                value={meeting.summaryText}
                emptyLabel="Noch nichts — hilft allen, die nicht da waren."
                saving={saving}
                onSave={editable ? onSummary : undefined}
              />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                Actionstep
              </p>
              <InlineEdit
                label="Actionstep"
                value={meeting.actionstepText}
                emptyLabel="Noch kein Actionstep für die Woche"
                saving={saving}
                onSave={editable ? onActionstep : undefined}
              />
              {meeting.actionstepText && children}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
