/**
 * Was in der Hilfe steht.
 *
 * **Im Frontend und nicht hinter einem Endpunkt.** Der Text beschreibt die
 * Oberfläche, nicht die Daten; er ändert sich mit dem Frontend-Deploy und mit
 * nichts sonst. Vor allem aber ist er als Teil des Bündels **ohne Netz da** —
 * und eine Hilfeseite, die man nur mit Internet lesen kann, hilft genau dann
 * nicht, wenn man sie braucht. Über die API käme sie nicht: Der Service Worker
 * holt alles von dort mit `NetworkOnly` (`app/sw.ts`).
 *
 * **Fachlich, nicht technisch.** „Wenn niemand für die Musik eingetragen ist,
 * darf trotzdem niemand die Lieder abhaken" — nicht „die Rechteprüfung schlägt
 * fehl". Keine Tabellennamen, keine Endpunkte, keine Feldnamen. Wer hier liest,
 * will wissen, was passiert, nicht wo es steht.
 *
 * **Nachgesehen, nicht erinnert.** Jede Aussage, die eine Regel behauptet („nur
 * wer zugeteilt ist", „ab der Treffpunktzeit", „alle zwei Wochen"), steht so im
 * Code, der sie durchsetzt — nicht bloß so in CLAUDE.md. Wer eine Regel ändert,
 * ändert den Eintrag mit; eine Hilfe, die einmal daneben lag, glaubt man auch
 * beim nächsten Mal nicht.
 */

export const FAQ_CATEGORIES = [
  { id: 'start', label: 'Erste Schritte' },
  { id: 'suggestions', label: 'Vorschläge' },
  { id: 'meetings', label: 'Termine' },
  { id: 'topics', label: 'Themen' },
  { id: 'songs', label: 'Musik & Lieder' },
  { id: 'locations', label: 'Orte & Hosten' },
  { id: 'prayer', label: 'Gebetsbuddys' },
  { id: 'birthdays', label: 'Geburtstage' },
  { id: 'notes', label: 'Nachbereitung' },
  { id: 'account', label: 'Konto & Hauskreis' },
  { id: 'app', label: 'Darstellung & Technik' },
  { id: 'privacy', label: 'Datenschutz' },
  { id: 'admin', label: 'Verwaltung' },
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]['id'];

export interface FaqEntry {
  /** Stabil — er landet im Anker und in der Suchergebnis-Liste. */
  id: string;
  category: FaqCategory;
  question: string;
  /**
   * Drei Regeln, mehr kann der Text nicht:
   *
   * - `\n\n` trennt Absätze, `\n` trennt Zeilen (für Aufzählungen).
   * - `**fett**` hebt hervor. Sparsam — hervorgehoben wird der eine Satz, auf
   *   den es ankommt, sonst hebt sich nichts mehr ab.
   * - Sonst nichts. Ein ganzer Markdown-Übersetzer wäre für zwei
   *   Auszeichnungen zu viel Gepäck.
   */
  answer: string;
  /**
   * Nur für Admins sichtbar — samt Treffern in der Suche. Das ist Kosmetik,
   * keine Absicherung: Wer die Endpunkte kennt, bekommt trotzdem sein `403`.
   */
  adminOnly?: boolean;
  /** Wonach jemand sucht, ohne dass es im Text vorkommt. */
  keywords?: string[];
}

/**
 * Die eine Frage, auf die der Punkt am Profil beim allerersten Start zeigt.
 *
 * Als Konstante und nicht als Zeichenkette an zwei Orten: Der
 * Hilfe-Bildschirm schlägt genau diesen Eintrag auf, und würde er umbenannt,
 * zeigte der Wegweiser stumm ins Leere. So bricht stattdessen der Typecheck.
 */
export const FIRST_STEPS_ID = 'profil-setup';

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  // ── Erste Schritte ────────────────────────────────────────────────────────
  {
    id: 'start-was-ist-das',
    category: 'start',
    question: 'Wofür ist Acts2 da?',
    answer:
      'Acts2 nimmt dem Hauskreis die Organisation ab, die vorher in WhatsApp verstreut war: wer wann hostet, wer das Thema vorbereitet, wer Musik macht, welche Lieder drankommen, wer mit wem betet, und was man sich für die Woche vorgenommen hat.\n\nAlles steht an einem Ort und bleibt dort. Nichts geht mehr im Chat unter, und das Archiv erinnert sich an Abende, die drei Monate zurückliegen.',
    keywords: ['app', 'zweck', 'wozu', 'überblick'],
  },
  {
    id: 'start-anmelden',
    category: 'start',
    question: 'Wie melde ich mich an?',
    answer:
      'Mit deinem Anmeldenamen **oder** deiner E-Mail-Adresse und deinem Passwort. Beides funktioniert.\n\nDeinen Zugang hast du beim Einladen per Mail bekommen: Über den Link darin suchst du dir einen Anmeldenamen aus und legst dein Passwort fest. Danach bist du direkt drin.',
    keywords: ['login', 'einloggen', 'passwort', 'benutzername'],
  },
  {
    id: 'start-installieren',
    category: 'start',
    question: 'Wie bekomme ich die App auf den Startbildschirm?',
    answer:
      'Es gibt sie nicht im App Store — sie läuft im Browser und lässt sich von dort ablegen.\n\n**iPhone:** In Safari öffnen, unten auf Teilen tippen, „Zum Home-Bildschirm". Nur so funktionieren übrigens auch die Benachrichtigungen; im normalen Safari-Tab schaltet Apple sie ab.\n\n**Android:** Chrome bietet „App installieren" von selbst an, sonst steht es im Menü oben rechts.\n\nEin Hinweis fürs iPhone: Eine App vom Home-Bildschirm hat dort **ihren eigenen Speicher**, getrennt von Safari. Öffne sie nach dem Installieren einmal mit Internet — sonst hat sie beim ersten Start im Flugmodus noch nichts, was sie zeigen könnte.',
    keywords: ['pwa', 'installieren', 'homescreen', 'startbildschirm', 'ios'],
  },
  {
    id: 'profil-setup',
    category: 'start',
    question: 'Was sind erste Schritte?',
    answer:
      'Folgendes passiert ausschließlich über das Profil - das sind sinnvolle Schritte sobald du dich registriert und eingeloggt hast:\n\n1. Lege deinen Anzeigenamen und Profilbild im oberen Abschnitt fest. Trage außerdem deinen Geburtstag ein.\n2. Lege fest, ob du ein Instrument spielst und aktiviere die automatische Zusage-Funktion unter "Deine Angaben"\n3. Trage im Abschnitt "Wo du wohnst" die Adresse deiner Wohnung sowie die Kapazität dazu ein.\n4. Aktiviere Benachrichtigungen im unteren Abschnitt und lege dort deine Präferenzen fest.\n5. Wähle im Abschnitt "Darstellung" dein bevorzugtes helles/dunkles Design, ganz nach deinem Geschmack.\n6. Für Admins: Öffne die Admin-Verwaltung und erkunde die Funktionen (mehr dazu unter "Verwaltung").',
    keywords: ['erste', 'schritte', 'profil', 'einrichtung', 'setup', 'neu'],
  },
  {
    id: 'start-navigation',
    category: 'start',
    question: 'Was steht auf welchem Bildschirm?',
    answer:
      '**Heute** — der nächste Abend, deine eigenen Aufgaben als Abzeichen, der offene Actionstep, deine aktuellen Gebetsbuddys und die Frage, ob du dabei bist.\n\n**Termine** — alle kommenden Abende, wahlweise als Liste, als Planungstabelle über mehrere Wochen oder als Kalender.\n\n**Gebet** — die laufende Gebetsrunde und wer mit wem betet.\n\n**Archiv** — Themen, die Lieder-Datenbank, die Orte und vergangene Abende. Hier legst du auch Neues an, ohne auf einen Dienstag zu warten.\n\n**Profil** — deine Angaben, Abwesenheiten, Benachrichtigungen, Darstellung, dein Zuhause und diese Hilfe.',
    keywords: ['menü', 'tabs', 'bildschirme', 'navigation', 'wo finde ich'],
  },

  // ── Vorschläge ────────────────────────────────────────────────────────────
  {
    id: 'suggestions-wie',
    category: 'suggestions',
    question: 'Wie kommt die App auf ihre Vorschläge?',
    answer:
      'Sie sortiert alle in Frage kommenden Leute nach vier Dingen, in dieser Reihenfolge:\n\n1. **Wer gerade am wenigsten zu tun hat.** Gezählt wird über alle Aufgaben hinweg — Gastgeber, Thema, Musik, Testimony — und zwar für die nächsten acht Wochen. Was danach kommt, zählt nicht mit.\n2. **Wer am längsten nicht mehr diese eine Aufgabe hatte.** Wer sie noch nie hatte, steht ganz oben.\n3. **Wer sie insgesamt am seltensten hatte.**\n4. Der Name, damit die Liste beim Neuladen nicht durcheinandergerät.\n\nNeben jedem Namen stehen die Fakten, die zu dieser Reihenfolge geführt haben: wann derjenige zuletzt dran war, wie oft insgesamt, und was er sonst noch vor sich hat.',
    keywords: ['smart', 'reihenfolge', 'sortierung', 'algorithmus', 'fair'],
  },
  {
    id: 'start-nichts-automatisch',
    category: 'suggestions',
    question: 'Teilt die App irgendetwas von selbst zu?',
    answer:
      'Nein. Das ist der wichtigste Satz über diese App: Sie **schlägt vor**, eintragen tut ein Mensch.\n\nJedes Feld bleibt leer, bis jemand es füllt — Gastgeber, Thema, Musik, Testimony. Die App rechnet nur aus, wer am besten passen würde, und legt die Gründe daneben. Was daraus wird, entscheidet ihr.\n\nDrei Dinge macht sie ohne Rückfrage, und alle drei nehmen niemandem etwas ab: Sie legt kommende Termine an, sie würfelt die Gebetsgruppen, und sie sagt einen Abend ab, wenn wirklich alle abgesagt haben.',
    keywords: ['automatisch', 'zwang', 'einteilen', 'zuteilung'],
  },
  {
    id: 'suggestions-nie-dran',
    category: 'suggestions',
    question: 'Warum steht jemand oben, der noch nie dran war?',
    answer:
      'Genau deshalb. „Noch nie" ist die längste denkbare Pause, und die App behandelt sie auch so.\n\nDas ist der Grund, warum am Anfang und nach einem Neuzugang die Reihenfolge etwas ungewohnt aussieht: Wer neu dabei ist, steht überall oben, bis er einmal dran war.',
    keywords: ['neu', 'noch nie', 'erste mal'],
  },
  {
    id: 'suggestions-zurueckgestellt',
    category: 'suggestions',
    question: 'Was heißt „Zurückgestellt"?',
    answer:
      'Der Vorschlag wäre an sich dran, aber gerade spricht etwas dagegen. Er verschwindet nicht — er rutscht nur ans Ende, damit du ihn trotzdem wählen kannst, wenn du es besser weißt.\n\nEs gibt drei Gründe:\n\n**„ist in dem Zeitraum weg"** — es ist eine Abwesenheit eingetragen.\n\n**„Wohnung zu klein für die erwartete Runde"** — für die Wohnung ist eine Kapazität hinterlegt, und es kommen an diesem Abend mehr Leute.\n\n**„im Haushalt ist schon jemand anders dran"** — jemand aus derselben Wohnung hat an diesem Abend bereits eine andere Aufgabe.',
    keywords: ['grau', 'unten', 'ausgeblendet', 'weg', 'zu klein'],
  },
  {
    id: 'suggestions-mehrteilig',
    category: 'suggestions',
    question: 'Zählt ein Thema über mehrere Abende auch mehrfach?',
    answer:
      'Nein, es zählt **einmal**. Drei Abende zum selben Thema sind eine Vorbereitung, nicht drei.\n\nWürde jeder Abend einzeln zählen, wäre man nach einem mehrteiligen Thema für Monate ganz unten in jeder Liste — und niemand würde je wieder etwas Mehrteiliges anfangen.\n\nBei Gastgeber, Musik und Testimony ist ein Abend dagegen ein Abend.',
    keywords: ['mehrteilig', 'reihe', 'zählt', 'doppelt'],
  },
  {
    id: 'suggestions-fehlt-jemand',
    category: 'suggestions',
    question: 'Warum taucht jemand gar nicht in den Vorschlägen auf?',
    answer:
      'Wer für den Abend **abgesagt** hat, wird nicht vorgeschlagen — sonst würde die App etwas anbieten, das sie danach selbst ablehnt.\n\nBei der **Musik** kommen nur Leute vor, die im Profil angegeben haben, dass sie ein Instrument spielen. Eintragen lässt sich trotzdem jede:r — der Haken steuert nur den Vorschlag.\n\nBeim **Gastgeber** fällt heraus, wer keine Adresse hinterlegt hat oder den Haken „Ich kann gerade hosten" herausgenommen hat.\n\nBeim **Testimony** gibt es keine Einschränkung. Eine Geschichte hat jede:r.',
    keywords: ['fehlt', 'nicht dabei', 'unsichtbar', 'instrument'],
  },
  {
    id: 'suggestions-wohnungen',
    category: 'suggestions',
    question:
      'Warum sortiert die App beim Gastgeber Wohnungen und nicht Leute?',
    answer:
      'Weil beim Hosten Person und Ort eine einzige Entscheidung sind. Die App bringt deshalb erst die Wohnungen in eine Reihenfolge und schaut dann, wer darin wohnt.\n\nDas hat eine Folge, die man kennen sollte: **Wer zusammen wohnt, teilt sich einen Platz in der Reihenfolge.** Zwei Mitbewohner sind für den Rhythmus ein Zuhause, nicht zwei — sonst wäre die Gruppe doppelt so oft bei ihnen.\n\nGerechnet wird dabei nicht in Prozent über die ganze Zeit, sondern als eine Art Guthaben: Für jeden vergangenen Abend bekommt jede Wohnung, die damals verfügbar war, ein Stück gutgeschrieben, und wer gehostet hat, gibt eines aus. Das Guthaben ist nach oben gedeckelt — nach einer langen Abwesenheit ist man nicht zehnmal hintereinander dran, sondern nach ein paar Abenden wieder im Takt.',
    keywords: ['host', 'gastgeber', 'wg', 'zusammen wohnen', 'guthaben'],
  },
  {
    id: 'suggestions-abgesagt',
    category: 'suggestions',
    question: 'Zählen abgesagte Abende mit?',
    answer:
      'Nein, in keine Richtung. Ein Abend, der nicht stattgefunden hat, gilt weder als „du warst doch gerade erst dran" noch als eine Runde, in der jemand hätte drankommen können.',
    keywords: ['ausgefallen', 'abgesagt', 'zählt'],
  },

  // ── Termine ───────────────────────────────────────────────────────────────
  {
    id: 'meetings-woher',
    category: 'meetings',
    question: 'Woher kommen die Termine?',
    answer:
      'Die App legt sie nachts selbst an, so dass immer **sieben** im Voraus stehen — an dem Wochentag und zu der Uhrzeit, die für die Gruppe eingestellt sind (Vorgabe: Dienstag, 18 Uhr).\n\nDer **letzte reguläre Abend im Monat** wird dabei als „Lobpreis & Gebet" angelegt, alle anderen als Hauskreis-Abend.\n\nEin Datum, an dem schon etwas steht, lässt sie in Ruhe. Ein selbst angelegter Geburtstag wird also nicht überschrieben — und in eine mehrtägige Freizeit schiebt sie auch keinen Dienstagabend hinein.',
    keywords: ['generiert', 'automatisch', 'sieben', 'vorausplanen'],
  },
  {
    id: 'meetings-arten',
    category: 'meetings',
    question: 'Was ist der Unterschied zwischen den Terminarten?',
    answer:
      '**Hauskreis-Abend** — der Normalfall: Thema und Lieder sind vorbereitet.\n\n**Lobpreis & Gebet** — statt eines Themas ein Testimony, dazu Lieder. Kommt automatisch am letzten Abend des Monats.\n\n**Besonderer Termin** — alles selbst gebaut: ein Geburtstag, ein Grillabend, eine Freizeit über mehrere Tage. Er startet **ganz ohne Bausteine**, weil ein Geburtstag nicht unfertig aussehen soll, nur weil er kein Thema hat.\n\nDie Art lässt sich jederzeit ändern. Wenn du das tust, springen die Bausteine auf die Voreinstellung der neuen Art — aus einem Geburtstag wird wieder ein ganzer Hauskreis-Abend und nicht eine leere Hülle mit neuem Namen.',
    keywords: ['standard', 'lobpreis', 'custom', 'geburtstag', 'freizeit'],
  },
  {
    id: 'meetings-bausteine',
    category: 'meetings',
    question: 'Was sind die Bausteine, und was kann ich an- und ausschalten?',
    answer:
      'Ein Abend besteht aus Teilen, die du einzeln zu- und wegschalten kannst: **Thema**, **Lieder** und **Testimony**. Die Terminart ist nur die Voreinstellung dafür.\n\nDie **Nachbereitung** ist der vierte Teil, steht aber bewusst nicht im Kasten — sie lässt sich erst ab dem Beginn des Abends dazuschalten. Vorher gäbe es ja nichts nachzubereiten.\n\nEinen Schalter für den Gastgeber gibt es nicht: Man trifft sich immer irgendwo. Ein Abend im Schlosspark hat einfach kein Zuhause als Ort — das Feld bleibt leer, und das ist kein Fehler.',
    keywords: ['slots', 'schalter', 'baukasten', 'thema', 'lieder'],
  },
  {
    id: 'meetings-ausschluss',
    category: 'meetings',
    question: 'Warum kann ich Thema und Testimony nicht zusammen anhaken?',
    answer:
      'Weil ein Abend das eine oder das andere trägt. Beides zusammen wäre zu viel für einen Abend, und die App will euch das nicht erst am Abend selbst merken lassen.\n\nDasselbe gilt für **Thema und Nachbereitung**: Wo es ein Thema gibt, gehören Zusammenfassung und Actionstep an dessen Einheit — sonst gäbe es beides zweimal.\n\n**Testimony und Nachbereitung zusammen sind dagegen erlaubt** — das ist genau der Lobpreisabend, an dem jemand seine Geschichte erzählt und die Gruppe etwas mitnimmt.\n\nDie App nimmt dir das Nachdenken ab: Hakst du Thema an, gehen Testimony und Nachbereitung von selbst weg, und umgekehrt.',
    keywords: ['gleichzeitig', 'beides', 'fehler', 'testimony'],
  },
  {
    id: 'meetings-baustein-aus',
    category: 'meetings',
    question: 'Was passiert, wenn ich einen Baustein ausschalte?',
    answer:
      '**Thema aus:** Die Zuteilung fällt weg — sonst käme weiter „Du bist dran mit dem Thema" für einen Abend, der keines mehr hat. Eine schon vorbereitete Einheit wird nur **gelöst**, nicht gelöscht: Sie wartet unter „Angefangenes" und lässt sich jederzeit an einem anderen Abend wieder aufnehmen.\n\n**Lieder aus:** Die Liedwünsche für diesen Abend und die Musik-Zuteilung gehen weg. Die Lieder selbst bleiben natürlich in der Datenbank.\n\n**Testimony aus:** Die eingetragene Person wird entfernt.\n\n**Nachbereitung aus:** Zusammenfassung, Actionstep und die gesetzten Haken sind weg. Anders als bei der Themen-Einheit gehören diese Texte nur zu diesem einen Abend — sie irgendwo aufzubewahren hieße, sie unerreichbar zu machen.',
    keywords: ['abschalten', 'weg', 'gelöscht', 'entwurf'],
  },
  {
    id: 'meetings-zusagen',
    category: 'meetings',
    question: 'Wie sage ich zu oder ab?',
    answer:
      'An drei Stellen, mit Absicht unterschiedlich weit:\n\n**Auf „Heute"** — „Bist du dabei?" gilt nur für den nächsten Abend.\n\n**Auf der Terminseite** unter „Wer kommt" → „Deine Antwort" — für diesen einen Abend.\n\n**Im Profil unter Abwesenheiten** — für einen ganzen Zeitraum auf einmal.\n\nEs gibt drei Antworten: dabei, nicht dabei, weiß noch nicht. „Weiß noch nicht" ist ein gültiger Zustand und keine Nachlässigkeit — er verhindert sogar, dass der Abend ausfällt.',
    keywords: ['zusage', 'absage', 'teilnahme', 'anwesenheit'],
  },
  {
    id: 'meetings-autoattend',
    category: 'meetings',
    question: 'Was macht „Ich bin grundsätzlich dabei"?',
    answer:
      'Der Haken sagt kommende Abende gleich für dich zu, statt sie auf „weiß noch nicht" stehen zu lassen. Er ist ausgeschaltet, solange du ihn nicht setzt — eine Zusage, die man nie gegeben hat, ist keine.\n\nZwei Dinge sind wichtig:\n\n**Er füllt nur Lücken.** Wo du schon geantwortet hast, rührt er nichts an — egal in welche Richtung.\n\n**Er gilt rückwirkend für alle kommenden Abende**, nicht erst ab dem nächsten. Wer ihn umlegt, meint die sieben Dienstage, die er vor sich sieht.\n\nAbwesenheiten stechen ihn: Trägst du Urlaub ein, gewinnt der Urlaub. Sagst du für einen Abend von Hand zu, gewinnt deine Zusage — auch mitten im Urlaub.',
    keywords: ['grundsätzlich', 'automatisch zusagen', 'haken'],
  },
  {
    id: 'meetings-abwesenheit',
    category: 'meetings',
    question: 'Wie trage ich eine Abwesenheit ein — und was passiert dann?',
    answer:
      'Im Profil unter „Abwesenheiten", als Zeitraum von–bis.\n\nDie App sagt daraufhin alle Abende in diesem Zeitraum für dich ab und **gibt deine Aufgaben frei**: Gastgeber (samt Ort, wenn es dein Zuhause war), Musik, Testimony und die Themen-Zuteilung. Sonst stünde im Plan ein Gastgeber, der nachweislich verreist ist. Eine vorbereitete Themen-Einheit wird dabei nur gelöst und wartet als Entwurf.\n\nDas wirkt sofort, nicht erst am nächsten Morgen, und es gilt nur nach vorn — ein Urlaub, den du im Nachhinein einträgst, schreibt nicht um, wer damals da war.\n\nVerkürzt oder löschst du den Zeitraum wieder, bekommst du die Abende zurück. Was du von Hand beantwortet hattest, bleibt in beiden Richtungen unangetastet.',
    keywords: ['urlaub', 'weg', 'verreist', 'zeitraum', 'abwesend'],
  },
  {
    id: 'meetings-faellt-aus',
    category: 'meetings',
    question: 'Der Abend ist abgesagt — kann er wiederkommen?',
    answer:
      'Ja, und dafür braucht es keinen Admin. In der Meldung steht ein Knopf **„Ich bin doch dabei"** — den sieht jede:r. Ein Klick, und der Abend findet wieder statt.\n\nDas geht, weil die App ihn nur dann von selbst absagt, wenn **wirklich alle** abgesagt haben. Wer noch nicht geantwortet hat, verhindert die Absage: „Vier von neun haben abgesagt" ist ein dünner Abend, kein ausgefallener.\n\nEine Absage, die ein Mensch ausgesprochen hat, kommt so nicht zurück — die nimmt nur ein Admin wieder zurück.',
    keywords: [
      'ausgefallen',
      'doch dabei',
      'wiederherstellen',
      'alle abgesagt',
    ],
  },
  {
    id: 'meetings-fertig-geplant',
    category: 'meetings',
    question: 'Was heißt „fertig geplant"?',
    answer:
      'In der Planungstabelle ist eine Zeile grün mit Haken, wenn **jede Aufgabe vergeben ist, die es an diesem Abend gibt**.\n\nDas Entscheidende ist der zweite Halbsatz: Ein Baustein, der aus ist, fehlt nicht. Und ein Abend im Park braucht keinen Gastgeber, gilt also auch ohne einen als vollständig.\n\nEin abgesagter Abend ist nie „fertig geplant".',
    keywords: ['grün', 'haken', 'vollständig', 'planung', 'tabelle'],
  },
  {
    id: 'meetings-eigene',
    category: 'meetings',
    question: 'Kann ich einen eigenen Termin anlegen?',
    answer:
      'Ja, jede:r kann das — auf „Termine" über den Knopf zum Anlegen. Ein Geburtstag, ein Grillabend, eine Freizeit über mehrere Tage.\n\nEr kommt ohne Bausteine und ohne Bedingungen: kein Thema nötig, kein Gastgeber nötig. Was du davon brauchst, schaltest du dazu.\n\nAlle anderen bekommen eine Benachrichtigung, dass etwas dazugekommen ist, und später eine Erinnerung — anders als beim Dienstagabend hat man so einen Termin nicht von selbst im Kopf.',
    keywords: ['custom', 'geburtstag', 'freizeit', 'anlegen', 'mehrtägig'],
  },
  {
    id: 'meetings-uhrzeit',
    category: 'meetings',
    question: 'Jeder Termin hat eine Uhrzeit — wo sehe ich sie?',
    answer:
      'Auf „Heute" steht sie oben rechts in der Karte für das nächste Treffen, und auf der Terminseite selbst.\n\nIn den Listen steht sie bewusst nicht an jeder Zeile: Dort liest man quer über Wochen und sucht ein Datum, da wäre die Uhrzeit an jeder Zeile nur Rauschen.\n\nÄndert sich die Uhrzeit des **nächsten** Termins, bekommen alle eine Benachrichtigung.',
    keywords: ['zeit', 'wann', 'treffpunktzeit', 'beginn'],
  },

  // ── Themen ────────────────────────────────────────────────────────────────
  {
    id: 'topics-zugeteilt',
    category: 'topics',
    question: 'Ich bin fürs Thema zugeteilt — was jetzt?',
    answer:
      'Zugeteilt heißt: Du bist dran. Was ihr macht, steht damit noch nicht fest — der zweite Schritt ist das **Wählen**, und den machst du.\n\nAuf der Terminseite hast du drei Möglichkeiten:\n\n**Neues Thema** — du fängst etwas an.\n**Eigenes fortsetzen** — ein Thema von dir bekommt einen weiteren Abend.\n**Angefangenes aufnehmen** — du nimmst eine Einheit, die schon vorbereitet ist und noch an keinem Abend hängt.\n\nErst mit dem Wählen entsteht der Ort, an dem Titel, Actionstep und Zusammenfassung stehen.',
    keywords: ['dran', 'vorbereiten', 'wählen', 'zuständig'],
  },
  {
    id: 'topics-zwei-schritte',
    category: 'topics',
    question: 'Was ist der Unterschied zwischen zugeteilt und gewählt?',
    answer:
      'Drei Dinge sind getrennt, und dazwischen liegt jeweils Zeit:\n\n**Zuständigkeit** — wer an diesem Abend das Thema macht. Steht am Termin.\n**Auswahl** — welches Thema es wird. Kommt später.\n**Inhalt** — Titel, Actionstep, Zusammenfassung. Kommt noch später.\n\n„Zugeteilt, aber noch nichts gewählt" ist deshalb ein völlig normaler Zustand und kein halbfertiger.\n\n**Wählen darf nur, wer an dem Abend zugeteilt ist** — auch kein Admin. Und „niemand ist zugeteilt" heißt hier nicht „alle dürfen": Dann trägt sich erst jemand ein.',
    keywords: ['unterschied', 'schritte', 'auswahl'],
  },
  {
    id: 'topics-vorbereiten',
    category: 'topics',
    question: 'Kann ich ein Thema vorbereiten, ohne dass ein Abend feststeht?',
    answer:
      'Ja, und das ist ausdrücklich vorgesehen. Im Archiv unter „Themen" legst du eines an, wann immer du Lust hast — du musst nicht auf einen Dienstag warten, an dem du zufällig dran bist.\n\nEine Einheit ohne Abend wartet unter **„Angefangenes"**. Sobald du (oder jemand anders, dem du sie überlässt) an einem Abend zugeteilt bist, kannst du sie dort aufnehmen.\n\nSolange sie an keinem Abend hängt, sehen sie nur die Leute, die am Thema mitarbeiten. Ein Entwurf ist nichts, was die ganze Gruppe schon lesen muss.',
    keywords: ['angefangenes', 'entwurf', 'vorarbeiten', 'ohne termin'],
  },
  {
    id: 'topics-einzeln',
    category: 'topics',
    question: 'Muss jede Einheit zu einem Thema gehören?',
    answer:
      'Nein. Nicht jeder Abend spannt einen Bogen über mehrere — und wer nur einen vorbereiten will, sollte kein Thema erfinden müssen, das nie ein zweites Mal vorkommt.\n\nEine **einzelne Einheit** legst du im Archiv über „Neu anlegen" an, oder direkt an einem Abend unter „Thema wählen" → „Einzelne Einheit wählen".\n\nSie verhält sich sonst wie jede andere Einheit: eigener Titel, Zusammenfassung, Actionstep, eigene Seite. Im Archiv erkennst du sie am Symbol — ein Blatt für die einzelne Einheit, Ebenen für ein Thema über mehrere Abende.',
    keywords: [
      'einzeln',
      'ohne thema',
      'alleinstehend',
      'einheit',
      'ein abend',
    ],
  },
  {
    id: 'topics-ueberthema',
    category: 'topics',
    question: 'Aus einer einzelnen Einheit doch ein Thema machen?',
    answer:
      'Geht jederzeit — das ist genau der Fall, den man vorher nicht kommen sieht: Du hältst einen Abend und merkst danach, dass da mehr drinsteckt.\n\nAuf der Seite der Einheit steht dafür **„Überthema hinzufügen"**. Du gibst den Titel ein, den die Abende zusammen tragen; alles, was in der Einheit steht, bleibt genau so stehen, samt Termin und Beteiligten.\n\nAm Abend selbst geht es in einem Schritt: unter „Thema wählen" → **„Einheit fortsetzen"**. Dort stehen auch die schon gehaltenen. Die alte Einheit bleibt an ihrem Abend, und dieser wird die zweite.\n\nDeshalb braucht eine zweite Einheit immer erst ein Überthema: Zwei Abende, über denen nichts steht, sind kein Thema, sondern zwei Abende.',
    keywords: [
      'überthema',
      'fortsetzen',
      'zweite einheit',
      'thema machen',
      'zusammenfassen',
    ],
  },
  {
    id: 'topics-wechsel',
    category: 'topics',
    question: 'Ich habe etwas anderes gewählt — ist meine Vorbereitung weg?',
    answer:
      'Nein. Sie löst sich vom Abend und wartet als Entwurf unter „Angefangenes". Du kannst sie jederzeit wieder aufnehmen.\n\nDasselbe passiert, wenn du aus der Zuteilung fällst oder der Baustein „Thema" ausgeschaltet wird: **gelöst, nicht gelöscht.** Ein Entwurf, den niemand mehr sehen kann, wäre gelöscht — nur langsamer.\n\nRichtig löschen lässt sich eine Einheit nur, solange sie noch nie gehalten wurde.',
    keywords: ['gewechselt', 'verloren', 'weg', 'entwurf'],
  },
  {
    id: 'topics-rechte',
    category: 'topics',
    question: 'Wer darf an einem Thema schreiben, wer darf es löschen?',
    answer:
      '**Schreiben** darf, wem das Thema gehört, und alle, die eine seiner Einheiten gehalten haben. Und zwar am **ganzen** Thema — auch an Abenden, an denen man selbst nicht dran war. Ein Thema ist ein gemeinsamer Bogen, kein Stapel Einzelabende.\n\n**Löschen** darf nur, wem es gehört (und ein Admin). Wer mitarbeitet, kann jeden Text ändern, aber nicht die Arbeit aller wegwerfen.\n\nDas Thema **gehört dem, der zuerst wählt** — nicht dem, der zuerst zugeteilt wurde. Oder dem, der es im Archiv anlegt.\n\nFällt jemand aus der Zuteilung, verliert er die Einheit dieses Abends. Das Schreibrecht am Thema verliert er nur, wenn er sonst nirgends mehr daran hängt.',
    keywords: ['owner', 'besitzer', 'mitarbeiter', 'bearbeiten', 'löschen'],
  },
  {
    id: 'topics-sichtbarkeit',
    category: 'topics',
    question:
      'Warum sehe ich Titel und Zusammenfassung eines Abends noch nicht?',
    answer:
      'Weil er noch nicht angefangen hat. Titel, Actionstep und Zusammenfassung einer noch nicht gehaltenen Einheit sehen nur die, die dafür zuständig sind — damit die Vorbereitung eine Vorbereitung bleiben darf und nicht schon halb vorgetragen ist.\n\nMaßgeblich ist die **Treffpunktzeit dieses Termins**, nicht der Kalendertag und keine feste Uhrzeit. Fängt der Abend um 19 Uhr an, wird um 19 Uhr aufgeschlossen.\n\nWer schon abgehakt hat, ist übrigens immer zu sehen — das sagt nichts über den Inhalt.',
    keywords: ['verborgen', 'nicht sichtbar', 'geheim', 'gesperrt'],
  },
  {
    id: 'topics-archiv',
    category: 'topics',
    question: 'Wann taucht ein Thema im Archiv auf?',
    answer:
      'Sobald **einer** seiner Abende vorbei ist. Dann ist es für alle da — auch die Abende, die später noch dazukommen.\n\nJedes Thema hat eine eigene Seite mit allen seinen Abenden. Im Archiv trennen zwei Register „Eigene Themen" von „Alle Themen"; unter „Eigene" stehen auch die, die du noch nicht gehalten hast.',
    keywords: ['archiv', 'öffentlich', 'sichtbar', 'alle'],
  },
  {
    id: 'topics-mehrere-abende',
    category: 'topics',
    question: 'Wie ziehe ich ein Thema über mehrere Abende?',
    answer:
      'Beim Wählen an einem Abend nimmst du „Eigenes fortsetzen" und suchst dein Thema heraus. Es bekommt damit eine weitere Einheit.\n\nJede Einheit hat ihren eigenen Titel, Actionstep und ihre eigene Zusammenfassung; das Thema selbst hat zusätzlich eine Zusammenfassung über alle Abende hinweg.\n\nFür die Vorschlagslogik zählt das Ganze als **eine** Aufgabe — sonst wäre man nach einer dreiteiligen Reihe für Monate ganz unten in jeder Liste.',
    keywords: ['reihe', 'fortsetzen', 'mehrteilig', 'serie'],
  },
  {
    id: 'topics-vergangen',
    category: 'topics',
    question: 'Kann sich ein vergangener Abend noch ändern?',
    answer:
      'Nein. Ein Abend, der vorbei ist, ist eingefroren: Seine Einheit bleibt daran hängen, und wer sie gehalten hat, bleibt vermerkt — egal was danach mit den Zuteilungen passiert.\n\nDas gilt auch für Absagen und Rollenwechsel: Eine Korrektur von heute schreibt nicht um, was war.\n\nTexte lassen sich weiter bearbeiten — es geht um die Zuordnung, nicht um den Inhalt.',
    keywords: ['eingefroren', 'vergangen', 'ändern', 'nachträglich'],
  },

  // ── Musik & Lieder ────────────────────────────────────────────────────────
  {
    id: 'songs-abhaken',
    category: 'songs',
    question: 'Warum kann ich die Lieder nicht abhaken?',
    answer:
      '**Vor dem Abend darf nur abhaken, wer an dem Abend die Musik macht.** Das Abhaken ist da noch eine Entscheidung — „das singen wir" — und die trifft, wer die Lieder üben muss.\n\n**Ist der Abend vorbei, darf es jede:r.** Dann ist es ein Protokoll: „das haben wir gesungen", und daran erinnern sich alle gleich gut.\n\nZwei Dinge sind hier bewusst anders als sonst in der App: Es gibt **keinen Admin-Freifahrtschein**, und „niemand ist zugeteilt" heißt **nicht** „alle dürfen". Ist niemand eingetragen, darf vor dem Abend niemand abhaken — dann trägt sich erst jemand ein.',
    keywords: ['haken', 'auswählen', 'gesperrt', 'grau', 'darf nicht'],
  },
  {
    id: 'songs-vorschlagen',
    category: 'songs',
    question: 'Wie schlage ich ein Lied für einen Abend vor?',
    answer:
      'Auf der Terminseite unter „Lieder". Du kannst eines aus der Datenbank suchen oder ein neues eintragen — dann landet es gleich in der Datenbank und steht beim nächsten Mal zur Auswahl.\n\nVorschlagen darf jede:r, unabhängig davon, wer die Musik macht. Was davon gesungen wird, hakt die Musik ab.\n\nDenselben Song zweimal vorzuschlagen macht keinen zweiten Eintrag — es ist derselbe Wunsch.',
    keywords: ['wunsch', 'vorschlag', 'lied', 'song', 'eintragen'],
  },
  {
    id: 'songs-datenbank',
    category: 'songs',
    question: 'Was ist die Lieder-Datenbank?',
    answer:
      'Alles, was jemals vorgeschlagen wurde, bleibt gespeichert — mit der Zeit wächst daraus euer Repertoire. Zu finden im Archiv unter „Lieder", durchsuchbar nach Titel und Interpret.\n\nSortieren kannst du nach Titel, nach „am häufigsten gesungen" und nach „zuletzt gesungen". Gezählt wird dabei nur, was an einem vergangenen Abend tatsächlich **abgehakt** war — ein Vorschlag, der es nicht auf die Liste geschafft hat, sagt etwas über einen Wunsch, nicht über das Repertoire.\n\nNeue Lieder kannst du auch direkt im Archiv anlegen, ohne Umweg über einen Termin.',
    keywords: ['repertoire', 'sammlung', 'suchen', 'archiv'],
  },
  {
    id: 'songs-ki',
    category: 'songs',
    question: 'Was machen die beiden Knöpfe beim Eintragen eines Lieds?',
    answer:
      'Zwei Abkürzungen, beide **nur auf Knopfdruck** — nie beim Tippen, denn jeder Aufruf dauert Sekunden und kostet etwas.\n\n**„Aus Link ausfüllen"** — du fügst eine Adresse ein, und die App liest Titel und Interpret von der Seite.\n\n**„Link suchen"** — umgekehrt: aus Titel und Interpret werden bis zu drei Links vorgeschlagen. Bevorzugt Ultimate Guitar, dann Genius — bei vier Instrumenten ist ein Akkordblatt genauso richtig wie ein Liedtext.\n\nJeder vorgeschlagene Link wird vorher tatsächlich abgerufen, bevor er dir angeboten wird. Ein Sprachmodell schreibt sonst überzeugende Adressen auf, die es nie gab.\n\nUnter den Knöpfen steht nicht ohne Grund, dass die Vorschläge ungenau sein können: Schau kurz nach, bevor du sie übernimmst.',
    keywords: ['ki', 'ai', 'gemini', 'link', 'automatisch', 'akkorde'],
  },
  {
    id: 'songs-ki-ueberschreibt',
    category: 'songs',
    question: 'Überschreibt die Link-Hilfe, was ich schon eingetragen habe?',
    answer:
      'Nein. Sie füllt **nur leere Felder**.\n\nSteht in einem Feld schon etwas anderes, wird der gefundene Wert dir angeboten: „Titel laut Seite: … — übernehmen?". Ein Klick, und er steht drin; kein Klick, und deine eigene Fassung bleibt.\n\nSonst würde ein Knopfdruck genau die Korrektur löschen, die du gerade von Hand gemacht hast.',
    keywords: ['überschreiben', 'korrektur', 'leer', 'übernehmen'],
  },
  {
    id: 'songs-ki-nochmal',
    category: 'songs',
    question: 'Ich habe nochmal auf „Link suchen" gedrückt — kommt dasselbe?',
    answer:
      'Nein, der zweite Druck sucht **daneben** weiter. Die bisherigen Vorschläge bleiben stehen, was neu dazukommt ist mit „neu" markiert, und die schon bekannten Adressen gehen als „kennen wir schon" mit in die Anfrage.\n\nFrüher kam beliebig oft derselbe Zwischenspeicher zurück — wer einen schlechten Vorschlag bekommen hatte, war damit fertig.\n\nZwei Links zur selben Seite nebeneinander sind dabei ausdrücklich erwünscht: Wenn das erste Akkordblatt nichts taugte, ist ein zweites von derselben Seite genau das, was man will. Insgesamt ist bei neun Vorschlägen Schluss.\n\nFindet sich nichts Weiteres, sagt die App das auch.',
    keywords: ['nochmal', 'wiederholen', 'neue vorschläge', 'mehr'],
  },
  {
    id: 'songs-instrument',
    category: 'songs',
    question:
      'Muss man ein Instrument spielen, um für die Musik eingetragen zu werden?',
    answer:
      'Für den **Vorschlag** ja — vorgeschlagen wird nur, wer im Profil angehakt hat, dass er ein Instrument spielt.\n\nFür den **Eintrag** nein. Die Gruppe bleibt frei, einzutragen, worauf sie sich geeinigt hat; die App redet da nicht hinein.\n\nWas sie prüft, ist die Anwesenheit: Wer für den Abend abgesagt hat, kann die Rolle nicht übernehmen. Bei einem vergangenen Abend prüft sie auch das nicht mehr — Nachtragen ist Buchführung, keine Planung.',
    keywords: ['instrument', 'spielen', 'musik', 'zuteilen'],
  },
  {
    id: 'songs-loeschen',
    category: 'songs',
    question: 'Kann ich ein Lied aus der Datenbank löschen?',
    answer:
      'Das können nur Admins, und auch die nur, solange das Lied an keinem Termin hängt. Sonst stünde im Archiv ein Abend mit einer Lücke.\n\nMeistens ist ohnehin **Umbenennen** gemeint — ein Tippfehler im Titel, ein falscher Interpret. Das darf jede:r, im Archiv unter „Lieder".',
    keywords: ['löschen', 'entfernen', 'umbenennen', 'tippfehler'],
  },

  // ── Orte & Hosten ─────────────────────────────────────────────────────────
  {
    id: 'locations-arten',
    category: 'locations',
    question:
      'Was ist der Unterschied zwischen einem Zuhause und einem Treffpunkt?',
    answer:
      'Ein **Zuhause** gehört Menschen. Sein Name entsteht von selbst aus den Bewohnern („Bei Niko & Chris") und lässt sich nicht frei eintippen — man pflegt ihn über die Profile. Wer dort trifft, hat einen Gastgeber, und die Wohnung nimmt am Rhythmus teil, wer wann dran ist.\n\nEin **Treffpunkt** gehört niemandem: der Schlosspark, ein Café, das Gemeindehaus. Frei benennbar, kein Gastgeber nötig — und **außerhalb der Reihenfolge**. Der Park ist eine Möglichkeit bei gutem Wetter, kein Ort, dem die Gruppe je einen Besuch schuldet.',
    keywords: ['ort', 'zuhause', 'treffpunkt', 'park', 'wohnung'],
  },
  {
    id: 'locations-eigenes-zuhause',
    category: 'locations',
    question: 'Wie trage ich meine eigene Wohnung ein?',
    answer:
      'Im Profil unter „Wo du wohnst". Du tippst deine **Adresse** ein — du wählst nichts aus einer Liste.\n\nWohnt unter derselben Adresse schon jemand, fragt die App nach: „Wohnt ihr zusammen?" Nur wenn du bestätigst, zieht ihr in dieselbe Wohnung. Sonst wäre still aus zwei Haushalten einer geworden — und beide wären nur noch halb so oft dran.\n\n„Ich bringe keine Wohnung mit" ist ein völlig gültiger Zustand. Alle anderen Aufgaben kannst du trotzdem übernehmen.',
    keywords: ['adresse', 'wohnung', 'eintragen', 'wo ich wohne'],
  },
  {
    id: 'locations-zusammen',
    category: 'locations',
    question: 'Wir wohnen zusammen — was heißt das für den Rhythmus?',
    answer:
      'Ihr seid für die Reihenfolge **ein** Zuhause, nicht zwei. Die Gruppe kommt bei euch also genauso oft vorbei wie bei allen anderen und nicht doppelt so oft.\n\nWer von euch beiden am Abend als Gastgeber:in eingetragen wird, entscheidet ihr; die App schlägt innerhalb der Wohnung den vor, der gerade weniger zu tun hat.\n\nKapazität und Gewichtung gelten für die Wohnung — ihr seht und ändert dieselbe Zahl.',
    keywords: ['wg', 'mitbewohner', 'paar', 'zusammen', 'haushalt'],
  },
  {
    id: 'locations-kapazitaet',
    category: 'locations',
    question: 'Was macht die Kapazität einer Wohnung?',
    answer:
      'Sie sagt, wie viele Leute reinpassen. Ohne Angabe heißt „alle passen rein" — das ist der Normalfall, nur enge Wohnungen brauchen eine Zahl.\n\nKommen an einem Abend mehr Leute als angegeben, wird deine Wohnung **für diesen einen Abend** zurückgestellt. Sie fällt nicht heraus, sie rutscht ans Ende der Vorschläge.\n\nWichtig: Sie sammelt dabei trotzdem weiter Guthaben an. Genau das lässt eine kleine Wohnung so weit aufsteigen, dass sie den seltenen Abend gewinnt, an dem die Runde hineinpasst.\n\nSagen genug Leute ab, sodass es doch reicht, bekommst du eine Benachrichtigung: „Bei euch wäre jetzt Platz."',
    keywords: ['kapazität', 'platz', 'klein', 'wie viele', 'passen'],
  },
  {
    id: 'locations-kann-nicht',
    category: 'locations',
    question: 'Ich kann eine Weile nicht hosten — was mache ich?',
    answer:
      'Im Profil den Haken bei „Ich kann gerade hosten" herausnehmen. Dann schlägt dich die App nicht mehr als Gastgeber:in vor. Im Profil und in der Mitgliederliste steht dann „hostet gerade nicht".\n\nWohnst du allein, fällt damit deine Wohnung ganz aus der Reihenfolge. Wohnt ihr zu zweit und dein Mitbewohner kann, bleibt die Wohnung drin.\n\nDer Haken ist eine Aussage über **dich**, nicht über die Wohnung — sie stillzulegen wäre der falsche Weg, weil sie dann auch aus dem Archiv verschwände.\n\nGeht es nur um bestimmte Wochen, ist eine Abwesenheit das passendere Mittel.',
    keywords: ['nicht hosten', 'pause', 'kann nicht', 'gastgeber'],
  },
  {
    id: 'locations-ort-waehlen',
    category: 'locations',
    question:
      'Warum kann ich keinen Ort wählen, wenn ein Gastgeber eingetragen ist?',
    answer:
      'Weil beides eine Entscheidung ist. Trägst du eine Gastgeberin ein, ergibt sich der Ort aus ihrer Wohnung — von selbst und ohne zweite Eingabe.\n\nWillst du euch woanders treffen, nimm erst den Gastgeber heraus; dann lässt sich ein Treffpunkt wählen. Nimmst du den Gastgeber heraus, verschwindet auch sein Zuhause als Ort. Ein Treffpunkt bleibt dagegen stehen — der hing nie an einer Person.\n\nUmgekehrt gilt dasselbe: Ein Zuhause als Ort ohne Gastgeber geht nicht. Trag die Person ein, dann stimmt der Ort von allein.',
    keywords: ['ort', 'gastgeber', 'zusammen', 'wählen', 'fehler'],
  },
  {
    id: 'locations-anlegen',
    category: 'locations',
    question: 'Wer darf Treffpunkte anlegen?',
    answer:
      'Jede:r — dafür braucht es keine Admin-Rechte. Ein Ort entsteht im Vorbeigehen, beim Planen eines Abends; wer dafür erst jemanden fragen muss, trägt ihn gar nicht erst ein.\n\nDu findest die Liste im Archiv unter „Orte". Dort lassen sich Treffpunkte auch umbenennen und stilllegen.\n\nEine Wohnung löschen kannst du nicht, solange dort noch jemand wohnt — die verschwindet, indem ihre Bewohner:innen im Profil eine andere Adresse eintragen.',
    keywords: ['anlegen', 'neuer ort', 'café', 'rechte'],
  },

  // ── Gebetsbuddys ──────────────────────────────────────────────────────────
  {
    id: 'prayer-rhythmus',
    category: 'prayer',
    question: 'Wie oft wechseln die Gebetsgruppen?',
    answer:
      'Standardmäßig alle **zwei Wochen**. Die Länge ist einstellbar (eine bis zwölf Wochen), das macht ein Admin.\n\nDie App plant immer fünf Runden im Voraus — bei zwei Wochen also gut ein Vierteljahr. Sehen kannst du sie unter „Gebet" im Register „Kommend".',
    keywords: ['rotation', 'wechsel', 'zwei wochen', 'rhythmus'],
  },
  {
    id: 'prayer-gruppengroesse',
    category: 'prayer',
    question: 'Warum sind es Zweier und eine Dreier?',
    answer:
      'Weil neun sich nicht durch zwei teilen lässt. Zweiergruppen sind das Format, das ihr eigentlich wollt — die eine Dreiergruppe gibt es nur, weil die Zahl nicht aufgeht. Bei neun Leuten also 2/2/2/3 und nicht 3/3/3.\n\n**Wer in die Dreiergruppe kommt, entscheidet die App zuerst**, und zwar nach der Frage, wer bisher am seltensten darin war. Sonst landete immer derjenige darin, der zufällig übrig bleibt — und das könnte dieselbe Person mehrmals hintereinander sein.',
    keywords: ['dreier', 'zweier', 'gruppengröße', 'ungerade', 'neun'],
  },
  {
    id: 'prayer-wiederholung',
    category: 'prayer',
    question:
      'Achtet die App darauf, dass nicht immer dieselben zusammenkommen?',
    answer:
      'Ja. Jede mögliche Paarung bekommt einen Preis, der umso höher ist, je kürzer die letzte gemeinsame Runde her ist; wer noch nie zusammen war, kostet nichts. Die App sucht dann die Aufteilung, die insgesamt am günstigsten ist.\n\nDer Preis fällt steil ab: Eine Wiederholung direkt in der nächsten Runde wiegt so schwer wie vier Paarungen, die vier Runden zurückliegen. Nach ein paar Runden ist ein Wiedersehen also kein Problem mehr.\n\nDas Ergebnis ist eindeutig — bei gleichem Preis entscheidet der Name. Es wird nicht gewürfelt.',
    keywords: ['wiederholung', 'immer dieselben', 'zufall', 'paarung'],
  },
  {
    id: 'prayer-aenderung',
    category: 'prayer',
    question: 'Jemand kommt dazu oder geht — was passiert mit meiner Gruppe?',
    answer:
      'Die **laufende** Runde wird repariert, nicht neu gewürfelt: Wer miteinander betet, soll das weiter tun. Wer geht, wird herausgenommen; wer dazukommt, kommt in die kleinste Gruppe. Bleibt jemand allein zurück, rutscht er zur kleinsten anderen Gruppe dazu.\n\nDie **geplanten** Runden danach werden verworfen und neu gebaut — sie waren für eine Gruppe gedacht, die es so nicht mehr gibt. Sie zählen dann auch nicht in die Wiederholungs-Vermeidung hinein; diese Paarungen haben ja nie stattgefunden.\n\n**„Dazukommen" heißt: die Einladung annehmen**, nicht sie bekommen. Wer eingeladen ist, sich aber noch nie angemeldet hat, steht in keiner Gruppe — sein Gegenüber bekäme sonst einen Namen genannt, dem es nicht schreiben kann. Sobald die Person das erste Mal da ist, wird sofort neu geplant.',
    keywords: ['neu', 'verlassen', 'dazugekommen', 'ändert sich'],
  },
  {
    id: 'prayer-wann-erfahre-ich',
    category: 'prayer',
    question: 'Wann erfahre ich meine neue Gruppe?',
    answer:
      'Wenn die Runde **beginnt** — nicht vorher. Die App plant zwar fünf Runden im Voraus, sagt aber nichts darüber; sonst wüsste man im Juni schon, mit wem man im August betet, und hätte es bis dahin vergessen.\n\nDie Benachrichtigung heißt „Neue Gebetsbuddys". Sehen kannst du deine Gruppe jederzeit unter „Gebet" und auf „Heute".',
    keywords: ['benachrichtigung', 'wann', 'erfahren', 'vorher'],
  },

  {
    id: 'prayer-anliegen',
    category: 'prayer',
    question: 'Wie trage ich ein Gebetsanliegen ein?',
    answer:
      'Auf der Seite eines Termins, im Abschnitt **„Gebetsanliegen"**. Ein Klick auf „Mein Gebetsanliegen hinzufügen", schreiben, fertig — du musst dafür nicht erst in den Bearbeitungsmodus, der Klick schaltet ihn selbst ein.\n\n**Ändern und Löschen** brauchen dann den Bearbeitungsmodus („Bearbeiten" ganz unten auf der Seite). Das ist Absicht: Ein Papierkorb neben einem fertigen Satz wäre eine Zeile zu nah am Daumen.\n\nDu hast **ein** Anliegen je Abend. Schreibst du noch einmal, ersetzt du damit das alte.',
    keywords: ['gebet', 'anliegen', 'notiz', 'beten für', 'bitte'],
  },
  {
    id: 'prayer-anliegen-wer',
    category: 'prayer',
    question: 'Kann ich ein Anliegen eintragen, obwohl ich nicht dabei bin?',
    answer:
      'Ja, ausdrücklich. Wer an einem Abend fehlt, hat nicht weniger Anliegen — und die Bitte, dass die anderen für einen beten, ist dann eher wichtiger.\n\nLesen kann die Anliegen der ganze Hauskreis; ändern und löschen kannst du **nur dein eigenes**, auch als Admin. Es gibt in der App gar keinen Weg, an einem fremden zu schreiben.\n\nIst der Abend vorbei oder abgesagt, bleibt stehen, was dasteht — geändert wird dann nichts mehr.',
    keywords: ['nicht dabei', 'abwesend', 'fremdes', 'löschen', 'sichtbar'],
  },

  // ── Geburtstage ───────────────────────────────────────────────────────────
  {
    id: 'birthdays-woher',
    category: 'birthdays',
    question: 'Woher weiß die App, wann ich Geburtstag habe?',
    answer:
      'Aus deinem Profil, und nur von dort. Solange du dort kein Datum eingetragen hast, taucht dein Geburtstag nirgends auf.\n\nDas Jahr ist optional gemeint: Wir zeigen daraus dein Alter, aber nur wenn die Zahl plausibel ist. Wer das nicht möchte, trägt ein offensichtlich falsches Jahr ein — dann steht nur der Tag da.',
    keywords: ['geburtstag', 'geburtsdatum', 'alter', 'eintragen'],
  },
  {
    id: 'birthdays-zustaendig',
    category: 'birthdays',
    question: 'Wie wird entschieden, wer das Geschenk besorgt?',
    answer:
      'Der Reihe nach, und die Reihe sind die Geburtstage selbst: **Du besorgst das Geschenk für den, dessen Geburtstag als nächstes nach deinem kommt.**\n\nDaraus fällt einiges von selbst ab. In einem Jahr ist jede:r genau einmal dran. Niemand ist für sich selbst zuständig. Und wer gerade beschenkt wurde, ist als nächstes dran — man wird also genau dann erinnert, wenn man es zuletzt selbst erlebt hat.\n\nWer keinen Geburtstag eingetragen hat, steht nicht in der Reihe: weder als Beschenkter noch als Schenkender. Trägt er ihn nach, rückt er beim nächsten Lauf überall ein — und die Zuständigkeiten der anderen verschieben sich mit.',
    keywords: ['geschenk', 'zuständig', 'rotation', 'reihenfolge', 'wer'],
  },
  {
    id: 'birthdays-freeze',
    category: 'birthdays',
    question: 'Kann sich meine Zuständigkeit noch ändern?',
    answer:
      'Bis zwei Wochen vor dem Geburtstag ja — dann etwa, wenn jemand seinen Geburtstag nachträgt oder den Hauskreis verlässt. Danach steht sie fest, und daran ändert auch ein Nachtrag nichts mehr.\n\nAußerdem: Sobald du einen **Preis** eingetragen hast, ist die Zuteilung gesperrt, egal wie früh. Wer schon etwas besorgt hat, soll nicht hinterher hören, dass jemand anders zuständig war.\n\nDie Frist stellt die Verwaltung ein.',
    keywords: ['fest', 'ändern', 'frist', 'gesperrt', 'freeze', 'schloss'],
  },
  {
    id: 'birthdays-vorschlaege',
    category: 'birthdays',
    question: 'Wie funktionieren die Geschenk-Vorschläge?',
    answer:
      'Auf der Seite eines Geburtstags kann jede:r Ideen vorschlagen und bei beliebig vielen zustimmen — bei Geschenken sind oft zwei gut und einer scheidet aus. Wer vorschlägt, stimmt automatisch mit zu.\n\n**Aussuchen darf nur, wer das Geschenk besorgt.** Damit ist die Abstimmung beendet; zurücknehmen geht trotzdem. Danach kann diese Person noch eintragen, was es gekostet hat — die anderen bekommen eine Nachricht.\n\nVorschläge gehören der **Person**, nicht dem einzelnen Geburtstag. Was letztes Jahr übrig blieb, steht dieses Jahr wieder da; was genommen wurde, steht unter „Schon einmal geschenkt", damit es niemand zweimal aussucht.',
    keywords: [
      'vorschlag',
      'idee',
      'abstimmen',
      'stimme',
      'preis',
      'auswählen',
    ],
  },
  {
    id: 'birthdays-eigener',
    category: 'birthdays',
    question: 'Sehe ich, was ich selbst geschenkt bekomme?',
    answer:
      'Nein — und zwar nicht „ausgeblendet", sondern gar nicht. Bei deinem eigenen Geburtstag schickt der Server dir die Vorschläge, die Auswahl und den Preis erst gar nicht; auf der Seite steht nur ein netter Satz.\n\nWer für dich zuständig ist, siehst du dagegen schon. Das ist keine Überraschung, die man verderben könnte.',
    keywords: ['eigener', 'überraschung', 'geheim', 'sehen'],
  },
  {
    id: 'birthdays-vergangene',
    category: 'birthdays',
    question: 'Wo sind die vergangenen Geburtstage?',
    answer:
      'Es gibt keine. Wer gestern gefeiert hat, steht ab heute wieder ganz unten unter „Kommende" — mit seinem Geburtstag in einem Jahr.\n\nWas bleibt, sind deine eigenen früheren Zuständigkeiten: Unter „Deine Aufgabe" lässt sich aufklappen, für wen du in den letzten Runden das Geschenk besorgt hast.',
    keywords: ['vergangen', 'archiv', 'historie', 'früher'],
  },
  {
    id: 'birthdays-ausschalten',
    category: 'birthdays',
    adminOnly: true,
    question: 'Wir schenken uns nichts — geht das auch?',
    answer:
      'Ja, und es ist sogar die Vorgabe. In der Verwaltung unter „Geburtstags-Geschenke" lässt sich das Einteilen ganz abschalten: Dann stehen die Geburtstage weiter im Kalender und in der Liste, aber niemand bekommt eine Aufgabe und niemand eine Nachricht.\n\nDort lässt sich statt „der Reihe nach" auch eine **feste** Zuteilung wählen, die Jahr für Jahr gleich bleibt. Ändert sich dabei die Gruppe, schließt das System entstehende Lücken selbst und weist in der Verwaltung darauf hin — der Modus bleibt trotzdem „fest".',
    keywords: ['ausschalten', 'deaktivieren', 'fest', 'manuell', 'verwaltung'],
  },
  // ── Nachbereitung ─────────────────────────────────────────────────────────
  {
    id: 'notes-wo',
    category: 'notes',
    question: 'Wo trage ich Zusammenfassung und Actionstep ein?',
    answer:
      'Das kommt darauf an, ob der Abend ein Thema hatte.\n\n**Mit Thema:** an dessen Einheit. Dort gehören sie zum Thema und überleben einen Rollenwechsel.\n\n**Ohne Thema** — ein Lobpreisabend, ein besonderer Termin: über den Baustein **Nachbereitung**, direkt am Abend.\n\nBeides zugleich geht nicht, damit es nie zwei Zusammenfassungen und zwei Actionsteps gibt.\n\nFrüher hatte ein Abend ohne Thema gar keinen Ort dafür — obwohl der Vorsatz für die Woche dort genauso entsteht.',
    keywords: ['zusammenfassung', 'actionstep', 'notizen', 'protokoll'],
  },
  {
    id: 'notes-erst-am-abend',
    category: 'notes',
    question: 'Warum kann ich die Nachbereitung erst am Abend hinzufügen?',
    answer:
      'Weil man sie nicht vorplant. Stünde sie im Baukasten, hätte man sie **vor** dem Abend angehakt — also als es noch nichts nachzubereiten gab.\n\nAb der Treffpunktzeit steht an einem Abend ohne Thema der Hinweis „Nachbereitung hinzufügen?". Ein Klick legt die Karte an; im Bearbeitungsmodus kannst du sie auch wieder ganz entfernen, dann steht wieder der Hinweis da.\n\nNicht jeder Abend braucht eine. Eine leere Karte an jedem Termin wäre eine Aufforderung, der man meistens nicht nachkommt.',
    keywords: ['hinzufügen', 'später', 'hinweis', 'karte'],
  },
  {
    id: 'notes-einzeln',
    category: 'notes',
    question: 'Muss ich beides ausfüllen?',
    answer:
      'Nein, jedes der beiden Stücke ist einzeln und freiwillig. Zusammenfassung und Actionstep stehen nur da, wenn etwas drinsteht.\n\nIm Bearbeitungsmodus legt ein Knopf das fehlende Stück an und öffnet gleich das Eingabefeld. Bleibt es leer, verschwindet es wieder — ein Feld ohne Inhalt gibt es nicht.\n\nManchmal gibt es eben nur einen Vorsatz und nichts zusammenzufassen.',
    keywords: ['pflicht', 'beides', 'leer', 'nur eines'],
  },
  {
    id: 'notes-haken',
    category: 'notes',
    question: 'Warum kann ich den Actionstep noch nicht abhaken?',
    answer:
      'Weil der Abend noch nicht angefangen hat. Maßgeblich ist die **Treffpunktzeit**, nicht der Kalendertag — einen Vorsatz für heute Abend hakt man heute früh nicht ab.\n\nDer Haken gilt pro Person und hängt am Termin; er funktioniert für beide Fälle gleich, ob der Actionstep nun vom Thema oder vom Baustein kommt.\n\nWieder abhaken darfst du jederzeit. Und du siehst, wie weit die anderen sind — bei null steht dort „Noch niemand hat abgehakt" und nicht „0 von 9", was sich wie ein Vorwurf läse.',
    keywords: ['haken', 'erledigt', 'abhaken', 'gesperrt'],
  },

  // ── Konto & Hauskreis ─────────────────────────────────────────────────────
  {
    id: 'account-einladen',
    category: 'account',
    question: 'Wie lade ich jemanden ein?',
    answer:
      'Das machen Admins, im Profil unter „Mitglieder" oder im Admin-Bereich. Es braucht nur eine E-Mail-Adresse.\n\nDie eingeladene Person bekommt eine Mail mit einem Link: Dort sucht sie sich einen Anmeldenamen aus, legt ein Passwort fest und ist drin.\n\nBis dahin steht sie in der Liste mit dem Abzeichen **„eingeladen"**. Solange lässt sich die Einladung samt Konto wieder zurücknehmen; danach nicht mehr — dann gehört das Konto einer Person und nicht mehr der Gruppe.\n\nKam die Mail nicht an, gibt es einen Knopf, sie erneut zu schicken.',
    keywords: ['einladung', 'neu', 'mitglied', 'hinzufügen'],
  },
  {
    id: 'account-passwort',
    category: 'account',
    question: 'Wie ändere ich mein Passwort?',
    answer:
      'Im Profil unter „Konto" gibt es dafür einen Link. Er führt dich zur Anmeldeseite, wo du dein Passwort setzt.\n\nDas ist nicht bloß ein Umweg: **Dein Passwort liegt nicht in dieser App.** Es liegt beim Anmeldedienst, der auch die Anmeldung selbst macht. Diese App bekommt es nie zu sehen — und muss deshalb auch keine Passwortregeln, keine Wiederherstellung und keinen zweiten Faktor nachbauen.\n\nHast du es vergessen, nimm auf der Anmeldeseite „Passwort vergessen".',
    keywords: ['passwort', 'ändern', 'vergessen', 'keycloak'],
  },
  {
    id: 'account-email',
    category: 'account',
    question: 'Wie ändere ich meine E-Mail-Adresse?',
    answer:
      'Im Profil unter „Konto". Danach bekommst du eine Bestätigungsmail an die **neue** Adresse.\n\nAnmelden kannst du dich sofort und durchgehend — auch bevor du bestätigt hast. Du wirst an deinem Konto erkannt, nicht an der Adresse.',
    keywords: ['email', 'adresse', 'ändern', 'bestätigen'],
  },
  {
    id: 'account-namen',
    category: 'account',
    question: 'Anzeigename und Anmeldename — was ist der Unterschied?',
    answer:
      'Der **Anzeigename** ist, was die anderen sehen: auf den Karten, in den Vorschlägen, im Archiv. Groß- und Kleinschreibung wie du magst. Er steht im Profil unter „Deine Angaben".\n\nDer **Anmeldename** ist, womit du dich anmeldest. Er wird klein geschrieben und ist über alle Hauskreise hinweg eindeutig. Statt seiner geht auch immer deine E-Mail-Adresse. Er steht im Profil unter „Konto", direkt über der Adresse — beides sind Anmeldedaten und gehören zusammen.\n\nOhne die Trennung stünde auf jeder Karte „niko" statt „Niko".',
    keywords: ['name', 'username', 'anzeigename', 'unterschied'],
  },
  {
    id: 'account-verlassen',
    category: 'account',
    question: 'Was passiert, wenn ich den Hauskreis verlasse?',
    answer:
      'Du kommst aus allen **kommenden** Planungen heraus: Gastgeber, Musik, Testimony und Themen-Zuteilungen werden frei, deine Zusagen für kommende Abende verschwinden, dein Profilbild wird gelöscht, und die Gebetsgruppen werden neu geordnet. Die anderen bekommen eine Nachricht, die auch sagt, was jetzt offen ist.\n\nWas war, bleibt: Vergangene Abende zeigen weiter, wer gehostet und wer welches Thema gehalten hat — unter deinem Namen.\n\n**Eine neue Einladung an dieselbe Adresse holt alles zurück.** Dein Konto behältst du; verlassen ist etwas anderes als löschen.\n\nBist du der einzige Admin, musst du vorher jemanden bestimmen, der übernimmt.',
    keywords: ['verlassen', 'austreten', 'weg', 'raus'],
  },
  {
    id: 'account-loeschen',
    category: 'account',
    question: 'Was passiert, wenn ich mein Konto lösche?',
    answer:
      'Löschen heißt hier **anonymisieren**. Deine Zeile bleibt, aber Name, E-Mail-Adresse und Geburtstag fallen weg — im Archiv steht dann „Ehemaliges Mitglied". Dein Anmeldekonto wird gelöscht, ebenso deine Benachrichtigungs-Einstellungen, deine angemeldeten Geräte und deine Abwesenheiten.\n\nWarum nicht wirklich löschen? Weil daran zwei verschiedene Dinge hängen: die **Zuschreibung** (wer hat gehostet, wem gehört das Thema) und die **Zugehörigkeit** (wer hat welche Einheit gehalten, wer war da). Ein hartes Löschen nähme beides mit — das Archiv wäre danach nicht anonym, sondern löchrig.\n\nWarst du die letzte Person im Hauskreis, verschwindet der ganze Hauskreis mit. Davor warnt die App zweimal.',
    keywords: ['löschen', 'konto', 'anonym', 'ehemaliges mitglied', 'dsgvo'],
  },
  {
    id: 'account-rueckkehr',
    category: 'account',
    question: 'Ich komme zurück — sind meine Abende wieder unter meinem Namen?',
    answer:
      'Ja.\n\nHast du den Hauskreis nur **verlassen**, findet eine neue Einladung an dieselbe Adresse deine alte Zeile von selbst wieder. Alles hängt sofort wieder an dir.\n\nHast du dein **Konto gelöscht**, stehst du für Admins in einer Liste ehemaliger Mitglieder. Weil dort alle „Ehemaliges Mitglied" heißen, steht daneben, was sie getan haben — von wann bis wann, wie oft gehostet, wie viele Einheiten gehalten. Daran erkennt man dich, und beim Einladen lässt sich die alte Zeile wieder mit dir verbinden.',
    keywords: ['zurück', 'wiederkommen', 'ehemalig', 'einladen'],
  },
  {
    id: 'account-zwei-hauskreise',
    category: 'account',
    question: 'Kann ich in zwei Hauskreisen sein?',
    answer:
      'Nein. Ein Konto gehört zu einem Hauskreis.\n\nEin Wechsel ist deshalb ein Umzug: Nimmst du eine Einladung an, verlässt du den bisherigen. Die App sagt das vorher deutlich und fragt nach.',
    keywords: ['zwei', 'wechseln', 'mehrere', 'gruppen'],
  },
  {
    id: 'account-letzter',
    category: 'account',
    question: 'Ich bin der letzte Admin oder das letzte Mitglied — was dann?',
    answer:
      '**Letzter Admin:** Bevor du gehst, bestimmst du jemanden, der übernimmt. Die App fragt danach, sobald sie merkt, dass es nötig ist. Übergeben kannst du auch an jemanden, der sich noch nie angemeldet hat.\n\n**Letztes Mitglied:** Wenn außer dir niemand mehr da war — offene Einladungen zählen nicht, die kennen den Hauskreis ja nicht —, verschwindet mit dir der ganze Hauskreis: Termine, Themen, Lieder, das komplette Archiv. Die App warnt zweimal davor, einmal im Formular und einmal beim Bestätigen.',
    keywords: ['letzter', 'admin', 'auflösen', 'nachfolger', 'warnung'],
  },

  // ── Darstellung & Technik ─────────────────────────────────────────────────
  {
    id: 'app-darkmode',
    category: 'app',
    question: 'Kann ich zwischen hell und dunkel wechseln?',
    answer:
      'Ja, im Profil unter „Darstellung". Drei Möglichkeiten: hell, dunkel oder **wie das Gerät** — dann wechselt die App abends von selbst mit.\n\nDie Wahl gehört zum Gerät, nicht zum Konto: dasselbe Konto abends am Telefon dunkel und tagsüber am Rechner hell ist kein Widerspruch, sondern der Normalfall.',
    keywords: ['dunkel', 'hell', 'dark mode', 'nachtmodus', 'system'],
  },
  {
    id: 'app-benachrichtigungen',
    category: 'app',
    question: 'Wie schalte ich Benachrichtigungen ein, und welche gibt es?',
    answer:
      'Im Profil unter „Benachrichtigungen". Du musst sie einmal je Gerät erlauben — auf dem iPhone geht das nur, wenn die App vom Home-Bildschirm gestartet wurde, nicht im Safari-Tab.\n\nJede Art lässt sich einzeln schalten. Bei den Erinnerungen stellst du außerdem ein, **wie viele Tage vorher** sie kommen sollen; beim Actionstep, an welchen Wochentagen (auch mehrere).\n\nEs gibt Erinnerungen an deine eigenen Aufgaben (hosten, Thema, Musik, Testimony, Actionstep) und Nachrichten über die Gruppe (eingeteilt worden, neue Gebetsbuddys, Abend fällt aus oder findet doch statt, geänderte Uhrzeit, jemand sagt ab, bei euch wäre jetzt Platz, jemand verlässt den Hauskreis, ein besonderer Termin, Neues in der App).',
    keywords: ['push', 'erinnerung', 'benachrichtigung', 'einstellen'],
  },
  {
    id: 'app-geraete',
    category: 'app',
    question: 'Funktioniert die App auf mehreren Geräten?',
    answer:
      'Ja. Melde dich einfach überall mit demselben Konto an — Telefon, Tablet, Rechner.\n\nBenachrichtigungen musst du auf **jedem Gerät einzeln** erlauben; danach kommen sie auf allen an, auf denen du das getan hast. Welche Arten du eingeschaltet hast, gilt dagegen fürs Konto und damit überall gleich.\n\nHell/dunkel und weggeklickte Hinweise merkt sich jedes Gerät für sich.',
    keywords: ['mehrere', 'geräte', 'handy', 'tablet', 'gleichzeitig'],
  },
  {
    id: 'app-offline',
    category: 'app',
    question: 'Funktioniert die App ohne Internet?',
    answer:
      'Teilweise. Die App selbst startet und diese Hilfe ist vollständig da — sie ist Teil der App.\n\nWas vom Server kommt, kommt ohne Netz nicht: Termine, Themen, Lieder, wer zugesagt hat. Dafür siehst du einen Hinweis, dass gerade keine Verbindung besteht.\n\nEin Hinweis fürs iPhone: Eine App vom Home-Bildschirm hat dort ihren eigenen Speicher, getrennt von Safari. Nach dem Installieren muss sie **einmal mit Internet** geöffnet werden — vorher hat sie nichts, was sie im Flugmodus zeigen könnte.',
    keywords: ['offline', 'flugmodus', 'kein internet', 'unterwegs'],
  },
  {
    id: 'app-aktualisieren',
    category: 'app',
    question: 'Wie aktualisiere ich, was auf dem Bildschirm steht?',
    answer:
      'Zieh die Seite nach unten, bis der Kringel erscheint, und lass los. Das lädt alles neu.\n\nSonst holt sich die App Änderungen von selbst, wenn du sie öffnest oder wieder Netz bekommst.',
    keywords: ['neu laden', 'refresh', 'ziehen', 'aktualisieren'],
  },
  {
    id: 'app-konflikt',
    category: 'app',
    question: 'Warum steht da, jemand anders sei schneller gewesen?',
    answer:
      'Weil zwei Leute dasselbe gleichzeitig bearbeitet haben und die App nicht raten will, wessen Fassung gilt.\n\nStatt still zu überschreiben zeigt sie einen Hinweis mit einem Knopf zum Neuladen. Dann siehst du den aktuellen Stand und kannst deine Änderung noch einmal machen — wissend, was inzwischen dasteht.',
    keywords: ['konflikt', 'überschrieben', 'gleichzeitig', 'schneller'],
  },

  // ── Datenschutz ───────────────────────────────────────────────────────────
  {
    id: 'privacy-rechtstexte',
    category: 'privacy',
    question: 'Wo finde ich Datenschutzerklärung und Impressum?',
    answer:
      'Im Profil ganz unten unter **„Rechtliches & Über die App"**. Beides steht außerdem in der Fußzeile der Anmeldeseite — man kommt also auch ohne Konto heran, was bei einer Datenschutzerklärung ja der Sinn der Sache ist.',
    keywords: ['datenschutz', 'impressum', 'rechtliches', 'dsgvo', 'erklärung'],
  },
  {
    id: 'privacy-einwilligung',
    category: 'privacy',
    question: 'Warum muss ich beim Anlegen des Kontos etwas bestätigen?',
    answer:
      'Weil Acts2 einem christlichen Hauskreis dient. Schon die Mitgliedschaft sagt damit etwas über deinen Glauben aus, und dazu kommen Gebetsanliegen, Themen und wer wann bei den Treffen war.\n\nDie DSGVO zählt religiöse Überzeugungen zu den **besonderen Kategorien** personenbezogener Daten (Art. 9). Dafür reicht kein stillschweigendes Einverständnis — es braucht eine **ausdrückliche Einwilligung**, und die holt die App beim Anlegen des Kontos ein.\n\nDu kannst sie jederzeit für die Zukunft widerrufen: im Profil über „Hauskreis verlassen" oder „Konto löschen".',
    keywords: [
      'einwilligung',
      'zustimmung',
      'häkchen',
      'art 9',
      'religion',
      'bestätigen',
    ],
  },
  {
    id: 'privacy-cookies',
    category: 'privacy',
    question: 'Warum gibt es keinen Cookie-Banner?',
    answer:
      'Weil es nichts zu fragen gäbe. Acts2 setzt **keine eigenen Cookies**, benutzt keine Analyse-, Statistik- oder Werbedienste und lädt keine Schriften von fremden Servern nach — die kommen fertig mit der App.\n\nEin Banner ist nur für das nötig, was **über** den Betrieb des Dienstes hinausgeht. Genau das gibt es hier nicht, und einer, der nach einer Erlaubnis fragt, die er nicht braucht, ist eine Gewohnheit und keine Auskunft.\n\nWas die App im Browser ablegt, dient allein dem Betrieb: dass du angemeldet bleibst, welches Design du gewählt hast, und ob du die Neuigkeiten schon gesehen hast.',
    keywords: ['cookie', 'banner', 'consent', 'tracking', 'analytics'],
  },
  {
    id: 'privacy-passwort',
    category: 'privacy',
    question: 'Wo liegt mein Passwort?',
    answer:
      'Nicht in dieser App. Es liegt bei einem eigenen Anmeldedienst, der ausschließlich für Anmeldungen zuständig ist — dort liegen dein Konto, dein Passwort, dein Anmeldename und deine E-Mail-Adresse samt Bestätigung.\n\nDie App bekommt dein Passwort nie zu sehen. Sie erfährt nur, dass du es warst.\n\nDeshalb führt „Passwort ändern" im Profil auch aus der App heraus.',
    keywords: ['passwort', 'sicherheit', 'keycloak', 'wo liegt'],
  },
  {
    id: 'privacy-daten',
    category: 'privacy',
    question: 'Welche Daten speichert die App über mich?',
    answer:
      'Nur, was sie zum Organisieren braucht: Anzeigename, Anmeldename, E-Mail-Adresse, optional dein Geburtstag (für die Geschenke-Planung), ob du ein Instrument spielst, ob du gerade hosten kannst, deine Wohnung, ob du Admin bist.\n\nDazu, was sich beim Benutzen ergibt: deine Zu- und Absagen, deine Abwesenheiten, welche Themen und Einheiten du gehalten hast, welche Lieder du eingetragen hast, deine gesetzten Actionstep-Haken, deine Benachrichtigungs-Einstellungen und die Geräte, auf denen du Benachrichtigungen erlaubt hast. Dein Profilbild liegt als Datei daneben.\n\nKein Standort, keine Kontakte, kein Kalenderzugriff, kein Nutzungsprofil, keine Werbung, keine Auswertung.',
    keywords: ['daten', 'gespeichert', 'welche', 'dsgvo', 'privatsphäre'],
  },
  {
    id: 'privacy-dritte',
    category: 'privacy',
    question: 'Verlässt irgendetwas die App?',
    answer:
      'Zweimal, und beide Male so wenig wie möglich:\n\n**Benachrichtigungen** gehen den Weg, den dein Gerät dafür vorschreibt — bei einem iPhone über Apple, bei Android über Google. Das lässt sich nicht umgehen; es ist der einzige Weg, wie eine Nachricht auf ein Telefon kommt, das gerade nicht offen ist. Dort steht der Text der Nachricht drin, also zum Beispiel „Du hostest am Dienstag". Wer keine Benachrichtigungen einschaltet, hat auch diesen Weg nicht.\n\n**Die beiden Knöpfe beim Eintragen eines Lieds** fragen ein Sprachmodell von Google. Dabei gehen Titel, Interpret oder die eingefügte Adresse hin — nichts über dich, keine Namen, kein Termin. Wer die Knöpfe nicht drückt, löst nichts aus.\n\nSonst nichts. Kein Tracking, keine Analyse-Werkzeuge, keine Anzeigen, nichts, was verkauft würde.',
    keywords: ['daten', 'gespeichert', 'welche', 'dsgvo', 'privatsphäre'],
  },
  {
    id: 'privacy-wer-sieht',
    category: 'privacy',
    question: 'Wer sieht meine Daten?',
    answer:
      'Nur dein eigener Hauskreis. Alles ist an die Gruppe gebunden; ein anderer Hauskreis sieht von euch nichts.\n\nInnerhalb der Gruppe sehen sich alle gegenseitig: Namen, Zusagen, Rollen. Die E-Mail-Adresse steht in der Mitgliederliste, weil man beim Einladen und Verwalten damit arbeitet.\n\nEin paar Dinge sind auch innerhalb der Gruppe geschützt: Der Inhalt einer noch nicht gehaltenen Themen-Einheit ist bis zum Beginn des Abends nur für die Zuständigen sichtbar, und Entwürfe ohne Abend sehen nur die, die am Thema mitarbeiten.',
    keywords: ['wer sieht', 'sichtbar', 'andere', 'privat'],
  },
  {
    id: 'privacy-loeschen',
    category: 'privacy',
    question: 'Was passiert mit meinen Daten, wenn ich gehe?',
    answer:
      'Beim **Verlassen** bleibt alles stehen, damit das Archiv stimmt — dein Profilbild wird gelöscht, deine kommenden Zusagen verschwinden.\n\nBeim **Konto löschen** fallen Name, E-Mail-Adresse und Geburtstag weg, dazu deine Benachrichtigungs-Einstellungen, die angemeldeten Geräte und deine Abwesenheiten. Dein Anmeldekonto wird gelöscht. Was bleibt, ist die anonyme Spur im Archiv: dass an jenem Abend jemand gehostet und ein Thema gehalten hat.\n\nWarum nicht spurlos? Weil sonst nicht nur dein Name verschwände, sondern auch die Abende selbst löchrig würden — für alle anderen.',
    keywords: ['löschen', 'gehen', 'daten weg', 'spuren'],
  },

  // ── Verwaltung (nur Admins) ───────────────────────────────────────────────
  {
    id: 'admin-generierung',
    category: 'admin',
    adminOnly: true,
    question: 'Wie funktioniert das Vorausplanen der Termine?',
    answer:
      'Ein Lauf jede Nacht um drei sorgt dafür, dass immer sieben Termine im Voraus stehen — am eingestellten Wochentag, zur eingestellten Uhrzeit. Der letzte reguläre Abend im Monat wird als „Lobpreis & Gebet" angelegt.\n\nDerselbe Lauf schließt vergangene Termine ab. Abgesagte behalten ihren Status: „fiel aus" ist etwas anderes als „hat stattgefunden".\n\nIm Admin-Bereich gibt es den Knopf **„Termine vorausplanen"**, falls du nicht warten willst. Er sagt dir, wie viele angelegt und wie viele übersprungen wurden — übersprungen heißt, dass an dem Datum schon etwas stand.',
    keywords: ['generator', 'nachts', 'cron', 'anlegen'],
  },
  {
    id: 'admin-rhythmus',
    category: 'admin',
    adminOnly: true,
    question: 'Wochentag, Uhrzeit, Zeitzone ändern — was gilt ab wann?',
    answer:
      'Im Admin-Bereich unter „Termin-Rhythmus", ein Formular für den einen Satz: „Wir treffen uns dienstags um 18 Uhr."\n\n**Wochentag und Uhrzeit gelten nur für neu erzeugte Termine.** Was schon im Kalender steht, behält seinen Tag und seine Zeit — dafür haben Leute zugesagt, ein Thema vorbereitet, das Wohnzimmer eingeplant. Der Generator füllt ab jetzt den neuen Tag auf, die alten laufen aus.\n\n**Die Zeitzone gilt sofort und für alles.** Sie sagt nicht nur, was „18 Uhr" bedeutet, sondern auch, welchen Tag ihr gerade habt — und daran hängt, was als „vorbei" gilt und wann der Inhalt eines Themas für alle sichtbar wird.\n\nÄndert sich die Uhrzeit des **nächsten** Termins, bekommen alle eine Benachrichtigung.',
    keywords: ['wochentag', 'uhrzeit', 'zeitzone', 'rhythmus', 'dienstag'],
  },
  {
    id: 'admin-gebet',
    category: 'admin',
    adminOnly: true,
    question: 'Wie greife ich in die Gebetsrunden ein?',
    answer:
      'Unter „Gebets-Rhythmus" stellst du die Länge einer Runde ein (eine bis zwölf Wochen, Vorgabe zwei).\n\n**„Jetzt weiterschalten"** beendet die laufende Runde und zieht die nächste geplante auf heute vor — alles Weitere rutscht mit. Die nächste Runde wird dabei **nicht** neu gewürfelt, sie kommt nur früher.\n\nHat die laufende Runde erst heute angefangen, gilt sie als verworfen und taucht nicht im Archiv auf; sie zählt aber weiter in die Wiederholungs-Vermeidung hinein. Lief sie schon länger, wird sie gestern abgeschlossen — diese Tage gab es ja.\n\n**„Gebetsrunden vorausplanen"** füllt den Vorlauf auf fünf Runden auf. Es meldet dabei niemandem etwas; das passiert erst, wenn eine Runde beginnt.',
    keywords: ['rotation', 'weiterschalten', 'gebet', 'runde'],
  },
  {
    id: 'admin-jobs',
    category: 'admin',
    adminOnly: true,
    question: 'Was machen die Knöpfe unter „Läufe"?',
    answer:
      'Sie stoßen von Hand an, was sonst nachts von selbst läuft. Nützlich zum Nachschauen, ob etwas hängt — und wenn du nicht bis morgen warten willst.\n\n**Termine vorausplanen** und **Gebetsrunden vorausplanen** füllen den Vorlauf auf.\n\n**Abwesenheiten abgleichen** sagt Termine ab, für die jemand als abwesend eingetragen ist. Das passiert normalerweise sofort beim Eintragen; der Lauf fängt die Fälle ab, in denen ein Termin erst später angelegt wurde.\n\n**Verwaiste Orte wegräumen** löscht stillgelegte Orte, an denen kein Termin und niemand mehr hängt.\n\nDie **Erinnerungen** (Host, Thema, Musik, Actionstep, besondere Termine) verschicken, was heute fällig wäre. Doppelt kommt nichts an — die App merkt sich, was sie schon verschickt hat.',
    keywords: ['jobs', 'läufe', 'manuell', 'wartung', 'knöpfe'],
  },
  {
    id: 'admin-mitglieder',
    category: 'admin',
    adminOnly: true,
    question: 'Wie verwalte ich Mitglieder?',
    answer:
      'Unter „Personen" im Admin-Bereich, oder im Profil unter „Mitglieder".\n\n**Einladen** — nur eine E-Mail-Adresse nötig. Bis zur ersten Anmeldung steht dort „eingeladen", und die Einladung lässt sich samt Konto zurücknehmen.\n\n**Entfernen** — geht denselben Weg wie ein selbst gewähltes Verlassen: Die Person kommt aus allen kommenden Planungen heraus, das Archiv behält ihren Namen, und eine neue Einladung an dieselbe Adresse holt alles zurück.\n\n**Admin-Rechte** lassen sich geben und nehmen. Der letzte Admin kann sich selbst nicht degradieren.\n\n**Dich selbst** kannst du hier nicht entfernen — dafür gibt es „Hauskreis verlassen" im Profil, wo auch die Frage nach der Nachfolge gestellt wird.',
    keywords: ['personen', 'mitglieder', 'entfernen', 'rechte', 'admin'],
  },
  {
    id: 'admin-gewichtung',
    category: 'admin',
    adminOnly: true,
    question: 'Was macht die Gewichtung?',
    answer:
      'Sie sagt, wie oft die Gruppe bei wem sein möchte — im Verhältnis zueinander. Der Normalwert ist 1: so oft wie alle anderen.\n\nHöher heißt öfter, niedriger heißt seltener. **Null heißt nie vorgeschlagen**, ohne die Wohnung von der Liste zu nehmen — praktisch für eine Adresse, die weit draußen liegt.\n\nDie Gewichtung hängt an der Wohnung, nicht an der Person: Wer zusammen wohnt, teilt sie sich.\n\nDie Orte selbst stehen im Archiv, nicht hier — hier steht nur die Gewichtung, weil sie eine Aussage über Menschen ist.',
    keywords: ['gewicht', 'häufigkeit', 'öfter', 'seltener', 'null'],
  },
  {
    id: 'admin-absagen',
    category: 'admin',
    adminOnly: true,
    question: 'Wann sage ich einen Abend ab, wann lösche ich ihn?',
    answer:
      '**Absagen** ist der Normalfall: Der Abend bleibt im Archiv als „fiel aus". Du kannst freiwillig einen Grund angeben — das ist der ganze Sinn des zusätzlichen Schritts, denn ein „fällt aus" ohne Erklärung erzeugt genau die Rückfragen, die man sich sparen wollte. Alle bekommen eine Nachricht. Bei einem vergangenen Abend heißt der Knopf „Als abgesagt markieren", und dann geht keine Nachricht raus — das ist nur eine Notiz fürs Archiv.\n\nEine Absage lässt sich zurücknehmen.\n\n**Löschen** geht nur bei besonderen Terminen, und niemand wird benachrichtigt. Ein Dienstag, der ausfällt, gehört in eure Geschichte (und der Generator legte ihn ohnehin wieder an); ein versehentlich eingetragener Geburtstag war nie da.',
    keywords: ['absagen', 'löschen', 'ausfallen', 'grund'],
  },
];
