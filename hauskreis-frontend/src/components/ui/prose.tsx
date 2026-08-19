/**
 * Ein Markdown-Text als Fließtext — für die Rechtstexte.
 *
 * **Kein Markdown-Übersetzer.** Was hier ankommt, ist nicht beliebig: Es sind
 * zwei Dateien, die ein Mensch schreibt und die im selben Repo liegen. Dafür
 * eine Abhängigkeit zu holen, die jede Sonderform von Markdown kann, hieße
 * einige hundert Kilobyte auszuliefern, damit zwei Seiten Absätze bekommen.
 *
 * Verstanden werden: `##`/`###`-Überschriften, Absätze, `-`-Listen, `**fett**`,
 * `[Text](adresse)` und der harte Zeilenumbruch (Zeilenende `\`). Das ist genau
 * das, was ein Generator ausspuckt, und genau das, was ein Rechtstext braucht.
 * Alles andere steht als gewöhnlicher Absatz da — nichts verschwindet, nur weil
 * der Renderer es nicht kennt.
 *
 * Der kleine Bruder davon ist `Emphasised` im Hilfe-Bildschirm: Der kann nur
 * Fettdruck, weil die Antworten dort nicht mehr brauchen.
 */

/** Ein Block, so wie er aus dem Text gelesen wurde. */
type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/**
 * Der Text in Blöcke zerlegt.
 *
 * Getrennt wird an Leerzeilen — die eine Regel, die in Markdown wirklich
 * überall gilt. Innerhalb eines Blocks entscheidet die erste Zeile, was er ist.
 */
function parse(markdown: string): Block[] {
  return markdown
    .trim()
    .split(/\n\s*\n/)
    .flatMap((raw): Block[] => {
      const block = raw.trim();
      if (block === '') return [];

      const heading = /^(#{2,3})\s+(.*)$/.exec(block);
      if (heading) {
        return [
          {
            kind: 'heading',
            level: heading[1]!.length === 2 ? 2 : 3,
            text: heading[2]!,
          },
        ];
      }

      // Eine Liste ist ein Block, dessen **erste** Zeile mit „- " anfängt.
      // Folgezeilen ohne Strich gehören zum vorigen Punkt: So schreibt man
      // einen langen Aufzählungspunkt um, ohne dass er zerfällt.
      if (block.startsWith('- ')) {
        const items: string[] = [];

        for (const line of block.split('\n')) {
          const item = /^-\s+(.*)$/.exec(line.trim());
          if (item) {
            items.push(item[1]!);
          } else if (items.length > 0) {
            items[items.length - 1] += ` ${line.trim()}`;
          }
        }

        return [{ kind: 'list', items }];
      }

      // Ein Absatz darf über mehrere Zeilen laufen; die Zeilenumbrüche im
      // Quelltext sind Formatierung der Datei, nicht des Textes.
      //
      // **Außer am Zeilenende steht ein `\`** — der harte Umbruch aus Markdown.
      // Ohne ihn stünde eine Anschrift als „Nikolas Vix Humboldtstraße 21 76131
      // Karlsruhe" da, und drei einzelne Absätze daraus zu machen wäre dieselbe
      // Anschrift mit Luft dazwischen.
      const zeilen = block.split('\n').map((line) => line.trimEnd());
      let text = '';

      for (const [index, zeile] of zeilen.entries()) {
        const hart = zeile.endsWith('\\');
        text += hart ? zeile.slice(0, -1).trimEnd() : zeile;
        if (index < zeilen.length - 1) text += hart ? '\n' : ' ';
      }

      return [{ kind: 'paragraph', text }];
    });
}

/**
 * `**fett**` und `[Text](adresse)` innerhalb einer Zeile.
 *
 * Ein einziger regulärer Ausdruck mit zwei Alternativen, damit die beiden sich
 * nicht in die Quere kommen: Ein fett gesetzter Link bliebe sonst je nach
 * Reihenfolge auf der Strecke.
 */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/g);

  return (
    <>
      {parts.map((part, index) => {
        const bold = /^\*\*(.+)\*\*$/.exec(part);
        if (bold) {
          // eslint-disable-next-line react/no-array-index-key
          return (
            <strong key={index} className="font-semibold text-stone-800">
              {bold[1]}
            </strong>
          );
        }

        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const href = link[2]!;
          // Nach draußen in einem neuen Tab, im eigenen Haus nicht: Wer aus dem
          // Impressum auf die Datenschutzerklärung geht, will nicht zwei Tabs.
          const extern = /^https?:\/\//.test(href);

          return (
            <a
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              href={href}
              {...(extern
                ? { target: '_blank', rel: 'noreferrer' }
                : undefined)}
              className="text-terracotta-600 underline underline-offset-2 hover:text-terracotta-700"
            >
              {link[1]}
            </a>
          );
        }

        return part;
      })}
    </>
  );
}

export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4">
      {parse(markdown).map((block, index) => {
        if (block.kind === 'heading') {
          return block.level === 2 ? (
            <h2
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="pt-4 font-serif text-xl font-bold text-stone-900"
            >
              <Inline text={block.text} />
            </h2>
          ) : (
            <h3
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="pt-2 text-sm font-bold text-stone-800"
            >
              <Inline text={block.text} />
            </h3>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600"
            >
              {block.items.map((item, itemIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={itemIndex}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="text-sm leading-relaxed text-stone-600"
          >
            {block.text.split('\n').map((zeile, zeilenIndex) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={zeilenIndex}>
                {zeilenIndex > 0 && <br />}
                <Inline text={zeile} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
