import {
  changeEmailSchema,
  createPersonSchema,
  emailSchema,
  invitePersonSchema,
} from './person.dto';

/**
 * Die eine Regel, an der eine Einladung hing.
 *
 * **Der Fehler ist einmal passiert, und zwar bei einem echten Menschen.** Eine
 * Adresse mit Großbuchstaben wurde eingeladen, das Konto entstand, die Person
 * setzte ihr Passwort — und landete beim Anmelden auf dem Onboarding-Bildschirm,
 * während in der Verwaltung weiter „eingeladen" stand. Keycloak schreibt
 * Adressen klein, `person.email` behielt die Eingabe, und die drei Abfragen,
 * die eine offene Einladung suchen, vergleichen exakt.
 *
 * Deshalb steht die Normalisierung hier am Rand und nicht in den Abfragen: Ein
 * Sonderfall in drei `where`-Klauseln wäre dreimal die Gelegenheit, ihn beim
 * vierten Mal zu vergessen.
 */
describe('emailSchema', () => {
  it('schreibt klein, weil Keycloak es auch tut', () => {
    expect(emailSchema.parse('Max.Muster@Gmail.COM')).toBe(
      'max.muster@gmail.com',
    );
  });

  it('verträgt eine mitkopierte Leerstelle', () => {
    // Und zwar **vor** der Prüfung: Hinge `.trim()` hinter `z.email()`, wäre
    // die Adresse schon abgewiesen, bevor die Leerstelle wegfällt.
    expect(emailSchema.parse('  toni@example.com \n')).toBe('toni@example.com');
  });

  it('lässt keinen Unsinn durch', () => {
    expect(() => emailSchema.parse('Kein Komma, keine Adresse')).toThrow();
    expect(() => emailSchema.parse('MAX@')).toThrow();
  });
});

describe('Die Schemata, die eine Adresse annehmen', () => {
  it('normalisieren alle dieselbe Adresse gleich', () => {
    const getippt = '  Toni.Beispiel@Example.COM ';
    const erwartet = 'toni.beispiel@example.com';

    expect(invitePersonSchema.parse({ email: getippt }).email).toBe(erwartet);
    expect(changeEmailSchema.parse({ email: getippt }).email).toBe(erwartet);
    expect(
      createPersonSchema.parse({ name: 'Toni', email: getippt }).email,
    ).toBe(erwartet);
  });
});
