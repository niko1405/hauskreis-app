import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { GeminiClient } from './gemini.client';

/**
 * Wonach zuerst gesucht wird.
 *
 * Ultimate Guitar zuerst, weil bei uns vier Leute spielen und ein Akkordblatt
 * dort verlässlicher zu finden ist als irgendwo sonst. Genius deckt den reinen
 * Text ab, gerade bei deutschen Titeln, wo Ultimate Guitar dünn wird.
 *
 * Bewusst eine Konstante und keine Umgebungsvariable: die Liste ändert sich
 * vielleicht einmal im Jahr, und dann ist ein Commit ehrlicher als eine stille
 * Einstellung auf dem Server, die niemand mehr findet.
 */
export const LYRICS_SITE_PREFERENCE = ['ultimate-guitar.com', 'genius.com'];

/**
 * Seiten, die auf eine Songsuche hin oben stehen, aber nie das sind, was
 * jemand hier verlinken will.
 */
const NEVER_LINK = [
  'google.com',
  'google.de',
  'bing.com',
  'duckduckgo.com',
  'youtube.com',
  'youtu.be',
  'spotify.com',
  'music.apple.com',
  'facebook.com',
  'instagram.com',
  /// Die Weiterleitungen des Groundings. Als *Eingang* sind sie in Ordnung —
  /// wir folgen ihnen. Bleibt am Ende eine davon stehen, ist die Auflösung
  /// schiefgegangen, und gespeichert wäre sie in ein paar Wochen tot.
  'vertexaisearch.cloud.google.com',
];

export interface SongMetadata {
  title: string | null;
  artist: string | null;
}

export interface LyricsLinkCandidate {
  url: string;
  title: string | null;
  artist: string | null;
  /**
   * Die Seite, von der der Link stammt — das Einzige, was in der Liste
   * angezeigt wird.
   *
   * Bei den bevorzugten Seiten die Domain selbst, sonst der Hostname ohne
   * `www.`. Ultimate Guitar liefert Akkordblätter unter
   * `tabs.ultimate-guitar.com` aus; ohne das Zusammenfassen stünde die
   * Unterdomain in der Liste, und zwei Links auf dieselbe Seite kämen als
   * zwei verschiedene durch.
   */
  site: string;
}

const metadataSchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
});

const candidatesSchema = z.object({
  candidates: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable(),
      artist: z.string().nullable(),
    }),
  ),
});

/**
 * Was ein Retriever können muss. Zurzeit gibt es genau einen (Gemini mit
 * Google-Grounding).
 *
 * Die Schnittstelle steht trotzdem hier, weil der wahrscheinlichste nächste
 * Schritt ein zweiter ist: Genius hat eine kostenlose, offizielle Suche, deren
 * Treffer per Definition existieren. Käme die dazu, bliebe alles hinter dieser
 * Zeile — Sortierung, Entdopplung, Erreichbarkeitsprüfung — unverändert.
 */
export interface LyricsRetriever {
  search(title: string, artist?: string): Promise<LyricsLinkCandidate[]>;
}

/** Wie viele Vorschläge **ein Lauf** höchstens beisteuert. */
const MAX_CANDIDATES = 3;

/**
 * Wie lang die Liste über mehrere Läufe hinweg höchstens wird.
 *
 * Drei Läufe voll — danach hat entweder einer gepasst, oder die Suche findet zu
 * diesem Titel nichts Besseres mehr, und eine Liste, die immer weiter wächst,
 * hilft dann auch nicht.
 */
const MAX_TOTAL = MAX_CANDIDATES * 3;

const SYSTEM_INSTRUCTION =
  'Du hilfst beim Erfassen von Liedern für einen Hauskreis. ' +
  'Du antwortest ausschließlich mit dem geforderten JSON.';

/** Gilt für beide Wege, den billigen und den Rückfall. */
const METADATA_RULES = [
  '- `title`: nur der Liedtitel, ohne Zusätze wie "Lyrics", "Chords",',
  '  "Official Video" oder den Namen der Seite.',
  '- `artist`: die Band oder Person, die das Lied aufgenommen hat —',
  '  nicht, wer die Seite hochgeladen hat.',
  '- Schreibweise so, wie sie auf der Seite steht.',
  '- Was du nicht sicher erkennst, ist `null`. Rate nicht.',
];

@Injectable()
export class SongLookupService implements LyricsRetriever {
  private readonly logger = new Logger(SongLookupService.name);

  /**
   * Was schon einmal gefragt wurde, wird nicht noch einmal bezahlt.
   *
   * Im Speicher und nicht in Redis, weil der Server ohnehin als **genau eine**
   * Instanz läuft (die Cron-Jobs verträgen keine zweite) — es gibt also keinen
   * zweiten Prozess, mit dem etwas abzugleichen wäre.
   *
   * Nicht nach Hauskreis getrennt: „Wie heißt das Lied hinter diesem Link" ist
   * keine Frage, deren Antwort von der Gruppe abhängt. Dass die Routen trotzdem
   * hauskreisgebunden sind, ist die Zugangsprüfung, nicht der Namensraum.
   */
  private readonly metadataCache = new Expiring<SongMetadata>();
  private readonly searchCache = new Expiring<LyricsLinkCandidate[]>();

  constructor(private readonly gemini: GeminiClient) {}

  get isEnabled(): boolean {
    return this.gemini.isEnabled;
  }

  /**
   * Aus einem Link Titel und Interpret lesen.
   *
   * Zwei Wege, und der billige kommt zuerst: Wir holen die Seite selbst und
   * geben dem Modell nur ihren **Kopf** — `<title>`, die `og:`-Angaben, die
   * erste Überschrift. Das sind rund sechzig Tokens statt der ganzen Seite.
   * Eine Ultimate-Guitar-Seite wiegt 145 KB, also etwa 36.000 Tokens; sie
   * vollständig durch das Modell zu schieben, nur um eine Zeile daraus
   * abzulesen, kostete pro Knopfdruck mehr als alles andere zusammen.
   *
   * Der zweite Weg ist `url_context`, bei dem Google die Seite holt. Er bleibt,
   * weil unser eigener Abruf genau dort scheitern kann, wo er am nötigsten
   * wäre: hinter Cloudflare. Was für uns ein `403` ist, ist für Googles Index
   * eine gewöhnliche Seite.
   */
  async metadataFromLink(url: string): Promise<SongMetadata> {
    const target = safeExternalUrl(url);
    if (!target) return { title: null, artist: null };

    const cached = this.metadataCache.get(target.href);
    if (cached) return cached;

    const head = await this.pageHead(target.href);
    const result = head
      ? await this.askAboutPageHead(target.href, head)
      : await this.askViaUrlContext(target.href);

    const metadata = {
      title: cleanText(result?.title),
      artist: cleanText(result?.artist),
    };

    this.metadataCache.set(target.href, metadata);
    return metadata;
  }

  /** Der billige Weg: das Modell sieht nur den Kopf der Seite. */
  private askAboutPageHead(href: string, head: string) {
    return this.gemini.ask({
      label: 'from-link (Seitenkopf)',
      schema: metadataSchema,
      tools: [],
      timeoutMs: 12_000,
      systemInstruction: SYSTEM_INSTRUCTION,
      input: [
        'Aus diesen Angaben vom Kopf einer Webseite: um welches Lied geht es?',
        '',
        head,
        '',
        ...METADATA_RULES,
      ].join('\n'),
    });
  }

  /** Der Rückfall: Google holt die Seite, weil wir nicht durchkommen. */
  private askViaUrlContext(href: string) {
    return this.gemini.ask({
      label: 'from-link (url_context)',
      schema: metadataSchema,
      tools: [{ type: 'url_context' }],
      timeoutMs: 20_000,
      systemInstruction: SYSTEM_INSTRUCTION,
      input: [
        `Öffne ${href} und sage mir, um welches Lied es dort geht.`,
        '',
        ...METADATA_RULES,
      ].join('\n'),
    });
  }

  /**
   * Titel und `og:`-Angaben einer Seite, oder `null`.
   *
   * Bewusst mit Regex und ohne HTML-Parser: Gebraucht werden fünf Felder aus
   * dem `<head>`, und dafür ein Parser-Paket samt Baumaufbau über 145 KB zu
   * ziehen, wäre mehr Aufwand als die Aufgabe hergibt.
   */
  private async pageHead(href: string): Promise<string | null> {
    // Der `<head>` steht am Anfang. 32 KB reichen dafür mit Abstand, und die
    // restlichen 113 KB einer Ultimate-Guitar-Seite gehen uns nichts an.
    const response = await this.probe(href, 'GET', 'bytes=0-32768');
    if (!response || response.status >= 400) return null;

    let html: string;
    try {
      html = await response.text();
    } catch {
      return null;
    }

    const lines = [
      ['Seitentitel', firstMatch(html, /<title[^>]*>([^<]{1,300})<\/title>/i)],
      ['og:title', metaContent(html, 'og:title')],
      ['og:description', metaContent(html, 'og:description')],
      ['Interpret laut Seite', metaContent(html, 'music:musician')],
      ['Erste Überschrift', firstMatch(html, /<h1[^>]*>([^<]{1,300})<\/h1>/i)],
    ].flatMap(([label, value]) => (value ? [`${label}: ${value}`] : []));

    // Nichts Verwertbares gefunden — dann lieber Google fragen, als das Modell
    // über einer leeren Seite raten zu lassen.
    return lines.length > 0 ? lines.join('\n') : null;
  }

  /**
   * Zu Titel und Interpret einen Link suchen.
   *
   * Zwei Dinge sind hier wichtig und leicht zu übersehen:
   *
   * 1. Die URL kommt aus dem **JSON**, nie aus den Zitat-Angaben der
   *    Grounding-Antwort. Die sind Weiterleitungen über Google und laufen nach
   *    einigen Wochen ab — als gespeicherter Link wären sie eine Zeitbombe.
   * 2. Ein Sprachmodell schreibt überzeugende URLs auf, die es nie gab.
   *    Deshalb wird jeder Vorschlag danach tatsächlich abgerufen.
   *
   * Bewusst **ohne** `url_context`: Mit beiden Werkzeugen zusammen ruft das
   * Modell jede gefundene Seite selbst noch auf, und der Aufruf lief gemessen
   * über zwei Minuten, ohne fertig zu werden. Suchen kann es, Nachsehen tun
   * wir gleich selbst — und zwar für alle Kandidaten parallel.
   *
   * **`more` ist der zweite Druck auf denselben Knopf.** Ohne ihn kam bisher
   * immer wieder derselbe Zwischenspeicher-Eintrag: wer einen schlechten
   * Vorschlag bekommen hatte, bekam ihn beliebig oft wieder. Mit ihm bleibt das
   * Bekannte stehen, und daneben wird **gezielt** weitergesucht — die bekannten
   * Adressen gehen als „kennen wir schon" mit in die Anfrage.
   */
  async search(
    title: string,
    artist?: string,
    more = false,
  ): Promise<LyricsLinkCandidate[]> {
    const key = `${title.toLowerCase()}|${artist?.toLowerCase() ?? ''}`;
    const known = this.searchCache.get(key);

    // `undefined` und `[]` sind hier zweierlei: ein gespeichertes „nichts
    // gefunden" wird beim ersten Druck weiterhin nicht noch einmal bezahlt.
    if (!more && known) return known;

    const found = await this.searchUncached(
      title,
      artist,
      (known ?? []).map((candidate) => candidate.url),
    );

    const merged = mergeByUrl(known ?? [], found).slice(0, MAX_TOTAL);
    this.searchCache.set(key, merged);
    return merged;
  }

  private async searchUncached(
    title: string,
    artist: string | undefined,
    /** Was schon dasteht — soll nicht noch einmal kommen. */
    exclude: readonly string[],
  ): Promise<LyricsLinkCandidate[]> {
    const result = await this.gemini.ask({
      label: 'link-suggestions',
      schema: candidatesSchema,
      tools: [{ type: 'google_search' }],
      timeoutMs: 30_000,
      systemInstruction: SYSTEM_INSTRUCTION,
      input: [
        `Suche eine Seite mit Text oder Akkorden zum Lied „${title}"` +
          (artist ? ` von ${artist}.` : '.'),
        '',
        'Bevorzugte Seiten, in dieser Reihenfolge:',
        ...LYRICS_SITE_PREFERENCE.map((site, index) => `${index + 1}. ${site}`),
        '',
        `- Höchstens ${MAX_CANDIDATES} Vorschläge, höchstens einer pro Seite.`,
        '- Nur die Seite zu genau diesem Lied, keine Übersichten,',
        '  Bestenlisten, Alben- oder Interpretenseiten.',
        // Die Suche driftet sonst auf das naechstbeste Lied derselben Band ab.
        // Ein anderes Lied ist hier schlimmer als gar kein Ergebnis.
        `- Der Titel muss „${title}" sein, nicht ein ähnlicher.`,
        '  Ein anderes Lied derselben Band ist kein Treffer.',
        '- `title` und `artist` so, wie sie auf der gefundenen Seite stehen —',
        '  daran ist zu erkennen, ob der Vorschlag passt.',
        '- `url` muss eine Adresse sein, die du in den Suchergebnissen',
        '  wirklich gesehen hast. Erfinde keine.',
        // Jede weitere Suchanfrage ist eine Runde mehr, die nacheinander läuft
        // — und bei den 3er-Modellen zusätzlich eine eigene Abrechnungszeile.
        '- Eine einzige, gezielte Suche genügt. Keine Nachfassversuche.',
        '- Findest du nichts Passendes, gib eine leere Liste zurück.',
        // Beim zweiten Druck: was schon dasteht, hat der Mensch gesehen und für
        // nicht gut befunden. Noch einmal dasselbe wäre der Zustand, den dieser
        // Knopf gerade auflösen soll.
        ...(exclude.length > 0
          ? [
              '',
              'Diese Adressen sind schon bekannt und zählen nicht als Treffer.',
              'Suche gezielt andere Seiten zu demselben Lied:',
              ...exclude.map((url) => `- ${url}`),
            ]
          : []),
      ].join('\n'),
    });

    if (!result) return [];

    // Nachsehen kommt vor Sortieren, und das ist keine Geschmacksfrage: Vor dem
    // Abruf weiß niemand, auf welche Seite ein Vorschlag überhaupt zeigt.
    const resolved = await Promise.all(
      result.candidates
        .slice(0, MAX_CANDIDATES * 2)
        .map((raw) => this.resolve(raw)),
    );

    const bekannt = new Set(exclude);

    // Ein zweites Mal aussortieren, und nicht aus Misstrauen allein: das Modell
    // hält sich nicht immer an die Liste, **und** `resolve` folgt
    // Weiterleitungen — ein neuer Link kann am Ende auf einer längst bekannten
    // Seite landen.
    const neu = resolved.filter(
      (entry): entry is LyricsLinkCandidate =>
        entry !== null && !bekannt.has(entry.url),
    );

    return rank(dedupeBySite(neu)).slice(0, MAX_CANDIDATES);
  }

  /**
   * Ruft einen Vorschlag ab und macht daraus einen Kandidaten — oder nichts.
   *
   * **Die entscheidende Zeile ist `response.url`.** Das Grounding liefert seine
   * Fundstellen als Weiterleitungen über `vertexaisearch.cloud.google.com`
   * aus, und die laufen nach einigen Wochen ab. Gespeichert würde daraus ein
   * Link, der beim Anlegen funktioniert und im Herbst ins Leere zeigt. Wir
   * folgen der Weiterleitung deshalb bis zum Ziel und behalten **dieses**.
   *
   * `403` zählt als „gibt es". Ultimate Guitar antwortet einem Server-Aufruf
   * mit Cloudflares Prüfseite, liefert für ein nicht existierendes Lied aber
   * weiterhin `404` — die Unterscheidung, auf die es ankommt, bleibt erhalten.
   * Wer den Link später im Browser öffnet, sieht ohnehin die Seite.
   */
  private async resolve(raw: {
    url: string;
    title: string | null;
    artist: string | null;
  }): Promise<LyricsLinkCandidate | null> {
    // Vor dem Abruf nur das, was ohne Netz zu klären ist: kein privates Netz,
    // keine Zugangsdaten. Ob die Adresse taugt, entscheidet ihr Ziel.
    const requested = safeExternalUrl(raw.url);
    if (!requested) return null;

    const head = await this.probe(requested.href, 'HEAD');

    // Manche Server kennen HEAD nicht. Dann eben ein GET, aber nur das erste
    // Byte — ein Akkordblatt komplett zu laden, nur um zu wissen, dass es da
    // ist, wäre Verschwendung.
    const response =
      head && (head.status === 405 || head.status === 501)
        ? await this.probe(requested.href, 'GET', 'bytes=0-0')
        : head;

    if (!response) return null;
    if (response.status >= 400 && response.status !== 403) return null;

    return toCandidate(response.url, raw);
  }

  private async probe(
    url: string,
    method: 'HEAD' | 'GET',
    range?: string,
  ): Promise<Response | null> {
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        // Die Prüfungen laufen parallel, es zählt also nur der langsamste
        // Kandidat — und genau den merkt man vor dem Knopf.
        signal: AbortSignal.timeout(3_000),
        headers: {
          // Ohne einen Browser-Kopf antworten einige Seiten gar nicht.
          'User-Agent':
            'Mozilla/5.0 (compatible; HauskreisApp/1.0; +https://github.com/)',
          ...(range ? { Range: range } : {}),
        },
      });
    } catch (error) {
      this.logger.debug(
        `${url} nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

/**
 * Ein kleiner Zwischenspeicher mit Verfallsdatum.
 *
 * **Auch ein leeres Ergebnis wird behalten.** Sonst kostete ausgerechnet der
 * Fall, der nichts findet, bei jedem Druck aufs Neue — und das ist der Fall,
 * bei dem Leute am ehesten ein zweites Mal drücken.
 */
class Expiring<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxEntries = 200,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    // `Map` merkt sich die Einfügereihenfolge, der erste Schlüssel ist also der
    // älteste. Mehr Verdrängungslogik lohnt bei zweihundert Einträgen nicht.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }

    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

/** Leerstring und Whitespace sind kein Titel, sondern ein fehlender Titel. */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Der erste Treffer einer Gruppe, entschärft und gekürzt. */
function firstMatch(html: string, pattern: RegExp): string | null {
  return cleanText(decodeEntities(pattern.exec(html)?.[1] ?? ''));
}

/** `<meta property="og:title" content="…">`, in beliebiger Attributreihenfolge. */
function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
    'i',
  );
  const tag = pattern.exec(html)?.[0];
  if (!tag) return null;

  return firstMatch(tag, /content=["']([^"']{1,300})["']/i);
}

/**
 * Die Handvoll Entities, die in Songtiteln wirklich vorkommen.
 *
 * `&amp;` steht in jedem zweiten Titel mit „and", und `&#39;` in jedem
 * englischen Genitiv. Eine vollständige Entity-Tabelle wäre für einen Titel,
 * den gleich ein Sprachmodell liest, deutlich zu viel Aufwand.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Eine URL, die wir von hier aus abrufen dürfen.
 *
 * `null` für alles, was nicht öffentlich ist. Der Server soll nicht zu einem
 * Werkzeug werden, mit dem sich das interne Netz abklopfen lässt, nur weil
 * jemand eine Adresse in ein Formularfeld schreibt.
 */
function safeExternalUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (isPrivateHost(url.hostname)) return null;

  return url;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  // Ein Hostname ohne Punkt ist im Netz nicht auflösbar — also ein Nachbar im
  // eigenen (Container-)Netz, etwa `keycloak`.
  if (!host.includes('.') && !host.includes(':')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;

  const [a, b] = ipv4.slice(1).map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Aus der **aufgelösten** Adresse wird ein Kandidat — oder nichts.
 *
 * Alles hier geprüfte bezieht sich auf das Ziel der Weiterleitung, nicht auf
 * das, was das Modell geschrieben hat: erst dort steht, ob es eine Songseite
 * ist, eine Startseite oder ein YouTube-Video.
 */
function toCandidate(
  finalUrl: string,
  raw: { title: string | null; artist: string | null },
): LyricsLinkCandidate | null {
  const url = safeExternalUrl(finalUrl);

  // Nur https: einen Link, der später auf jedem Handy in der Gruppe geöffnet
  // wird, geben wir nicht unverschlüsselt weiter.
  if (!url || url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  // Die Startseite einer Lyrics-Seite ist kein Lied — und eine Weiterleitung
  // dorthin ist ein „gibt es nicht" mit freundlicherem Statuscode.
  if (url.pathname === '/') return null;
  if (NEVER_LINK.some((blocked) => isOn(host, blocked))) return null;

  const site = LYRICS_SITE_PREFERENCE.find((preferred) =>
    isOn(host, preferred),
  );

  return {
    url: url.href,
    title: cleanText(raw.title),
    artist: cleanText(raw.artist),
    site: site ?? host,
  };
}

/** Der Host ist die Seite selbst oder eine ihrer Unterdomains. */
function isOn(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

/**
 * Was schon dastand, plus was gerade dazukam — entdoppelt **nur über die URL**.
 *
 * Zwei Entscheidungen, die beide leicht anders ausfallen könnten:
 *
 * 1. **Kein `dedupeBySite` über die Läufe hinweg.** Innerhalb eines Laufs
 *    bleibt es (drei Links auf dasselbe Genius sind eine Möglichkeit), aber ein
 *    *zweiter* Ultimate-Guitar-Link aus dem zweiten Lauf ist genau der Punkt:
 *    die erste Wahl von dort war ja nicht gut, sonst drückte niemand noch mal.
 * 2. **Kein Neusortieren der Gesamtliste.** `rank` läuft je Lauf; danach bleibt
 *    die Reihenfolge stehen. Sonst verschöbe sich unter dem Finger, was man
 *    gerade lesen wollte.
 */
function mergeByUrl(
  known: readonly LyricsLinkCandidate[],
  found: readonly LyricsLinkCandidate[],
): LyricsLinkCandidate[] {
  const seen = new Set(known.map((candidate) => candidate.url));

  return [...known, ...found.filter((candidate) => !seen.has(candidate.url))];
}

/**
 * Ein Vorschlag pro Seite. Drei Links auf dasselbe Genius sind keine drei
 * Möglichkeiten, sondern eine — und zwei davon verstellen die Sicht.
 */
function dedupeBySite(
  candidates: LyricsLinkCandidate[],
): LyricsLinkCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (seen.has(candidate.site)) return false;
    seen.add(candidate.site);
    return true;
  });
}

/**
 * Bevorzugte Seiten nach oben, der Rest behält seine Reihenfolge — `sort` ist
 * stabil, und die Reihenfolge des Modells ist bei gleichem Rang die bessere
 * Auskunft als irgendein Alphabet.
 */
function rank(candidates: LyricsLinkCandidate[]): LyricsLinkCandidate[] {
  const rankOf = (site: string) => {
    const index = LYRICS_SITE_PREFERENCE.indexOf(site);
    return index === -1 ? LYRICS_SITE_PREFERENCE.length : index;
  };

  return candidates.toSorted(
    (left, right) => rankOf(left.site) - rankOf(right.site),
  );
}
