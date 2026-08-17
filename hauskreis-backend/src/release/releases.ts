/**
 * Was es Neues gibt — und der Auslöser für die Benachrichtigung darüber.
 *
 * **Der Eintrag ist der Auslöser, nicht die Versionsnummer.** Das ist die
 * Antwort auf die Frage, wann eine Ankündigung rausgeht und wann nicht: Die
 * Entscheidung, dass etwas eine wert ist, trifft man beim Schreiben. Ein
 * Commit, der einen Tippfehler behebt, schreibt keinen Eintrag — also passiert
 * nichts. Eine Versionsnummer hochzuzählen bewirkt für sich genommen ebenfalls
 * nichts.
 *
 * Dass die Datei im Backend liegt, ist kein Zufall: Die CI baut das Image,
 * sobald sich etwas unter `hauskreis-backend/**` ändert. Den Eintrag zu
 * schreiben ist damit genau der Vorgang, der den Deploy und die Ankündigung
 * auslöst.
 *
 * **Ein Release ist nicht ein Commit.** Die Commit-Betreffs dieses Projekts
 * lesen sich zwar schon fast wie Stichpunkte („feat(darstellung): Dunkelmodus,
 * hell oder wie das Gerät"), aber fünf Commits an einem Abend sind eine
 * Ankündigung, nicht fünf. Zusammenfassen, in der Sprache der App: was man
 * jetzt tun kann, nicht was geändert wurde.
 *
 * Neueste zuerst. Die Reihenfolge ist verbindlich — `latestRelease()` nimmt
 * das erste Element, und `ReleaseAnnouncementService` kündigt genau das an.
 */
export interface Release {
  /** Frei wählbar, muss nur eindeutig sein. Sie steht in der Adresse `/neu?v=…`. */
  version: string;
  /** Der Tag der Veröffentlichung, `YYYY-MM-DD`. */
  date: string;
  /** Eine Zeile, die in eine Push-Nachricht passt. */
  title: string;
  /** Was dazugekommen ist, aus Sicht dessen, der es benutzt. */
  highlights: string[];
}

export const RELEASES: readonly Release[] = [
  {
    version: '1.2.0',
    date: '2026-08-17',
    title: 'Eine Hilfe-Seite, und die App reicht bis unter die Notch',
    highlights: [
      'Neu: „Hilfe" im Profil — rund 70 Fragen mit Suche, von den Vorschlägen über das Baukasten-System bis zum Datenschutz.',
      'Wenn es etwas Neues gibt, siehst du das jetzt am Profil-Symbol: ein Punkt, der verschwindet, sobald du es angesehen hast.',
      'Kein schwarzer Balken mehr über der App — Kopfbild und Hintergrund gehen bis hinter die Notch durch.',
      'In der App steht jetzt, wer sie gebaut hat.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-17',
    title: 'Darkmode, Manueller Refresh und Design-Updates',
    highlights: [
      'Neu: Darkmode — im Profil unter „Darstellung“ aktivierbar.',
      'Manueller Refresh per Zieh-Geste.',
      'Offline-Nutzung.',
      'Natives Design: Verbesserte Einbettung in iOS und Android, neue App-Icons, neue Splash-Screens.',
      'Wer den Hauskreis verlässt und später zurückkommt, findet seine Abende im Archiv wieder unter seinem Namen.',
    ],
  },
] as const;

/** Die Fassung, die gerade gilt. */
export function latestRelease(): Release {
  const latest = RELEASES[0];
  if (!latest) {
    throw new Error(
      'RELEASES ist leer — es muss mindestens einen Eintrag geben',
    );
  }
  return latest;
}
