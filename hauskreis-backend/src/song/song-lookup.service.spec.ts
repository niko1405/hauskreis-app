import { SongLookupService } from './song-lookup.service';
import type { GeminiClient } from './gemini.client';

type RawCandidate = {
  url: string;
  title: string | null;
  artist: string | null;
};

/**
 * Der Dienst mit einem erfundenen Modell und einem erfundenen Netz.
 *
 * `reachability` bildet URL auf Statuscode ab; was nicht darin steht, gilt als
 * nicht erreichbar (Verbindungsfehler).
 */
function setup(options: {
  answer?: unknown;
  reachability?: Record<string, number>;
  /** HTML, das ein Abruf zurueckgibt — fuer den Weg ueber den Seitenkopf. */
  html?: Record<string, string>;
  enabled?: boolean;
}) {
  const ask = jest.fn().mockResolvedValue(options.answer ?? null);
  const gemini = {
    ask,
    get isEnabled() {
      return options.enabled ?? true;
    },
  } as unknown as GeminiClient;

  const fetchMock = jest.fn(async (url: string) => {
    const status = options.reachability?.[url];
    if (status === undefined) throw new Error('ECONNREFUSED');
    return {
      status,
      url,
      text: async () => options.html?.[url] ?? '',
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  return { service: new SongLookupService(gemini), ask, fetchMock };
}

/** Was `ask` beim n-ten Aufruf mitbekommen hat. */
const askedWith = (ask: jest.Mock, call = 0) =>
  ask.mock.calls[call][0] as { input: string; tools: { type: string }[] };

const candidates = (...items: RawCandidate[]) => ({ candidates: items });

const song = (url: string, overrides: Partial<RawCandidate> = {}) => ({
  url,
  title: 'Gott ist gut',
  artist: 'Outbreakband',
  ...overrides,
});

const UG = 'https://tabs.ultimate-guitar.com/tab/outbreakband/gott-ist-gut-123';
const GENIUS = 'https://genius.com/Outbreakband-gott-ist-gut-lyrics';

describe('SongLookupService.search', () => {
  it('keeps a link the site answers for', async () => {
    const { service } = setup({
      answer: candidates(song(GENIUS)),
      reachability: { [GENIUS]: 200 },
    });

    const found = await service.search('Gott ist gut', 'Outbreakband');

    expect(found).toEqual([
      {
        url: GENIUS,
        title: 'Gott ist gut',
        artist: 'Outbreakband',
        site: 'genius.com',
      },
    ]);
  });

  it('drops a link the model invented', async () => {
    const { service } = setup({
      answer: candidates(song('https://genius.com/gibt-es-nicht-lyrics')),
      reachability: { 'https://genius.com/gibt-es-nicht-lyrics': 404 },
    });

    expect(await service.search('Halleluja Zwergpinguin')).toEqual([]);
  });

  it('keeps a link behind a bot check', async () => {
    // Ultimate Guitar antwortet einem Server-Aufruf mit Cloudflare. Das heisst
    // "nicht fuer dich", nicht "gibt es nicht" — fuer ein unbekanntes Lied
    // kaeme dort weiterhin 404.
    const { service } = setup({
      answer: candidates(song(UG)),
      reachability: { [UG]: 403 },
    });

    expect(await service.search('Gott ist gut')).toHaveLength(1);
  });

  it('drops a link that redirects to the start page', async () => {
    const { service, fetchMock } = setup({
      answer: candidates(song(GENIUS)),
    });
    fetchMock.mockResolvedValue({
      status: 200,
      url: 'https://genius.com/',
    } as Response);

    expect(await service.search('Gott ist gut')).toEqual([]);
  });

  it('puts the preferred site first', async () => {
    const { service } = setup({
      answer: candidates(song(GENIUS), song(UG)),
      reachability: { [GENIUS]: 200, [UG]: 200 },
    });

    const found = await service.search('Gott ist gut');

    expect(found.map((entry) => entry.site)).toEqual([
      'ultimate-guitar.com',
      'genius.com',
    ]);
  });

  it('offers each site only once', async () => {
    const { service } = setup({
      answer: candidates(
        song(GENIUS),
        song('https://genius.com/Outbreakband-gott-ist-gut-2-lyrics'),
      ),
      reachability: {
        [GENIUS]: 200,
        'https://genius.com/Outbreakband-gott-ist-gut-2-lyrics': 200,
      },
    });

    expect(await service.search('Gott ist gut')).toHaveLength(1);
  });

  it('treats a subdomain of a preferred site as that site', async () => {
    // Ultimate Guitar liefert Akkordblaetter unter `tabs.` aus. Ohne das
    // Zusammenfassen stuenden zwei Links auf dieselbe Seite nebeneinander,
    // und in der Liste die Unterdomain statt der Seite.
    const other = 'https://www.ultimate-guitar.com/tab/x/gott-ist-gut-456';
    const { service } = setup({
      answer: candidates(song(UG), song(other)),
      reachability: { [UG]: 200, [other]: 200 },
    });

    expect(await service.search('Gott ist gut')).toEqual([
      expect.objectContaining({ url: UG, site: 'ultimate-guitar.com' }),
    ]);
  });

  it.each([
    ['unverschluesselt', 'http://genius.com/etwas-lyrics'],
    ['eine Startseite', 'https://genius.com/'],
    ['eine Suchmaschine', 'https://www.google.com/search?q=gott+ist+gut'],
    ['ein Video', 'https://www.youtube.com/watch?v=abc'],
  ])('drops a link that ends up at %s', async (_case, url) => {
    const { service } = setup({
      answer: candidates(song(url)),
      reachability: { [url]: 200 },
    });

    expect(await service.search('Gott ist gut')).toEqual([]);
  });

  it.each([
    ['im eigenen Netz', 'http://192.168.1.5/lyrics'],
    ['gar keine URL', 'irgendwas'],
  ])('never even fetches %s', async (_case, url) => {
    const { service, fetchMock } = setup({ answer: candidates(song(url)) });

    expect(await service.search('Gott ist gut')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows the grounding redirect and keeps where it lands', async () => {
    // Das Grounding liefert seine Fundstellen als Weiterleitung ueber Google
    // aus. Die laeuft nach Wochen ab — gespeichert waere sie ein Link, der
    // beim Anlegen geht und im Herbst ins Leere zeigt.
    const redirect =
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ123';
    const { service, fetchMock } = setup({
      answer: candidates(song(redirect)),
    });
    fetchMock.mockResolvedValue({ status: 200, url: UG } as Response);

    expect(await service.search('Gott ist gut')).toEqual([
      expect.objectContaining({ url: UG, site: 'ultimate-guitar.com' }),
    ]);
  });

  it('drops a redirect that never resolves to a real page', async () => {
    const redirect =
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ123';
    const { service } = setup({
      answer: candidates(song(redirect)),
      reachability: { [redirect]: 200 },
    });

    expect(await service.search('Gott ist gut')).toEqual([]);
  });

  it('returns nothing rather than throwing when the model is unavailable', async () => {
    const { service } = setup({ answer: null });

    expect(await service.search('Gott ist gut')).toEqual([]);
  });
});

describe('SongLookupService.metadataFromLink — der billige Weg', () => {
  const PAGE = [
    '<html><head>',
    '<title>10,000 Reasons (Bless the Lord) &amp; more | Genius</title>',
    '<meta property="og:title" content="10,000 Reasons">',
    '<meta property="music:musician" content="Matt Redman">',
    '</head><body>… 140 KB Rest, die niemanden interessieren …</body></html>',
  ].join('\n');

  it('asks about the page head instead of sending the whole page', async () => {
    const { service, ask, fetchMock } = setup({
      answer: { title: '10,000 Reasons', artist: 'Matt Redman' },
      reachability: { [GENIUS]: 200 },
      html: { [GENIUS]: PAGE },
    });

    await service.metadataFromLink(GENIUS);

    const asked = askedWith(ask);
    // Kein url_context: Google muss die Seite nicht noch einmal holen, und die
    // 36.000 Tokens einer Ultimate-Guitar-Seite bleiben drau&szlig;en.
    expect(asked.tools).toEqual([]);
    expect(asked.input).toContain('10,000 Reasons (Bless the Lord) & more');
    expect(asked.input).toContain('Matt Redman');
    // Der Rumpf der Seite darf nicht mitgehen.
    expect(asked.input).not.toContain('140 KB Rest');
    // Nur der Anfang der Datei wird geholt.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Range: 'bytes=0-32768' }),
    });
  });

  it('falls back to url_context when the site blocks us', async () => {
    // Genau der Ultimate-Guitar-Fall: Cloudflare zeigt uns eine Pruefseite,
    // Googles Index sieht dieselbe Seite ganz normal.
    const { service, ask } = setup({
      answer: { title: 'Du bist gut', artist: 'Outbreakband' },
      reachability: { [UG]: 403 },
    });

    expect(await service.metadataFromLink(UG)).toEqual({
      title: 'Du bist gut',
      artist: 'Outbreakband',
    });
    expect(askedWith(ask).tools).toEqual([{ type: 'url_context' }]);
  });

  it('falls back when the page head holds nothing usable', async () => {
    const { service, ask } = setup({
      answer: { title: 'X', artist: null },
      reachability: { [GENIUS]: 200 },
      html: { [GENIUS]: '<html><body>kein Kopf</body></html>' },
    });

    await service.metadataFromLink(GENIUS);

    expect(askedWith(ask).tools).toEqual([{ type: 'url_context' }]);
  });
});

describe('SongLookupService — Zwischenspeicher', () => {
  it('asks the model once for the same link', async () => {
    const { service, ask } = setup({
      answer: { title: 'Du bist gut', artist: 'Outbreakband' },
      reachability: { [UG]: 403 },
    });

    const first = await service.metadataFromLink(UG);
    const second = await service.metadataFromLink(UG);

    expect(second).toEqual(first);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('asks the model once for the same search, empty result included', async () => {
    // Gerade der Fall ohne Treffer laedt zum zweiten Druck ein — und waere
    // ohne Zwischenspeicher der einzige, der jedes Mal wieder kostet.
    const { service, ask } = setup({ answer: candidates() });

    expect(await service.search('Halleluja Zwergpinguin')).toEqual([]);
    expect(await service.search('Halleluja Zwergpinguin')).toEqual([]);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('keeps different songs apart', async () => {
    const { service, ask } = setup({ answer: candidates() });

    await service.search('Ein Lied', 'Band A');
    await service.search('Ein Lied', 'Band B');

    expect(ask).toHaveBeenCalledTimes(2);
  });
});

/**
 * Der zweite Druck auf „Link suchen".
 *
 * Vorher kam beliebig oft derselbe Zwischenspeicher-Eintrag zurück — wer einen
 * schlechten Vorschlag bekommen hatte, war damit fertig. Jetzt bleibt das
 * Bekannte stehen, und daneben wird gezielt weitergesucht.
 */
describe('SongLookupService.search — noch einmal suchen', () => {
  const UG_ZWEI =
    'https://tabs.ultimate-guitar.com/tab/outbreakband/gott-ist-gut-456';

  it('liefert das Bekannte plus das Neue', async () => {
    const { service, ask } = setup({
      answer: candidates(song(UG)),
      reachability: { [UG]: 200, [GENIUS]: 200 },
    });

    const erst = await service.search('Gott ist gut');
    expect(erst.map((c) => c.url)).toEqual([UG]);

    ask.mockResolvedValue(candidates(song(GENIUS)));
    const dann = await service.search('Gott ist gut', undefined, true);

    expect(dann.map((c) => c.url)).toEqual([UG, GENIUS]);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('nennt dem Modell, was es nicht noch einmal vorschlagen soll', async () => {
    const { service, ask } = setup({
      answer: candidates(song(UG)),
      reachability: { [UG]: 200, [GENIUS]: 200 },
    });

    await service.search('Gott ist gut');
    ask.mockResolvedValue(candidates(song(GENIUS)));
    await service.search('Gott ist gut', undefined, true);

    expect(askedWith(ask, 1).input).toContain(UG);
  });

  /**
   * Das Modell hält sich nicht immer daran — und `resolve` folgt
   * Weiterleitungen, ein „neuer" Link kann also auf einer bekannten Seite
   * landen.
   */
  it('wirft einen Vorschlag weg, der doch der alte ist', async () => {
    const { service, ask } = setup({
      answer: candidates(song(UG)),
      reachability: { [UG]: 200 },
    });

    await service.search('Gott ist gut');
    ask.mockResolvedValue(candidates(song(UG)));

    expect(
      (await service.search('Gott ist gut', undefined, true)).map((c) => c.url),
    ).toEqual([UG]);
  });

  /**
   * Innerhalb eines Laufs bleibt „ein Vorschlag pro Seite". Über zwei Läufe
   * hinweg gerade nicht: dass die erste Wahl von Ultimate Guitar nicht taugte,
   * ist der Grund für den zweiten Druck.
   */
  it('lässt zwei Links derselben Seite aus zwei Läufen stehen', async () => {
    const { service, ask } = setup({
      answer: candidates(song(UG)),
      reachability: { [UG]: 200, [UG_ZWEI]: 200 },
    });

    await service.search('Gott ist gut');
    ask.mockResolvedValue(candidates(song(UG_ZWEI)));

    expect(
      (await service.search('Gott ist gut', undefined, true)).map((c) => c.url),
    ).toEqual([UG, UG_ZWEI]);
  });

  it('sucht auch dann neu, wenn beim ersten Mal nichts kam', async () => {
    const { service, ask } = setup({
      answer: candidates(),
      reachability: { [GENIUS]: 200 },
    });

    expect(await service.search('Zwergpinguin')).toEqual([]);

    ask.mockResolvedValue(candidates(song(GENIUS)));

    expect(
      (await service.search('Zwergpinguin', undefined, true)).map((c) => c.url),
    ).toEqual([GENIUS]);
  });
});

describe('SongLookupService.metadataFromLink', () => {
  it('reads title and artist from the page', async () => {
    const { service } = setup({
      answer: { title: '  Gott ist gut  ', artist: 'Outbreakband' },
    });

    expect(await service.metadataFromLink(GENIUS)).toEqual({
      title: 'Gott ist gut',
      artist: 'Outbreakband',
    });
  });

  it('turns an empty answer into a missing one', async () => {
    const { service } = setup({
      answer: { title: 'Gott ist gut', artist: '' },
    });

    expect(await service.metadataFromLink(GENIUS)).toEqual({
      title: 'Gott ist gut',
      artist: null,
    });
  });

  it.each([
    ['localhost', 'http://localhost:3000/etwas'],
    ['ein Nachbar im Containernetz', 'http://keycloak:8080/'],
    ['das eigene Netz', 'http://192.168.1.5/'],
    [
      'der Metadaten-Dienst der Cloud',
      'http://169.254.169.254/latest/meta-data/',
    ],
  ])('never asks the model about %s', async (_case, url) => {
    const { service, ask } = setup({});

    expect(await service.metadataFromLink(url)).toEqual({
      title: null,
      artist: null,
    });
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('SongLookupService.isEnabled', () => {
  it('follows the client', () => {
    expect(setup({ enabled: false }).service.isEnabled).toBe(false);
    expect(setup({ enabled: true }).service.isEnabled).toBe(true);
  });
});
