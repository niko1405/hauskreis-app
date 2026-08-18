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
 * **Was diese Funktion nicht tut: den Modus wechseln.** Ein Loch zu stopfen
 * heißt nicht, dass die Gruppe künftig würfeln will. Der Admin bekommt einen
 * Hinweis und entscheidet selbst — solange er das nicht tut, steht eine
 * vollständige Zuteilung da statt einer halben.
 *
 * **Wie gestopft wird.** Was ein Mensch entschieden hat, bleibt stehen; nur die
 * Löcher werden gefüllt, und zwar von dem, der bisher am wenigsten zu tun hat.
 * Das ist die Wahl, die eine ausgewogene Zuteilung ausgewogen lässt, statt
 * einem Einzelnen alles Übriggebliebene zuzuschieben.
 */
export function repairPairings(
  existing: Duties,
  /** Wer aktuell dabei ist **und** einen Geburtstag eingetragen hat. */
  members: readonly string[],
): { duties: Map<string, string>; changed: boolean } {
  const present = new Set(members);
  const duties = new Map<string, string>();

  // 1. Was noch trägt, bleibt: beide Seiten müssen dabei sein, und niemand ist
  //    für sich selbst zuständig — auch dann nicht, wenn es einmal so
  //    eingetragen wurde.
  for (const [forWhom, responsible] of existing) {
    if (!present.has(forWhom) || !present.has(responsible)) continue;
    if (forWhom === responsible) continue;
    duties.set(forWhom, responsible);
  }

  const load = new Map<string, number>(members.map((id) => [id, 0]));
  for (const responsible of duties.values()) {
    load.set(responsible, (load.get(responsible) ?? 0) + 1);
  }

  // 2. Die Löcher, in fester Reihenfolge — sonst hinge das Ergebnis daran, wie
  //    die Datenbank die Zeilen zurückgab.
  const open = members.filter((id) => !duties.has(id)).toSorted();

  for (const forWhom of open) {
    const candidate = members
      .filter((id) => id !== forWhom)
      .toSorted(
        (a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || (a < b ? -1 : 1),
      )[0];

    // Nur eine Person in der Gruppe: dann bleibt sie ohne Zuständigen. Sich
    // selbst zu beschenken wäre kein Ausweg, sondern eine Behauptung.
    if (!candidate) continue;

    duties.set(forWhom, candidate);
    load.set(candidate, (load.get(candidate) ?? 0) + 1);
  }

  const changed =
    duties.size !== existing.size ||
    [...duties].some(
      ([forWhom, responsible]) => existing.get(forWhom) !== responsible,
    );

  return { duties, changed };
}
