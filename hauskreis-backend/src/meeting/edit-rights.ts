/**
 * Wer an einem Abend was eintragen darf.
 *
 * Bisher durfte jedes Mitglied alles: Zusammenfassung, Actionstep, welche
 * Lieder gesungen wurden. Das war nicht falsch gedacht — die Gruppe ist neun
 * Leute, niemand sabotiert da etwas —, aber es half auch niemandem. Ein Feld,
 * das alle bearbeiten können, bearbeitet am Ende keiner, und wer für den Abend
 * zuständig ist, findet seine eigene Vorbereitung unter fremden Händen.
 *
 * Die Regel ist deshalb eine Zuständigkeit und keine Sperre:
 *
 * ```
 * darf = ist Admin
 *      ∨ ist der Rolle an diesem Abend zugeteilt
 *      ∨ es ist niemand zugeteilt
 * ```
 *
 * Der dritte Fall ist der wichtige. Ohne ihn wäre ein Abend, für den noch
 * niemand eingeteilt ist, gesperrt — und die Zuteilung damit zur Voraussetzung
 * fürs Nachbereiten. Genau umgekehrt läuft es im echten Leben: erst passiert
 * der Abend, dann schreibt jemand auf, was war.
 */
export function mayEdit(options: {
  isAdmin: boolean;
  personId: string;
  /** Wer der Rolle an diesem Abend zugeteilt ist. */
  responsibles: readonly string[];
}): boolean {
  if (options.isAdmin) return true;
  if (options.responsibles.length === 0) return true;
  return options.responsibles.includes(options.personId);
}
