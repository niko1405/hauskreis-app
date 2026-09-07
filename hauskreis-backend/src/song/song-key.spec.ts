import {
  lyricsUrlHost,
  normalizeLyricsUrl,
  normalizeSongText,
  songArtistKey,
  songTitleKey,
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

describe('songTitleKey', () => {
  /** Der gemeldete Fall: im Archiv „(Live)", eingetippt ohne. */
  it('führt eine Fassung mit ihrem Lied zusammen', () => {
    expect(songTitleKey('Goodness of God (Live)')).toBe(
      songTitleKey('Goodness of God'),
    );
    expect(songTitleKey('Goodness of God - Live')).toBe(
      songTitleKey('Goodness of God'),
    );
    expect(songTitleKey('Goodness of God feat. Jenn Johnson')).toBe(
      songTitleKey('Goodness of God'),
    );
  });

  it('nimmt auch eckige Klammern', () => {
    expect(songTitleKey('Oceans [Official Video]')).toBe(
      songTitleKey('Oceans'),
    );
  });

  /**
   * Der Gedankenstrich zählt nur vor einem der bekannten Wörter. Sonst nähme er
   * jedem Titel, der einen enthält, die Hälfte weg.
   */
  it('lässt einen Gedankenstrich im Titel stehen', () => {
    expect(songTitleKey('Herr, dein Name - meine Zuflucht')).not.toBe(
      songTitleKey('Herr, dein Name'),
    );
  });

  /** Sonst passte ein leerer Schlüssel auf jeden anderen leeren. */
  it('gibt nicht auf, wenn nach dem Streichen nichts übrig bleibt', () => {
    expect(songTitleKey('(Live)')).toBe(normalizeSongText('(Live)'));
    expect(songTitleKey('(Live)')).not.toBe('');
  });

  it('trennt weiterhin, was verschiedene Lieder sind', () => {
    expect(songTitleKey('Oceans')).not.toBe(songTitleKey('Ozean'));
  });
});

describe('songArtistKey', () => {
  it('lässt die Besetzung weg', () => {
    expect(songArtistKey('Bethel Music feat. Jenn Johnson')).toBe(
      songArtistKey('Bethel Music'),
    );
    expect(songArtistKey('Hillsong UNITED ft. Taya')).toBe(
      songArtistKey('hillsong united'),
    );
  });

  /**
   * Anders als beim Titel: Bei einem Interpreten trägt die Klammer oft den
   * unterscheidenden Teil.
   */
  it('lässt eine Klammer stehen', () => {
    expect(songArtistKey('Die Priester (Klassik)')).not.toBe(
      songArtistKey('Die Priester'),
    );
  });
});
