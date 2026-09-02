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
 * **Die Knöpfe liegen hinter einem langen Druck** — dasselbe Idiom wie an der
 * Liederliste im Archiv (`useLongPress`). Der Papierkorb stand vorher dauerhaft
 * neben jedem Eintrag: ein Ziel am Rand einer Liste, durch die man scrollt, und
 * der Daumen fand es zuverlässiger als den Text. Ein Stift daneben hätte das
 * verdoppelt.
 */
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { TextArea, TextInput } from '@/components/ui/field';
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
  const [adding, setAdding] = useState(false);

  const open = (ideas.data ?? []).filter((idea) => idea.doneAt === null);
  const done = (ideas.data ?? []).filter((idea) => idea.doneAt !== null);

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <SectionTitle>Ideen &amp; Aktionen</SectionTitle>
        {!adding && (
          <IconButton label="Idee hinzufügen" onClick={() => setAdding(true)}>
            <Plus size={16} />
          </IconButton>
        )}
      </div>

      <Card className="space-y-2">
        {adding && <AddForm onDone={() => setAdding(false)} />}

        {ideas.isLoading && <CardSkeleton />}

        {!ideas.isLoading && open.length === 0 && done.length === 0 && (
          <p className="py-4 text-center text-sm text-stone-400">
            Noch nichts vorgenommen. Was wolltet ihr schon immer mal machen?
          </p>
        )}

        {open.map((idea) => (
          <Row key={idea.id} idea={idea} />
        ))}

        {/* Erledigtes bleibt stehen, aber rückt weg: Es ist Gedächtnis und
            nicht Aufgabe. Eine Trennlinie statt eines zweiten Abschnitts —
            es ist dieselbe Liste. */}
        {done.length > 0 && open.length > 0 && (
          <div className="border-t border-line pt-2" />
        )}
        {done.map((idea) => (
          <Row key={idea.id} idea={idea} />
        ))}
      </Card>
    </section>
  );
}

/**
 * Titel und Notiz — für beide Wege derselbe Rumpf.
 *
 * Anlegen und Ändern fragen dasselbe; zwei Formulare wären zwei Meinungen
 * darüber, was eine Idee ausmacht.
 */
function IdeaForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: GroupIdea;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: { title: string; note: string | null }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  // Der Fokus über einen Effekt und nicht über `autoFocus` — dieselbe Lösung
  // wie in `InlineEdit`: Das Attribut greift nur beim allerersten Rendern und
  // wird zu Recht als Barriere beanstandet. Hier ist es unbedenklich, weil das
  // Feld erst auf einen Knopfdruck hin entsteht.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, note: note.trim() === '' ? null : note.trim() });
  };

  return (
    <div className="space-y-2 rounded-md border border-line bg-canvas p-3">
      <TextInput
        ref={input}
        value={title}
        placeholder="Grillabend im Schlosspark"
        aria-label="Idee"
        onChange={(event) => setTitle(event.target.value)}
        // Genug für einen Titel; wer mehr sagen will, nimmt die Notiz.
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') onCancel();
        }}
      />
      <TextArea
        value={note}
        placeholder="Notiz (optional)"
        aria-label="Notiz"
        className="min-h-16"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={title.trim() === ''}
          loading={pending}
          onClick={submit}
        >
          {submitLabel}
        </Button>
        <IconButton label="Abbrechen" onClick={onCancel}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const create = useCreateIdea();

  return (
    <IdeaForm
      submitLabel="Hinzufügen"
      pending={create.isPending}
      onCancel={onDone}
      onSubmit={(values) => create.mutate(values, { onSuccess: onDone })}
    />
  );
}

function Row({ idea }: { idea: GroupIdea }) {
  const update = useUpdateIdea();
  const remove = useDeleteIdea();
  const confirm = useConfirm();
  const { me, isAdmin } = useMe();
  const [editing, setEditing] = useState(false);

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

  if (editing) {
    return (
      <IdeaForm
        initial={idea}
        submitLabel="Speichern"
        pending={update.isPending}
        onCancel={() => setEditing(false)}
        onSubmit={(values) =>
          update.mutate(
            { idea, input: values },
            { onSuccess: () => setEditing(false) },
          )
        }
      />
    );
  }

  return (
    <SwipeActions
      className="-mx-2 rounded-md"
      actions={[
        {
          icon: <Pencil size={14} />,
          label: `${idea.title} bearbeiten`,
          onClick: () => setEditing(true),
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
