'use client';

/**
 * Eine Notiz — `/notiz?id=<uuid>`.
 *
 * Ein Text, an dem mehrere schreiben, ohne dass er an einem Abend hängt: eine
 * Packliste für die Freizeit, Gedanken für den nächsten Kurs. Wer sie sehen
 * darf, schreibt mit; wer sie angelegt hat, entscheidet, wer dabei ist
 * („Leute" oben rechts).
 *
 * **Gelesen wird gesetzt, geschrieben im Klartext.** Unten steht
 * „Bearbeiten", wie auf den anderen Unterseiten; dahinter das Textfeld mit
 * seinen Knöpfen. Die **Checklisten** lassen sich aber gleich in der
 * Leseansicht abhaken — das ist bei einer Packliste die Hauptsache, und dafür
 * in einen Modus zu wechseln wäre ein Schritt zu viel.
 *
 * **Bei einem fremden Stand bleibt der Entwurf.** Schreiben zwei gleichzeitig,
 * antwortet der Server beim Speichern mit 412. Der übliche Hinweis lädt neu und
 * bittet, es noch einmal zu versuchen — hier wäre dabei der eigene Text weg.
 * Deshalb zwei Wege: die eigene Fassung trotzdem speichern (gesendet wird nur,
 * was man selbst geändert hat) oder die andere übernehmen.
 */
import { ArrowLeft, StickyNote, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EditBar } from '@/components/layout/edit-bar';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { TextInput } from '@/components/ui/field';
import Link from '@/components/ui/link';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useUnsavedGuard } from '@/components/ui/unsaved';
import { NoteBody } from '@/components/domain/note-body';
import {
  useCheckNote,
  useDeleteNote,
  useMe,
  useNote,
  useUpdateNote,
} from '@/lib/api/hooks';
import { formatTimestamp } from '@/lib/date';
import { firstName, namesOf } from '@/lib/person';
import type { Note } from '@/lib/api/types';
import { NoteEditor } from './note-editor';
import { NotePeopleSheet } from './note-people-sheet';

export function NoteDetailScreen({
  noteId,
  neu,
}: {
  noteId: string;
  /** Gerade angelegt — dann geht es gleich ans Schreiben. */
  neu: boolean;
}) {
  const query = useNote(noteId);

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) {
    return (
      <div className="space-y-4 px-5 pt-safe-4">
        <BackLink />
        <ErrorState error={query.error} />
      </div>
    );
  }
  if (!query.data) return null;

  return <Loaded note={query.data.data} startEditing={neu} />;
}

function BackLink() {
  return (
    <Link
      href="/archiv?register=notizen"
      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-terracotta-600"
    >
      <ArrowLeft size={14} />
      Notizen
    </Link>
  );
}

interface Draft {
  title: string;
  body: string;
}

function Loaded({ note, startEditing }: { note: Note; startEditing: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateNote(note.id);
  const check = useCheckNote(note.id);
  const remove = useDeleteNote();

  // `base` ist der Stand, von dem aus geschrieben wird. Geschickt wird nur,
  // was sich **gegen ihn** geändert hat — so bleibt bei einem fremden Stand
  // dazwischen alles stehen, was man selbst nicht angefasst hat.
  const [base, setBase] = useState<Draft | null>(() =>
    startEditing ? { title: note.title, body: note.body } : null,
  );
  const [draft, setDraft] = useState<Draft>({
    title: note.title,
    body: note.body,
  });
  const [peopleOpen, setPeopleOpen] = useState(false);

  // `&neu=1` hat seinen Dienst getan: Ein Neuladen soll die Notiz zeigen und
  // nicht wieder ins Schreiben springen.
  useEffect(() => {
    if (startEditing) {
      window.history.replaceState(null, '', `/notiz?id=${note.id}`);
    }
  }, [startEditing, note.id]);

  const editing = base !== null;
  const changes = base
    ? {
        ...(draft.title.trim() !== base.title
          ? { title: draft.title.trim() }
          : {}),
        ...(draft.body !== base.body ? { body: draft.body } : {}),
      }
    : {};
  const dirty = Object.keys(changes).length > 0;
  useUnsavedGuard(dirty);

  const bearbeiten = () => {
    const current = { title: note.title, body: note.body };
    setBase(current);
    setDraft(current);
  };

  const fertig = () => {
    if (draft.title.trim() === '') {
      toast.error('Ohne Titel findet die Notiz später niemand wieder.');
      return;
    }
    if (!dirty) {
      setBase(null);
      return;
    }
    update.mutate(changes, {
      onSuccess: () => {
        setBase(null);
        toast.success('Gespeichert.');
      },
    });
  };

  /** Den fremden Stand holen und die eigene Fassung darüber speichern. */
  const meineSpeichern = async () => {
    await update.resolveConflict();
    update.mutate(changes, {
      onSuccess: () => {
        setBase(null);
        toast.success('Gespeichert.');
      },
    });
  };

  /** Den fremden Stand übernehmen — der eigene Entwurf fällt weg. */
  const ihreUebernehmen = async () => {
    await update.resolveConflict();
    setBase(null);
  };

  const loeschen = async () => {
    const ok = await confirm({
      title: `„${note.title}" löschen?`,
      body: 'Die Notiz verschwindet für alle, die mitschreiben.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(note.id, {
      onSuccess: () => {
        toast.success('Notiz gelöscht.');
        router.push('/archiv?register=notizen');
      },
    });
  };

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        {note.mayManage && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPeopleOpen(true)}
          >
            <Users size={13} /> Leute
          </Button>
        )}
      </div>

      <header>
        <div className="flex items-start gap-3">
          <StickyNote
            aria-hidden
            className="mt-1 size-7 shrink-0 text-terracotta-500"
            strokeWidth={1.75}
          />
          {editing ? (
            <TextInput
              aria-label="Titel der Notiz"
              value={draft.title}
              placeholder="Worum geht es?"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              className="font-serif text-xl font-bold"
            />
          ) : (
            <h1 className="min-w-0 font-serif text-3xl leading-tight font-bold break-words text-stone-900">
              {note.title}
            </h1>
          )}
        </div>
        <Meta note={note} />
      </header>

      {update.conflict && (
        <div className="rounded-md border border-warn-line bg-warn-bg p-4">
          <p className="text-sm font-bold text-warn">
            Inzwischen hat jemand anderes gespeichert
          </p>
          <p className="mt-1 text-xs leading-relaxed text-warn/80">
            Dein Text ist noch da. Du kannst deine Fassung trotzdem speichern —
            dann gilt, was du geändert hast — oder die andere übernehmen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void meineSpeichern()}>
              Meine Fassung speichern
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void ihreUebernehmen()}
            >
              Ihre übernehmen
            </Button>
          </div>
        </div>
      )}

      {editing ? (
        <NoteEditor
          value={draft.body}
          onChange={(body) => setDraft((current) => ({ ...current, body }))}
        />
      ) : note.body.trim() === '' ? (
        <p className="text-sm leading-relaxed text-stone-400">
          Noch leer. Tipp unten auf „Bearbeiten", um zu schreiben.
        </p>
      ) : (
        <NoteBody
          body={note.body}
          onToggle={(item) =>
            check.mutate({
              index: item.index,
              text: item.text,
              done: !item.done,
            })
          }
        />
      )}

      {editing && note.mayManage && (
        <Button
          variant="ghost"
          className="w-full text-alert"
          loading={remove.isPending}
          onClick={() => void loeschen()}
        >
          <Trash2 size={15} />
          Notiz löschen
        </Button>
      )}

      <EditBar
        editing={editing}
        busy={update.isPending}
        onToggle={editing ? fertig : bearbeiten}
      />

      {peopleOpen && (
        <NotePeopleSheet note={note} onClose={() => setPeopleOpen(false)} />
      )}
    </div>
  );
}

/**
 * Wer dabei ist und wer zuletzt geschrieben hat — eine Zeile unter dem Titel.
 *
 * „Nur du" steht ausdrücklich da: Bei einer Notiz, die sonst niemand sieht,
 * ist genau das die Auskunft, nach der man sucht, bevor man etwas
 * Persönliches hineinschreibt.
 */
function Meta({ note }: { note: Note }) {
  const me = useMe();
  const leute = [
    ...(note.createdBy ? [note.createdBy] : []),
    ...note.members.map((row) => row.person),
  ];
  const nurIch =
    !note.forEveryone &&
    note.members.length === 0 &&
    note.createdBy?.id === me.me?.id;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-10">
      {note.forEveryone ? (
        <Badge variant="terracotta">
          <Users size={11} /> Ganze Gruppe
        </Badge>
      ) : nurIch ? (
        <Badge>Nur du</Badge>
      ) : (
        <span className="flex items-center gap-1.5">
          <AvatarStack people={leute} size="xs" />
          <span className="text-[11px] text-stone-500">{namesOf(leute)}</span>
        </span>
      )}
      <span className="text-[11px] text-stone-400">
        {note.updatedBy
          ? `Zuletzt ${note.updatedBy.id === me.me?.id ? 'von dir' : `von ${firstName(note.updatedBy.name)}`}`
          : 'Zuletzt'}{' '}
        · {formatTimestamp(note.updatedAt)}
      </span>
    </div>
  );
}
