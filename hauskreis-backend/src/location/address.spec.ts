import { homeName, isSameAddress, normalizeAddress } from './address';

describe('normalizeAddress', () => {
  it('führt die Schreibweisen derselben Wohnung zusammen', () => {
    const written = [
      'Marienstraße 35, 76137 Karlsruhe',
      'Marienstr. 35, 76137 Karlsruhe',
      'marienstr 35 76137 karlsruhe',
      '  Marienstrasse 35,76137  Karlsruhe ',
    ];

    const keys = new Set(written.map(normalizeAddress));

    expect(keys.size).toBe(1);
  });

  it('schreibt Umlaute aus, damit „Bäckerstr." und „Baeckerstr." dasselbe sind', () => {
    expect(isSameAddress('Bäckerstraße 4', 'Baeckerstrasse 4')).toBe(true);
    expect(isSameAddress('Grüner Weg 1', 'Gruener Weg 1')).toBe(true);
  });

  it('lässt verschiedene Wohnungen verschieden', () => {
    expect(isSameAddress('Marienstraße 35', 'Marienstraße 36')).toBe(false);
    expect(isSameAddress('Marienstraße 35', 'Kaiserstraße 35')).toBe(false);
  });

  it('verwechselt „str" im Wort nicht mit der Abkürzung', () => {
    // „Strohweg" fängt mit str an, ist aber keine Straße-Abkürzung.
    expect(normalizeAddress('Strohweg 2')).toBe('strohweg2');
    expect(normalizeAddress('Marienstrasse 35')).toBe('marienstrasse35');
  });

  it('trennt Hausnummern nicht vom Rest ab', () => {
    // Ohne die Ziffer im Lookahead würde „Marienstr.35" zu „marienstr35".
    expect(normalizeAddress('Marienstr.35')).toBe('marienstrasse35');
  });
});

describe('homeName', () => {
  it('nennt eine Wohnung nach ihren Bewohner:innen', () => {
    expect(homeName(['Niko'])).toBe('Bei Niko');
    expect(homeName(['Niko', 'Chris'])).toBe('Bei Niko & Chris');
    expect(homeName(['Julian', 'Marlene', 'Erik'])).toBe(
      'Bei Julian, Marlene & Erik',
    );
  });

  it('nimmt nur den Vornamen', () => {
    expect(homeName(['Niko Vix', 'Chris Meier'])).toBe('Bei Niko & Chris');
  });

  it('hat einen Namen für die Wohnung, aus der alle ausgezogen sind', () => {
    expect(homeName([])).toBe('Ehemaliges Zuhause');
  });
});
