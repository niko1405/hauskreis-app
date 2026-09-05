import {
  lyricsUrlHost,
  normalizeLyricsUrl,
  normalizeSongText,
} from './song-key';

describe('normalizeSongText', () => {
  it('führt Schreibweisen desselben Titels zusammen', () => {
    expect(normalizeSongText('Gott ist gut!')).toBe(
      normalizeSongText('gott ist gut'),
    );
    expect(normalizeSongText('Großer Gott, wir loben dich')).toBe(
      normalizeSongText('Grosser Gott wir loben Dich'),
    );
  });

  it('hält verschiedene Lieder auseinander', () => {
    expect(normalizeSongText('Herr, deine Liebe')).not.toBe(
      normalizeSongText('Herr, deine Treue'),
    );
  });
});

describe('normalizeLyricsUrl', () => {
  it('macht dieselbe Seite aus Schreibvarianten', () => {
    const kanonisch = normalizeLyricsUrl(
      'https://www.ultimate-guitar.com/tab/hillsong/oceans-1234',
    );

    // `www.`, der Schrägstrich am Ende und das Fragment sagen nichts über die
    // Seite; das Schema wird ohnehin schon vorher auf https geprüft.
    expect(
      normalizeLyricsUrl(
        'https://ultimate-guitar.com/tab/hillsong/oceans-1234/#chords',
      ),
    ).toBe(kanonisch);
  });

  it('wirft Tracking-Parameter weg, echte nicht', () => {
    expect(
      normalizeLyricsUrl('https://genius.com/lied?utm_source=whatsapp'),
    ).toBe('genius.com/lied');
    // `tab=chords` unterscheidet zwei echte Seiten bei Ultimate Guitar.
    expect(normalizeLyricsUrl('https://ultimate-guitar.com/x?tab=chords')).toBe(
      'ultimate-guitar.com/x?tab=chords',
    );
  });

  it('lässt den Pfad in Ruhe', () => {
    // Viele Seiten unterscheiden Groß- und Kleinschreibung im Pfad; ein
    // normalisierter Pfad fände Seiten, die es nicht gibt.
    expect(normalizeLyricsUrl('https://genius.com/Oceans')).not.toBe(
      normalizeLyricsUrl('https://genius.com/oceans'),
    );
  });

  it('gibt null zurück, wenn das keine Adresse ist', () => {
    expect(normalizeLyricsUrl('einfach text')).toBeNull();
  });
});

describe('lyricsUrlHost', () => {
  it('liefert den Host ohne www', () => {
    expect(lyricsUrlHost('https://www.genius.com/lied')).toBe('genius.com');
    expect(lyricsUrlHost('https://tabs.ultimate-guitar.com/x')).toBe(
      'tabs.ultimate-guitar.com',
    );
  });

  it('gibt null zurück, wenn das keine Adresse ist', () => {
    expect(lyricsUrlHost('nope')).toBeNull();
  });
});
