'use client';

/**
 * „Ideen & Aktionen" — was ihr euch mal vorgenommen habt.
 *
 * Eine Liste mit Haken und sonst nichts. Kein Zustimmen, keine Kommentare: Ein
 * Kommentarfaden wäre ein zweiter Chat neben WhatsApp, und gegen den ist diese
 * App gebaut (CLAUDE.md §7). Was zu besprechen ist, wird am Abend besprochen —
 * hier steht nur, dass es ansteht.
 *
 * Anlegen, abhaken und **ändern** darf jede:r. Löschen nur, wer sie
 * aufgeschrieben hat — oder ein Admin. Der Unterschied ist keine Förmlichkeit:
 * Abhaken und Umformulieren sagen etwas über die Welt („haben wir gemacht",
 * „so war es gemeint"), Löschen etwas über die Liste („das wollten wir nie").
 *
 * **Die Knöpfe liegen hinter einem Wisch nach links** (`SwipeActions`), wie an
 * der Liederliste im Archiv. Der Papierkorb stand vorher dauerhaft neben jedem
 * Eintrag: ein Ziel am Rand einer Liste, durch die man scrollt, und der Daumen
 * fand es zuverlässiger als den Text.
 */
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CardSkeleton } from '@/components/ui/states';
import { SwipeActions } from '@/components/ui/swipe-actions';
import { cn } from '@/lib/cn';
import {
  useCreateIdea,
  useDeleteIdea,
  useIdeas,
  useMe,
  useUpdateIdea,
} from '@/lib/api/hooks';
import type { GroupIdea } from '@/lib/api/types';

export function IdeasCard() {
  const ideas = useIdeas();
  // Die Idee bleibt beim Schließen stehen, damit das Sheet mit seinem Titel
  // hinausfährt und nicht mittendrin zu „Neue Idee" wird.
  const [sheet, setSheet] = useState<{ open: boolean; idea: GroupIdea | null }>(
    { open: false, idea: null },
  );

  const open = (ideas.data ?? []).filter((idea) => idea.doneAt === null);
  const done = (ideas.data ?? []).filter((idea) => idea.doneAt !== null);

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <SectionTitle>Ideen &amp; Aktionen</SectionTitle>
        <IconButton
          label="Idee hinzufügen"
          onClick={() => setSheet({ open: true, idea: null })}
        >
          <Plus size={16} />
        </IconButton>
      </div>

      <Card className="space-y-2">
        {ideas.isLoading && <CardSkeleton />}

        {!ideas.isLoading && open.length === 0 && done.length === 0 && (
          <p className="py-4 text-center text-sm text-stone-400">
            Noch nichts vorgenommen. Was wolltet ihr schon immer mal machen?
          </p>
        )}

        {open.map((idea) => (
          <Row
            key={idea.id}
            idea={idea}
            onEdit={() => setSheet({ open: true, idea })}
          />
        ))}

        {/* Erledigtes bleibt stehen, aber rückt weg: Es ist Gedächtnis und
            nicht Aufgabe. Eine Trennlinie statt eines zweiten Abschnitts —
            es ist dieselbe Liste. */}
        {done.length > 0 && open.length > 0 && (
          <div className="border-t border-line pt-2" />
        )}
        {done.map((idea) => (
          <Row
            key={idea.id}
            idea={idea}
            onEdit={() => setSheet({ open: true, idea })}
          />
        ))}
      </Card>

      <IdeaSheet
        open={sheet.open}
        idea={sheet.idea}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
      />
    </section>
  );
}

/**
 * Titel und Notiz — anlegen und ändern im selben Sheet.
 *
 * Beides stand einmal inline in der Karte: das Anlegen oben, das Ändern an
 * Stelle der Zeile. Das schob beim Öffnen die Liste darunter weg, und auf dem
 * Telefon lag das Feld dann hinter der Tastatur. Ein Sheet steht unten fest,
 * trägt seine Knöpfe außerhalb des Scrollbereichs und sieht aus wie jedes
 * andere Formular der App.
 *
 * **Ein Sheet für beide Wege**: Anlegen und Ändern fragen dasselbe, und zwei
 * Formulare wären zwei Meinungen darüber, was eine Idee ausmacht.
 */
function IdeaSheet({
  open,
  idea,
  onClose,
}: {
  open: boolean;
  /** Gesetzt heißt: ändern statt anlegen. */
  idea: GroupIdea | null;
  onClose: () => void;
}) {
  const create = useCreateIdea();
  const update = useUpdateIdea();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  // Bei jedem Öffnen frisch: Ein angefangener Titel von vorhin gehört nicht
  // in die Idee, die man jetzt ändern will.
  //
  // An der Id und nicht am Objekt: Lädt die Liste im Hintergrund neu, kommt
  // dieselbe Idee als neues Objekt — und das überschriebe, was man gerade
  // tippt.
  const ideaId = idea?.id;
  useEffect(() => {
    if (!open) return;
    setTitle(idea?.title ?? '');
    setNote(idea?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ideaId]);

  const pending = create.isPending || update.isPending;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const values = {
      title: trimmed,
      note: note.trim() === '' ? null : note.trim(),
    };

    if (idea) {
      update.mutate({ idea, input: values }, { onSuccess: onClose });
    } else {
      create.mutate(values, { onSuccess: onClose });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={idea ? 'Idee bearbeiten' : 'Neue Idee'}
      subtitle={idea ? undefined : 'Was ihr als Gruppe einmal machen wollt.'}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            disabled={title.trim() === ''}
            loading={pending}
            onClick={submit}
          >
            {idea ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </div>
      }
    >
      {/* Ohne `autoFocus`, wie bei der Notiz zur Antwort: Die Tastatur
          schöbe das Sheet sonst hoch, bevor es angekommen ist. */}
      <div className="space-y-4">
        <Field label="Titel">
          <TextInput
            value={title}
            placeholder="Grillabend im Schlosspark"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
        </Field>
        <Field label="Notiz" hint="Optional">
          <TextArea
            value={note}
            rows={3}
            placeholder="Wann, wo, wer kümmert sich?"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function Row({ idea, onEdit }: { idea: GroupIdea; onEdit: () => void }) {
  const update = useUpdateIdea();
  const remove = useDeleteIdea();
  const confirm = useConfirm();
  const { me, isAdmin } = useMe();

  const done = idea.doneAt !== null;
  // Dieselbe Regel wie im Server. Sie steht hier ein zweites Mal, weil der
  // Papierkorb sonst dastünde und mit 403 antwortete — eine Einladung ins Leere.
  const mayDelete = isAdmin || idea.createdBy?.id === me?.id;

  const deleteIdea = async () => {
    const ok = await confirm({
      title: `„${idea.title}" löschen?`,
      body: 'Ist sie erledigt, hak sie lieber ab — dann bleibt sie als Erinnerung stehen.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (ok) remove.mutate(idea.id);
  };

  return (
    <SwipeActions
      className="-mx-2 rounded-md"
      actions={[
        {
          icon: <Pencil size={14} />,
          label: `${idea.title} bearbeiten`,
          onClick: onEdit,
        },
        ...(mayDelete
          ? [
              {
                icon: <Trash2 size={14} />,
                label: `${idea.title} löschen`,
                tone: 'danger' as const,
                disabled: remove.isPending,
                onClick: () => void deleteIdea(),
              },
            ]
          : []),
      ]}
    >
      <div className="flex items-start gap-3 px-2 py-1.5">
        <input
          type="checkbox"
          checked={done}
          disabled={update.isPending}
          aria-label={
            done ? `${idea.title} wieder öffnen` : `${idea.title} abhaken`
          }
          onChange={(event) =>
            update.mutate({ idea, input: { done: event.target.checked } })
          }
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-terracotta-500 focus:ring-terracotta-500"
        />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm leading-snug font-semibold',
              done ? 'text-stone-400 line-through' : 'text-stone-800',
            )}
          >
            {idea.title}
          </p>
          {idea.note && (
            <p
              className={cn(
                'mt-0.5 text-xs leading-relaxed',
                done ? 'text-stone-400' : 'text-stone-500',
              )}
            >
              {idea.note}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-stone-400">
            {/* „Ehemaliges Mitglied" steht hier bewusst nicht: Wer sein Konto
              löscht, verliert die Zuschreibung an der Idee ganz (`SetNull`).
              Eine Idee ohne Urheber ist immer noch eine Idee. */}
            {idea.createdBy ? `von ${idea.createdBy.name}` : 'von jemandem'}
            {done && idea.doneBy && ` · erledigt von ${idea.doneBy.name}`}
          </p>
        </div>
      </div>
    </SwipeActions>
  );
}
