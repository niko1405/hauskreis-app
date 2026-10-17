'use client';

import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/cn';
import { parseInline, parseNote, type CheckItem } from '@/lib/notes/markdown';

/**
 * Der Text einer Notiz, gesetzt — mit Checklisten, die man abhaken kann.
 *
 * Die Regeln stehen in `lib/notes/markdown.ts`; hier wird nur gezeichnet.
 * Ohne `onToggle` sind die Haken bloß zu sehen, etwa solange gerade gespeichert
 * wird.
 */
export function NoteBody({
  body,
  onToggle,
  className,
}: {
  body: string;
  onToggle?: (item: CheckItem) => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {parseNote(body).map((block, index) => {
        // Die Blöcke haben keine eigene Kennung; der Text ist während des
        // Lesens fest, die Reihenfolge also auch.
        const key = `${block.kind}-${index}`;

        if (block.kind === 'heading') {
          return block.level === 1 ? (
            <h2
              key={key}
              className="pt-2 font-serif text-xl leading-snug font-bold text-stone-900"
            >
              <Inline text={block.text} />
            </h2>
          ) : (
            <h3
              key={key}
              className="pt-1 text-xs font-bold tracking-widest text-terracotta-600 uppercase"
            >
              <Inline text={block.text} />
            </h3>
          );
        }

        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              key={key}
              className={cn(
                'space-y-1 pl-5 text-[15px] leading-relaxed text-stone-700 marker:text-terracotta-500',
                block.ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {block.items.map((item, itemIndex) => (
                // Punkte haben keine Kennung, und beim Lesen steht die
                // Reihenfolge fest.
                // eslint-disable-next-line react/no-array-index-key
                <li key={`${key}-${itemIndex}`}>
                  <Inline text={item} />
                </li>
              ))}
            </List>
          );
        }

        if (block.kind === 'checklist') {
          return (
            <ul key={key} className="space-y-0.5">
              {block.items.map((item) => (
                <li key={`${key}-${item.index}`}>
                  <CheckRow item={item} onToggle={onToggle} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={key}
            className="text-[15px] leading-relaxed break-words text-stone-700"
          >
            {block.lines.map((line, lineIndex) => (
              // eslint-disable-next-line react/no-array-index-key
              <Fragment key={`${key}-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                <Inline text={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Ein Punkt der Checkliste — die ganze Zeile ist der Knopf. */
function CheckRow({
  item,
  onToggle,
}: {
  item: CheckItem;
  onToggle?: (item: CheckItem) => void;
}) {
  const box = (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
        item.done
          ? 'border-success bg-success text-card'
          : 'border-line-strong bg-card',
      )}
    >
      {item.done && <Check size={13} strokeWidth={3} />}
    </span>
  );
  const text = (
    <span
      className={cn(
        'min-w-0 flex-1 text-[15px] leading-relaxed break-words transition-colors',
        item.done ? 'text-stone-400 line-through' : 'text-stone-700',
      )}
    >
      <Inline text={item.text} />
    </span>
  );

  if (!onToggle) {
    return (
      <div className="flex items-start gap-3 py-1">
        {box}
        {text}
      </div>
    );
  }

  // Kein `<button>`: In einem Punkt darf ein Link stehen, und ein Link in
  // einem Knopf ist kein gültiges HTML. Tastatur und Rolle kommen deshalb
  // von Hand dazu.
  return (
    <div
      role="checkbox"
      aria-checked={item.done}
      tabIndex={0}
      onClick={() => onToggle(item)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onToggle(item);
        }
      }}
      className="-mx-2 flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1 transition-colors select-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
    >
      {box}
      {text}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        const key = `${part.kind}-${index}`;
        if (part.kind === 'bold') {
          return (
            <strong key={key} className="font-semibold text-stone-900">
              {part.text}
            </strong>
          );
        }
        if (part.kind === 'link') {
          return (
            <a
              key={key}
              href={part.href}
              target="_blank"
              rel="noreferrer"
              // Ein Link in einer abhakbaren Zeile soll öffnen, nicht abhaken.
              onClick={(event) => event.stopPropagation()}
              className="break-all text-terracotta-600 underline underline-offset-2 hover:text-terracotta-700"
            >
              {part.text}
            </a>
          );
        }
        return <Fragment key={key}>{part.text}</Fragment>;
      })}
    </>
  );
}
