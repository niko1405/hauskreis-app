/**
 * Geld, wie die App es zeigt: Cent rein, „7,50 €" raus.
 *
 * Gespeichert wird in ganzen Cent, nie als Kommazahl (`priceCents`,
 * `shareCents`); umgerechnet wird erst hier, beim Anzeigen.
 */
const euros = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

export function formatCents(cents: number): string {
  return euros.format(cents / 100);
}
