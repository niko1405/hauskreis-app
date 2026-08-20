'use client';

/**
 * Das Zuteilungs-Sheet — die Hülle um `AssignmentPicker`.
 *
 * Hier steht nur, was das Sheet ausmacht: Titel, Entwurfsstand und der Umgang
 * mit „einer" gegen „mehrere". Die Auswahl selbst liegt im Picker, weil sie das
 * Thema-Sheet als einen seiner Schritte ebenfalls braucht — und ein Sheet im
 * Sheet nicht geht.
 *
 * Einfachauswahl schließt sofort: die Frage ist mit dem Tippen beantwortet.
 * Mehrfachauswahl sammelt erst und braucht deshalb einen Abschluss.
 */
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ROLE_QUESTION } from '@/lib/meeting';
import { AssignmentPicker, type AssignmentKind } from './assignment-picker';

export interface AssignmentSheetProps {
  open: boolean;
  onClose: () => void;
  kind: AssignmentKind;
  meetingId: string;
  /** Wer aktuell eingetragen ist. */
  selectedIds: string[];
  /** Host ist einer, Thema und Musik können mehrere sein. */
  multiple?: boolean;
  /**
   * Für vergangene Abende: keine Vorschläge, nur die Personenliste.
   *
   * Ein Vorschlag beantwortet „wer wäre als Nächstes dran" — an einem Abend,
   * der vorbei ist, gibt es diese Frage nicht. Was hier nachgetragen wird, ist
   * eine Erinnerung, und die weiß man oder man weiß sie nicht.
   */
  withoutSuggestions?: boolean;
  /**
   * Was diese Zuteilung sonst noch auslöst — steht über der Liste.
   *
   * Für den einen Fall, in dem Eintragen mehr tut als eintragen: Hängt am Abend
   * eine Einheit und bleibt niemand zuständig, der sie vorbereitet, löst sie
   * sich. Das gehört **vor** die Entscheidung; eine Rückfrage danach erschiene
   * auf dem schon geschlossenen Sheet.
   */
  hint?: React.ReactNode;
  onSubmit: (personIds: string[]) => void;
  saving?: boolean;
}

export function AssignmentSheet({
  open,
  onClose,
  kind,
  meetingId,
  selectedIds,
  multiple = false,
  withoutSuggestions = false,
  hint,
  onSubmit,
  saving = false,
}: AssignmentSheetProps) {
  const [draft, setDraft] = useState<string[]>(selectedIds);

  // Beim Öffnen den aktuellen Stand übernehmen — nicht den von letztem Mal.
  useEffect(() => {
    if (open) setDraft(selectedIds);
  }, [open, selectedIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (personId: string) => {
    if (!multiple) {
      onSubmit([personId]);
      onClose();
      return;
    }
    setDraft((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
  };

  const clear = () => {
    if (multiple) {
      setDraft([]);
      return;
    }
    onSubmit([]);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ROLE_QUESTION[kind]}
      subtitle={multiple ? 'Mehrere möglich' : undefined}
    >
      {hint && (
        <p className="mb-4 flex gap-2 rounded-md border border-info-line bg-info-bg px-3 py-2.5 text-[11px] leading-relaxed text-info">
          <Info size={14} className="mt-px shrink-0" />
          <span>{hint}</span>
        </p>
      )}

      <AssignmentPicker
        kind={kind}
        meetingId={meetingId}
        active={open}
        selectedIds={draft}
        withoutSuggestions={withoutSuggestions}
        onToggle={toggle}
        onClear={clear}
      />

      {multiple && (
        <div className="flex gap-2 border-t border-line pt-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            onClick={() => {
              onSubmit(draft);
              onClose();
            }}
          >
            Übernehmen
          </Button>
        </div>
      )}
    </Sheet>
  );
}
