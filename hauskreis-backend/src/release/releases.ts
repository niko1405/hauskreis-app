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
    version: '1.4.1',
    date: '2026-08-19',
    title: 'Fix: Einladungen und weitere Verbesserungen',
    highlights: [
      'Das Einladungssystem wurde überprüft und verbessert, sodass Einladungen jetzt zuverlässig ankommen und angenommen werden können.',
      'Wer schon ein Acts2-Konto hat, muss über den Einladungslink kein neues Passwort mehr setzen — und bekommt überhaupt erst eine Mail.',
      'Bei fester Geschenk-Zuteilung ist wieder jede:r genau einmal dran. Wer neu dazukommt, bekommt nicht nur jemanden, sondern besorgt auch selbst ein Geschenk.',
      'Wer den Hauskreis verlassen hat, steht in keiner Auswahl und in keiner Vorschlagsliste mehr.',
      'Die App gibt beim Antippen sofort nach und zeigt oben einen Strich, solange etwas lädt — auch bei schlechter Verbindung merkt man jetzt, dass sie zugehört hat.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-18',
    title: 'Geburtstage und Geschenksystem',
    highlights: [
      'Neu: Geburtstage. Sie stehen im Kalender, in der Terminliste und in einem eigenen Register — sobald jemand seinen im Profil einträgt.',
      'Für jeden Geburtstag ist eine Person für das Geschenk zuständig. Der Reihe nach: Du bekommst den, dessen Geburtstag nach deinem kommt. Zwei Wochen vorher steht die Zuteilung fest.',
      'Geschenk-Ideen sammeln und darüber abstimmen. Wer zuständig ist, sucht aus und trägt den Preis ein — wer Geburtstag hat, sieht davon nichts.',
      'Der Hauskreis kann das Ganze auch ausschalten oder fest zuteilen (Verwaltung).',
      'Beim Hochladen eines Profil- oder Hintergrundbilds wählst du jetzt selbst den Ausschnitt, statt dass aus der Mitte geschnitten wird.',
      'Der Zurück-Pfeil auf Termin- und Themenseiten hängt nicht mehr unter der Notch.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-17',
    title: 'Gebetsanliegen an Terminen',
    highlights: [
      'Neu: Gebetsanliegen. Jede:r kann zu einem Abend ein Anliegen hinschreiben — auch wer an dem Abend nicht dabei ist.',
      'Wer eingeladen, aber noch nie angemeldet war, taucht nicht mehr in den Gebetsbuddys, den Vorschlägen und der Anwesenheit auf. Sobald die Einladung angenommen ist, kommt die Person überall dazu.',
      'Der Anmeldename steht jetzt beim Konto, direkt über der E-Mail-Adresse.',
      'Wird die Musik-Zuteilung eines kommenden Abends leer, werden auch die abgehakten Lieder wieder frei.',
      'Lied-Vorschläge lassen sich nur noch im Bearbeitungsmodus löschen.',
      'Auf dem Handy quetschen viele Abzeichen den Namen nicht mehr weg, und das Archiv kommt ohne Hintergrundbild aus.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-16',
    title: 'FAQ-Hilfe, Design-Updates und App-Info',
    highlights: [
      'Neu: „Hilfe" im Profil — rund 70 Fragen mit Suche, von den Vorschlägen über das Baukasten-System bis zum Datenschutz.',
      'Wenn es etwas Neues gibt, siehst du das jetzt am Profil-Symbol: ein Punkt, der verschwindet, sobald du es angesehen hast.',
      'Kein schwarzer Balken mehr über der App — Kopfbild und Hintergrund gehen bis hinter die Notch durch.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-15',
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
