/**
 * Wer besorgt das Geschenk für wen.
 *
 * Zwei Regeln, eine Datei, keine Abhängigkeiten — dieselbe Bauart wie
 * `prayer-buddy/grouping.ts`: Was sich als reine Funktion sagen lässt, gehört
 * nicht in einen Dienst.
 */
import { compareInYear } from './birthday-dates';

export interface GiftablePerson {
  id: string;
  name: string;
  /** Nur Monat und Tag zählen; das Jahr ist für die Reihenfolge ohne Belang. */
  birthdate: Date;
}

/** Für wen ist wer zuständig — `birthdayPersonId → responsiblePersonId`. */
export type Duties = ReadonlyMap<string, string>;

/**
 * Die rotierende Zuteilung: **du bekommst den, der als nächstes dran ist.**
 *
 * Alle Geburtstage der Reihe nach durchs Jahr, und wer gerade gefeiert hat, ist
 * für den nächsten zuständig. Der Kreis schließt sich: Der letzte im Jahr
 * besorgt das Geschenk für den ersten.
 *
 * Drei Dinge fallen dabei von selbst ab, ohne dass man sie prüfen müsste:
 *
 *   * **Jede:r ist in einer Runde genau einmal dran.** Eine Runde ist ein Jahr,
 *     und in einem Jahr hat jede:r einmal Geburtstag.
 *   * **Niemand ist für sich selbst zuständig.** In einem Kreis mit mehr als
 *     einem Glied zeigt kein Glied auf sich.
 *   * **Wer gerade beschenkt wurde, ist als nächstes dran.** Man wird also
 *     genau dann erinnert, wenn man es zuletzt selbst erlebt hat.
 *
 * **Wer keinen Geburtstag eingetragen hat, steht nicht in der Reihe** — weder
 * als Beschenkter noch als Schenkender. Das ist keine Strafe, sondern die
 * Bauart: Der Platz in der Reihe *ist* der Geburtstag. Wer ihn nachträgt,
 * rückt beim nächsten Lauf überall ein.
 *
 * Bei weniger als zwei Leuten kommt eine leere Zuteilung heraus. Sich selbst
 * etwas zu schenken ist kein Ergebnis, das man ausrechnen sollte.
 *
 * Deterministisch: Gleicher Tag bricht auf die Id, damit dieselbe Gruppe
 * dieselbe Zuteilung ergibt und nicht bei jedem Lauf eine andere.
 */
export function rotate(people: readonly GiftablePerson[]): Duties {
  if (people.length < 2) return new Map();

  const order = people.toSorted(
    (a, b) => compareInYear(a.birthdate, b.birthdate) || (a.id < b.id ? -1 : 1),
  );

  const duties = new Map<string, string>();
  for (const [index, person] of order.entries()) {
    // Der Vorgänger im Kreis — für den ersten ist das der letzte.
    const previous = order[(index - 1 + order.length) % order.length]!;
    duties.set(person.id, previous.id);
  }

  return duties;
}

/**
 * Die feste Zuteilung schließen, wenn sich die Mitglieder geändert haben.
 *
 * **Warum das nötig ist.** Im Modus „manuell" hängt die Zuteilung an Namen, und
 * Namen kommen und gehen. Wer geht, reißt gleich zwei Löcher: Für ihn ist
 * niemand mehr zuständig (egal), und für **den, für den er zuständig war**,
 * ist es jetzt niemand mehr (nicht egal). Genauso beim Zugang: Ein neues
 * Mitglied hat keinen Zuständigen und ist für niemanden zuständig.
 *
 * **Es sind zwei Löcher, nicht eins — und daran ist die alte Fassung
 * gescheitert.** Sie suchte für jeden Geburtstag ohne Zuständigen jemanden mit
 * wenig Last und war dann fertig. Dass ein Neuzugang auch selbst noch niemanden
 * beschenkt, kam darin nicht vor, und für seinen eigenen Geburtstag scheidet er
 * als Kandidat aus. Also bekam er jemanden aus dem Bestand, und der hatte
 * hinterher zwei:
 *
 * ```
 * {a,b,c} als Kreis a→c, b→a, c→b, dann kommt d dazu
 *   Loch d, Kandidat a  →  a→c, b→a, c→b, d→a
 *   a schenkt zweimal, d gar nicht
 * ```
 *
 * Genau das war in der Verwaltung zu sehen: einer ohne Zuteilung, einer mit
 * zwei. In der Rotation kann es nicht passieren, weil `rotate` den Kreis jedes
 * Mal ganz neu legt.
 *
 * **Die Regel, die gilt** (CLAUDE.md §6.9): Jede:r beschenkt genau einen und
 * wird von genau einem beschenkt — eine fixpunktfreie Permutation. Sie ist
 * nicht bloß hübsch, sie ist die Zusage, auf die sich neun Leute verlassen:
 * einmal im Jahr dran, und nie für sich selbst.
 *
 * **Was ein Mensch entschieden hat, bleibt trotzdem stehen**, soweit es mit
 * dieser Regel verträglich ist. Gestopft wird nur, was offen ist.
 */
export function repairPairings(
  existing: Duties,
  /** Wer aktuell dabei ist **und** einen Geburtstag eingetragen hat. */
  members: readonly string[],
): { duties: Map<string, string>; changed: boolean } {
  const present = new Set(members);
  const duties = new Map<string, string>();
  const giving = new Set<string>();

  // 1. Was noch trägt, bleibt. Drei Bedingungen, und die dritte ist neu:
  //    beide Seiten dabei, kein Selbstbezug, und der Schenkende schenkt noch
  //    nicht. In fester Reihenfolge, damit bei einer Dopplung immer dieselbe
  //    Kante gewinnt und nicht die, die Postgres zuerst zurückgab.
  for (const [forWhom, responsible] of [...existing].toSorted(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (!present.has(forWhom) || !present.has(responsible)) continue;
    if (forWhom === responsible) continue;
    if (giving.has(responsible)) continue;

    duties.set(forWhom, responsible);
    giving.add(responsible);
  }

  // 2. Die beiden offenen Seiten. Sie sind gleich groß, und das ist die
  //    eigentliche Erkenntnis: Jede übernommene Kante verbraucht genau einen
  //    Geburtstag und genau einen Schenkenden.
  const holes = members.filter((id) => !duties.has(id)).toSorted();
  const idle = members.filter((id) => !giving.has(id)).toSorted();

  for (const [index, forWhom] of holes.entries()) {
    duties.set(forWhom, idle[index]!);
  }

  // 3. Selbstbeschenkung auflösen. Beim Reihum-Zuordnen kann jemand auf sich
  //    selbst fallen; dann wird mit einem anderen Paar getauscht.
  for (const forWhom of holes) {
    if (duties.get(forWhom) !== forWhom) continue;

    const partner =
      // Ein anderes frisch gefülltes Loch — der Normalfall.
      holes.find((other) => other !== forWhom) ??
      // Oder, wenn es keins gibt, eine übernommene Kante. **Das ist der Fall
      // mit genau einem Neuzugang**, und der kam in der alten Fassung gar
      // nicht vor: `d` ist gleichzeitig das einzige Loch und der einzige
      // Untätige. Er wird in den bestehenden Kreis eingehängt — aus `x→y`
      // werden `x→d` und `d→y`, drei von vier alten Kanten bleiben stehen.
      [...duties.keys()].find((other) => other !== forWhom);

    // Niemand zum Tauschen heißt: Die Gruppe hat genau ein Mitglied mit
    // Geburtstag. Dann bleibt es ohne Zuständigen — sich selbst zu beschenken
    // wäre kein Ausweg, sondern eine Behauptung.
    if (!partner) {
      duties.delete(forWhom);
      continue;
    }

    const theirs = duties.get(partner)!;
    duties.set(partner, forWhom);
    duties.set(forWhom, theirs);
  }

  const changed =
    duties.size !== existing.size ||
    [...duties].some(
      ([forWhom, responsible]) => existing.get(forWhom) !== responsible,
    );

  return { duties, changed };
}
