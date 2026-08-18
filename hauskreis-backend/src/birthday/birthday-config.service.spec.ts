import { birthdayGiftConfigResponseSchema } from './dto/birthday-response.dto';

/**
 * Die Regel, die einmal gefehlt hat.
 *
 * Die Verwaltung meldete „jemand war schneller", obwohl niemand sonst da war.
 * Der Grund lag nicht im Sperren, sondern im **Lesen**: `EtagInterceptor`
 * setzt `W/"<version>"` nur, wenn die *serialisierte* Antwort ein `version`
 * trägt. Das Antwort-Schema hatte keines, der `ResponseSerializerInterceptor`
 * schnitt es also weg, und übrig blieb Express' Inhalts-Hash (`W/"a3-…"`).
 *
 * Den schickt der Client brav als `If-Match` zurück — und `parseEtagVersion`
 * erkennt ihn nicht als Version. `parseIfMatch` liefert dann bewusst eine
 * **leere** Versionsliste, damit eine Bedingung nie versehentlich zutrifft.
 * Ergebnis: Die `WHERE`-Klausel passt auf keine Zeile, `updateMany` ändert
 * nichts, und `updateWithVersionCheck` schließt daraus auf einen Konflikt.
 *
 * Jedes Schema hinter einem `@ApiConditionalWrite()` braucht deshalb `version`.
 */
describe('birthdayGiftConfigResponseSchema', () => {
  const config = {
    enabled: true,
    mode: 'ROTATING' as const,
    freezeDays: 14,
    pairingsRepairedAt: null,
    updatedBy: null,
    version: 3,
  };

  it('trägt die Version — sonst gibt es keinen brauchbaren ETag', () => {
    expect(birthdayGiftConfigResponseSchema.parse(config).version).toBe(3);
  });

  it('lehnt eine Antwort ohne Version ab', () => {
    // Der eigentliche Sinn dieses Tests: Wer das Feld wieder herausnimmt,
    // bricht nicht das Lesen, sondern das Schreiben — und zwar erst beim
    // zweiten Speichern, von Hand, in der Verwaltung.
    const { version: _version, ...ohne } = config;
    expect(() => birthdayGiftConfigResponseSchema.parse(ohne)).toThrow(
      /version/,
    );
  });
});
