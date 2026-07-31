import { z } from 'zod';

/**
 * Ein Kalendertag als `YYYY-MM-DD`, zur Laufzeit ein `Date`.
 *
 * Nicht `z.coerce.date()`: das nimmt zwar mehr entgegen — Zeitstempel, volle
 * ISO-Zeiten —, lässt sich aber nicht als JSON Schema ausdrücken. Ein `Date`
 * ist kein JSON-Typ, und die OpenAPI-Erzeugung bricht daran mit
 * „Date cannot be represented in JSON Schema" ab.
 *
 * Diese Form beschreibt sich im Dokument als `string` mit `format: date` und ist
 * zugleich die ehrlichere Zusage: gemeint sind überall Kalendertage, nie
 * Zeitpunkte. Ein `2026-08-11T19:30:00Z` wurde vorher stillschweigend auf den
 * Tag gerundet — jetzt wird es abgelehnt.
 */
export const isoDay = z.iso.date().transform((value) => new Date(value));
