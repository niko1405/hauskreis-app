/**
 * Die Marke, unter der `MembershipService` zusätzlich zu seiner Klasse
 * bereitsteht.
 *
 * Sie gibt es für genau einen Aufrufer: `PersonService.remove`. Wer jemanden
 * entfernt, stößt denselben Vorgang an wie jemand, der selbst geht —
 * Nachfolge, Rollenfreigabe, Gebetsbuddys, Nachricht an die anderen. Diesen
 * Ablauf ein zweites Mal zu schreiben hieße, ihn beim nächsten Mal nur einmal
 * zu ändern.
 *
 * Die Klasse dort zu importieren ginge nicht: `HauskreisModule` importiert
 * `PersonModule`, und `membership.service.ts` importiert `person.service.ts`.
 * Ein Import zurück schlösse den Kreis, und in CommonJS stünde `PersonService`
 * beim Auswerten der Dekoratoren auf `undefined`. Eine Zeichenkette hat diese
 * Wirkung nicht — sie steht in einer Datei, die nichts importiert.
 *
 * Dieselbe Überlegung wie bei `PersonService.replanPrayerBuddies`, nur dass es
 * dort ohne eigene Marke ging: `PrayerBuddyGeneratorService` importiert
 * `person.service.ts` nicht.
 */
export const MEMBERSHIP_SERVICE = 'MEMBERSHIP_SERVICE';
