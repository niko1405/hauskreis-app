import { checklistOf, previewOf, toggleCheck } from './note-text';

const packliste = [
  '# Freizeit',
  '',
  'Was mitmuss:',
  '- [ ] Zelt',
  '- [x] Schlafsack',
  '  * [ ] Isomatte',
  '- Taschenlampe',
].join('\n');

describe('checklistOf', () => {
  it('zählt nur Checklistenpunkte, auch eingerückte', () => {
    expect(checklistOf(packliste)).toEqual({ done: 1, total: 3 });
  });

  it('ohne Checkliste ist beides null', () => {
    expect(checklistOf('Nur Text')).toEqual({ done: 0, total: 0 });
  });
});

describe('toggleCheck', () => {
  it('hakt den n-ten Punkt ab und lässt alles andere stehen', () => {
    const next = toggleCheck(packliste, 2, 'Isomatte', true);
    expect(next).toBe(
      packliste.replace('  * [ ] Isomatte', '  * [x] Isomatte'),
    );
  });

  it('nimmt einen Haken wieder weg', () => {
    const next = toggleCheck(packliste, 1, 'Schlafsack', false);
    expect(next).toContain('- [ ] Schlafsack');
  });

  it('trifft keinen falschen Punkt, wenn sich die Liste verschoben hat', () => {
    // Jemand hat davor eine Zeile eingefügt: An Stelle 0 steht jetzt etwas
    // anderes, als der Haken meint.
    const verschoben = packliste.replace(
      '- [ ] Zelt',
      '- [ ] Kocher\n- [ ] Zelt',
    );
    expect(toggleCheck(verschoben, 0, 'Zelt', true)).toBeNull();
  });

  it('gibt null, wenn es den Punkt nicht mehr gibt', () => {
    expect(toggleCheck(packliste, 7, 'Zelt', true)).toBeNull();
  });
});

describe('previewOf', () => {
  it('nimmt die Auszeichnung weg und verbindet die Zeilen', () => {
    expect(previewOf(packliste)).toBe(
      'Freizeit Was mitmuss: Zelt Schlafsack Isomatte Taschenlampe',
    );
  });

  it('liest Fett und Links als Text', () => {
    expect(previewOf('**Wichtig:** [Karte](https://maps.example)')).toBe(
      'Wichtig: Karte',
    );
  });

  it('kürzt mit Auslassungszeichen', () => {
    const preview = previewOf('a'.repeat(300), 20);
    expect(preview).toHaveLength(20);
    expect(preview.endsWith('…')).toBe(true);
  });
});
