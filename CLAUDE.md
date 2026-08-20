# CLAUDE.md – Acts2 (Backend-Kontext)

Diese Datei fasst alle bisherigen Überlegungen zusammen und dient als Kontext-/Steuerdatei für Claude Code bei der Backend-Entwicklung dieses Projekts. Bitte diese Datei vor größeren Änderungen am Datenmodell oder an der Business-Logik konsultieren.

---

## 1. Projektüberblick

Wir treffen uns wöchentlich in einem Hauskreis (9 Personen), singen gemeinsam Lieder und bearbeiten ein Thema, das jeweils eine Person vorbereitet. Die Organisation läuft aktuell komplett über WhatsApp (Nachrichten + einzelne PDFs) und ist dadurch unübersichtlich, kurzfristig und fehleranfällig.

Ziel ist eine **PWA**, die die Organisation des Hauskreises übernimmt – einfach, schnell zugänglich (kein Umweg über App Stores nötig) und mit möglichst wenig manuellem Abstimmungsaufwand ("kein Hin- und Her", aber am Ende zählt der Konsens der Gruppe).

## 2. Ausgangssituation / Probleme, die gelöst werden sollen

- **Host-Findung:** Sehr kurzfristig, kein klarer Überblick, wer wann hostet.
- **Themen-Zuteilung:** Liegt in WhatsApp-PDFs verstreut, geht unter, niemand hat wirklich den Überblick.
- **Song-Auswahl:** Sollte im Vorhinein passieren, aktuell nicht strukturiert.
- **Song-Zuteilung (Instrumente):** 4 Personen spielen Instrumente, Rotation aktuell nicht organisiert.
- **Gebetsbuddys:** Alle 2 Wochen neue Zuteilung in 2er-/3er-Gruppen (9 Personen, geht nicht glatt in 2er-Gruppen auf).
- **Geschenke-Koordination:** Viele einzelne Gruppen pro Person + zusätzliche Austausch-Gruppe = nervig.
- **Essen:** Bring & Share, meist holt eine Person bei "Too Good To Go" ab; Abholung fällt manchmal aus, weil kein Ersatz da ist.
- **Actionsteps:** Nach jedem Treffen soll ein Actionstep für die Woche festgehalten und Erinnerungen verschickt werden; funktioniert aktuell nur mäßig.

## 3. Tech-Stack

| Bereich         | Wahl                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Medium          | PWA (kein natives App-Store-Release nötig)                                                         |
| Frontend        | Next.js 16 (App Router) + React 19, TanStack Query, Tailwind 4, PWA über Serwist (`@serwist/next`) |
| Backend         | NestJS 11 (TypeScript, Express-Adapter)                                                            |
| Datenbank / ORM | PostgreSQL 17 + Prisma 7 (Driver Adapter `@prisma/adapter-pg`)                                     |
| Auth            | Keycloak 26 (OIDC), Token-Prüfung via JWKS (`jose`); Rollen als Realm-Rollen                       |
| Validierung     | Zod 4 über `nestjs-zod` (global registrierte Pipe)                                                 |
| Paketmanager    | pnpm                                                                                               |
| Lint/Format     | oxlint + Prettier                                                                                  |
| Jobs            | `@nestjs/schedule` (in-process, da dauerhaft laufender Server)                                     |
| Hosting Backend | dedizierter Node-Host (Keycloak braucht einen laufenden Prozess)                                   |

Das Backend liegt in [`hauskreis-backend/`](hauskreis-backend/) – Setup, Konventionen
und API-Übersicht stehen im dortigen [README](hauskreis-backend/README.md).
Das Frontend liegt in [`hauskreis-frontend/`](hauskreis-frontend/) – Aufbau,
Caching-Regeln und die ETag-Mechanik stehen im dortigen
[README](hauskreis-frontend/README.md).

> Hinweis: Ursprünglich war Supabase als Backend vorgesehen. Die Entscheidung wurde
> bewusst zugunsten eines eigenen NestJS-Servers mit Keycloak revidiert.

> Hinweis: Für die PWA war ursprünglich `@ducanh2912/next-pwa` vorgesehen. Dessen
> Autor hat es zugunsten von **Serwist** eingestellt; Serwist unterstützt Next 16
> und erlaubt eigenen Service-Worker-Code, den wir für Push ohnehin brauchen.

## 4. Grundprinzipien für die Zuteilungs-Logik

Mehrere Features (Host, Thema) folgen demselben Muster – bitte konsistent im Backend umsetzen:

- **Keine Zwangszuteilung**, sondern ein **Vorschlagssystem**: Die App schlägt 2–3 Optionen (also zuständige Personen) vor, basierend auf bestimmten Fakten. Der Mensch trägt final ein.
- Felder bleiben **leer, bis manuell eingetragen** – kein automatisches Hard-Assignment.
- Nachvollziehbarkeit vor Automatisierung: Die Vorschlagslogik muss für Nutzer:innen verständlich/nachvollziehbar sein, keine Blackbox.

## 5. Datenmodell – Kernentitäten

grundlegende Vorschläge für Kernentitäten:

### `user`

- zB `id`, `name`, `plays_instrument: bool`, `active: bool`, `birthdate`
- Man sollte als User einstellen können, ob man gerade generell überhaupt hosten kann, was bei den Vorschlägen für die Zuteilung berücksichtigt werden kann
- **Konto löschen heißt anonymisieren, nicht löschen.** Die Zeile bleibt, Name, E-Mail und Geburtsdatum fallen weg, das Anmelde-Konto auch. Ein hartes Löschen nähme die Zuschreibung (Gastgeber, Themen-Owner) _und_ die Mitgliedschaft (wer welche Einheit gehalten hat, Anwesenheiten) mit — das Archiv wäre danach nicht anonym, sondern löchrig. Im Archiv steht dann „Ehemaliges Mitglied"

### `locations`

- zB `id`, `name`, `frequency_factor` (Gewichtung: 3 Haupt-Locations häufiger, weitere seltener, abhängig von Stadt-Lage)
- Sonderfall: manche Termine haben **keinen Host** (z. B. Treffen im Schlosspark/draußen) → Feld bleibt leer, keine Rolle nötig, kein Fehlerzustand

### `meeting` (Termine)

- zB `id`, `date`, `start_minutes`, `location_id` (nullable), `host_person_id` (nullable), `topic_id` (nullable), `actionstep_text`, `summary_text`, `info_text`, `person[]`
- **Vier Bausteine** sagen, woraus ein Abend besteht: `has_topic_slot`, `has_notes_slot`, `has_song_slot`, `has_testimony_slot`. Die Terminart ist nur ihre Voreinstellung. Thema schließt Testimony aus und Nachbereitung ebenfalls — Testimony und Nachbereitung zusammen sind dagegen erlaubt
- **Drei davon plant man, den vierten nicht.** Die Nachbereitung steht nicht im Bausteinkasten: dort hätte man sie _vor_ dem Abend angehakt, also als es noch nichts nachzubereiten gab. Sie lässt sich erst **ab der Treffpunktzeit** anschalten, kommt über einen Hinweis am Abend selbst dazu und lässt sich genauso wieder ganz entfernen — danach steht wieder der Hinweis da
- `summary_text` und `actionstep_text` gehören zum Baustein **Nachbereitung** und damit dem Abend. Hat er ein Thema, stehen beide stattdessen an dessen Einheit und gehören dort dem Thema
- Termine finden wöchentlich statt. **Wochentag, Uhrzeit und Zeitzone stellt die Gruppe selbst ein** (`meeting_schedule_config`, Vorgabe Dienstag 18 Uhr, `Europe/Berlin`) — vorher standen alle drei als Konstante im Code, was für eine App für Hauskreise eine Aussage zu viel war. Ein Wechsel von Tag oder Zeit gilt für neu erzeugte Termine; was schon im Kalender steht, behält seinen Tag und seine Zeit. Die **Zone** gilt dagegen sofort für alles: sie sagt nicht nur, was `start_minutes` bedeutet, sondern auch, **welchen Tag wir gerade haben**
- Jeder Termin trägt eine **Treffpunktzeit** (`start_minutes`, Minuten seit Mitternacht Ortszeit). Ein Pflichtfeld: erzeugte Abende bekommen die Zeit der Gruppe, das Anlege-Formular ist damit vorbelegt. Ändert sie sich am **nächsten** Termin, bekommen die anderen eine Benachrichtigung
- **„Heute" ist der Kalendertag der Gruppe, nie der von UTC.** Das klingt nach einer Kleinigkeit und war ein handfester Fehler: „heute" wurde aus den UTC-Feldern eines Zeitpunkts gelesen, und zwischen Mitternacht und zwei Uhr Ortszeit war das noch gestern. Der Termin von gestern stand damit jede Nacht unter „Kommende", während die Detailseite ihn schon als „Vorbei" auswies — und seine Lieder ließen sich in diesem Fenster nicht abhaken. Ein Termin gilt weiterhin seinen ganzen Tag über als kommend; nur wird jetzt richtig gezählt, welcher Tag das ist. Frontend und Backend rechnen dafür in derselben Zone
- Ein Termin ohne Host ist ein valider Zustand (z. B. Outdoor-Treffen im Park)
- Folgende Terminarten gibt es: "Standard", "Lobreis/Gebetsabend", "Custom"
- Es gibt "Standard" Termine, welche vom Backend automatisch erstellt werden im Vorhinein, sodass immer mind. 7 Termine im Vorhinein zuteilbar sind, Standard Termine haben ein Thema
- "Lobpreis/Gebetsabend" hat anstelle eines Themas ein "Testimony" oder garnichts (nur Lieder), diese Termine werden auch automatisch erstellt und ersetzen einen "Standard" Termin immer am letzten Termin vor Monatsende
- "Custom" ist ein selbst erstellter Termin, welcher keine vorausgesetzten Bedingungen wie bspw Host oder Thema erfüllen muss, allgemein sollte man Termine in ihrer Art bearbeiten können (bspw. von "Standard" zu "Custom" mit Titel "Geburtstag von ...", sozusagen ein special Hauskreis-Treffen, wo wir Geburtstag feiern)

### `topic` (Themen) + `topic_session` (Einheiten)

- `topic`: `id`, `title` (**optional**, nicht jeder trägt vorab einen ein), `summary_text` (Bogen über alle Abende), `status` ("läuft" / "abgeschlossen"), `owner_person_id`, Mitarbeitende
- `topic_session`: ein **Abend** eines Themas — `title`, `actionstep_text`, `summary_text`, `meeting_id` (**nullable**, `UNIQUE`)
- Ein Thema ist **nicht 1:1 an einen Termin gebunden** – es zieht sich über beliebig viele Einheiten
- Drei Dinge sind getrennt: **Zuständigkeit** (`meeting_topic_responsible`), **Auswahl** (`topic_session.meeting_id`) und **Inhalt**. Dazwischen liegt der Zustand „zugeteilt, aber noch nichts gewählt"
- `meeting_id = NULL` heißt **unfertig**: vorbereitet, aber an keinem Abend. Wechselt die Rolle, wird entkoppelt statt gelöscht — die Vorbereitung wartet als Entwurf und lässt sich jederzeit wieder aufnehmen
- Wer zuerst **wählt**, wird Owner (nicht wer zuerst zugeteilt wurde) — **oder wer das Thema im Archiv anlegt.** Ein Thema entsteht auf beiden Wegen: beim Wählen an einem Abend, oder im Voraus ohne Termin, um es in Ruhe vorzubereiten. Wählen darf **nur, wer am Abend zugeteilt ist** — auch kein Admin, und „niemand zugeteilt heißt jede:r darf" gilt hier nicht. Wer eine Einheit hält, wird Mitarbeiter:in und darf am ganzen Thema schreiben; löschen darf nur der Owner. Fällt jemand aus der Zuteilung, verliert er die Einheit dieses Abends — und das Schreibrecht am Thema nur, wenn er sonst nirgends mehr daran hängt
- Ein mehrteiliges Thema zählt in der Vorschlagslogik wie **ein einzelner Slot** (nicht mehrfach)
- Ein Thema erscheint im Archiv, sobald einer seiner Abende vorbei ist. Titel, Actionstep und Zusammenfassung einer noch nicht gehaltenen Einheit sind **bis der Abend anfängt** nur für die Zuständigen sichtbar — maßgeblich ist die Treffpunktzeit dieses Termins, nicht mehr pauschal 18 Uhr
- Ein vergangener Abend wird **eingefroren**: seine Einheit bleibt daran hängen, auch wenn die Rolle danach noch wechselt
- Eine Einheit lässt sich auch **ohne Abend** anlegen — der Ort zum Vorarbeiten. Sie wartet unter „Angefangenes", bis jemand sie an einem Termin auswählt; dort zählt auch eine, die gerade an einem anderen kommenden Abend hängt (sie zieht dann um). Löschen geht nur, solange sie nicht gehalten wurde

### `host_history` / abgeleitet aus `meetings`

- `last_hosted_date` + `frequency_factor` pro Person/Location als Datenbasis für Vorschlagslogik

### `prayer_buddy_groups` (Gebetsbuddys)

- Rotation alle 2 Wochen
- 9 Personen → Gruppen zu 2 oder 3 (nicht alle Gruppen gleich groß)
- `id`, `period_start`, `period_end`, `member_person_ids[]`

## 6. Features

1. **Host-Zuteilung**
   - flexibel änderbar
   - Rechtzeitige Erinnerung vor dem eigenen Hosting-Termin
   - Kein Host bei bestimmten Location-Typen (z. B. draußen) – Feld bleibt leer
   - Ungleiche Gewichtung der Locations (3 Haupt-Locations häufiger)
   - Die Zuteilung geschieht manuell, aber bei der Zuteilung werden Vorschläge gegeben, wer am besten als nächstes passt
   - Vorschlagslogik: mehrere Vorschläge beim Eintragen, für die Personen werden bestimmte Fakten angezeigt bspw. wann er das letzte Mal gehostet hat oder das nächste Mal hosten muss, oder vllt schon für musik zuständig ist. Die Vorschläge sollen intelligent sein, also Personen, die am wenigsten zu tun haben sollen oben angezeigt werden

2. **Themen-Zuteilung**
   - Dynamisch tauschbar
   - Thema als eigene Entität, optionaler Titel, kann mehrere Termine laufen
   - Zwei Schritte: erst wird jemand für den Abend **zugeteilt**, dann **wählt** diese Person — neues Thema, ein eigenes fortsetzen, oder eine offene Einheit aufnehmen
   - Steht schon etwas, ist ein zweites Wählen ein **Wechsel**: die bisherige Einheit löst sich und wartet als Entwurf
   - **Wer dazukommt, setzt die Wahl zurück.** Kommt jemand nachträglich zur Rolle, der zum Thema noch nicht gehört, steht der Abend wieder auf „Thema wählen" — die Vorbereitung wartet als Entwurf und lässt sich sofort wieder aufnehmen. Sonst rutschte er still in eine Vorbereitung, die er nie gewählt hat, samt Schreibrecht am ganzen Thema. Wer schon mitschreibt, löst nichts aus: dort ist nichts zu entscheiden, was nicht schon entschieden wäre. Umgekehrt fragt die Wahl nach, wenn außer einem selbst noch jemand zugeteilt ist („bereitet ihr das zusammen vor?"). Fällt jemand wieder aus der Zuteilung, verschwindet er auch wieder aus der Einheit — **nur der Owner nicht**, dem gehört sie
   - **Mit dem Owner oder gar nicht.** Fällt *er* aus der Zuteilung, geht die Einheit mit vom Abend und die Mitwirkenden kommen von ihr herunter — auch wenn jemand zugeteilt bleibt, den er selbst dazugeholt hat. Sie sind seine Helfer und nicht seine Nachfolger. Maßgeblich ist das **Herausfallen**, nicht „der Owner ist nicht zugeteilt": Ein Thema über mehrere Abende darf reihum gehalten werden, und eine fremde Rollenänderung nimmt einem Mitarbeiter seinen Abend nicht weg
   - **Der Owner ist ausgenommen: er zieht den Kreis um seine Einheit selbst.** Holt er jemanden dazu oder nimmt ihn wieder heraus, bleibt die Wahl stehen — das Zurücksetzen schützt eine Vorbereitung vor fremdem Zugriff, nicht vor der Person, der sie gehört. Ein Admin bekommt hier **keinen** Freifahrtschein, und ein Mitarbeiter auch nicht: Wen man in *diese* Vorbereitung holt, entscheidet, wer sie angefangen hat. Die Zuteilung sagt beide Fälle vorher an
   - Wird der Baustein „Thema" abgeschaltet, fällt die Zuteilung weg (wie bei der Musik); die Einheit wird nur gelöst, nicht geleert
   - **Geschrieben wird die Einheit auf ihrer eigenen Seite**, nicht am Termin. Die Terminkarte zeigt sie und führt hinein; zwei Orte für dieselben drei Felder wären zwei Meinungen darüber, wo sie hingehören — und der Termin kann weniger (kein Löschen, kein Überthema, keine Beteiligten)
   - Gleiche Vorschlagslogik wie beim Host (nach "zuletzt Thema gehabt"), gezählt wird die Zuteilung am Termin

3. **Song-Zuteilung**
   - für jeden Termin gibt es mind. 1 Person (auch mehrere möglich), welche für die (alle) Songs zuständig ist
   - es gibt auch Termine ohne Songs, dann wird auch keine Person benötigt
   - zu beachten gilt: nicht jede Person kann ein Instrument spielen, die Zuteilung soll aber auch manuell mit intelligenten Vorschlägen erfolgen
   - **Lieder abhaken darf vor dem Abend nur, wer an dem Abend die Musik macht** — kein Admin-Freifahrtschein, und „niemand zugeteilt heißt jede:r darf" gilt hier nicht. Vorher ist das Abhaken eine Entscheidung („das singen wir"), und die trifft, wer die Lieder übt. **Ist der Termin vorbei, darf jede:r** — dann ist es ein Protokoll („das haben wir gesungen")

4. **Gebetsbuddys**
   - Rotierendes System, alle 2 Wochen neue Zuteilung
   - 2er-/3er-Gruppen bei 9 Personen (geht nicht glatt auf → Logik für ungerade Verteilung nötig)
   - Reminder/Benachrichtigung bei neuer Zuteilung

5. **Actionsteps + Zusammenfassung**
   - Eintragung von Actionstep + Zusammenfassung nach jedem Treffen
   - Wöchentliche Erinnerung an den Actionstep
   - Zusammenfassung hilft auch Abwesenden, auf dem Laufenden zu bleiben
   - Beides hängt **entweder** am Thema (an dessen Einheit, wo es einen Rollenwechsel überlebt) **oder** am Abend selbst, über den Baustein „Nachbereitung". Ein Abend ohne Thema — nur Lobpreis, ein besonderer Termin — hatte vorher keinen Ort dafür, obwohl der Vorsatz für die Woche dort genauso entsteht. Die beiden Bausteine schließen einander aus, damit es nie zwei Zusammenfassungen und zwei Actionsteps gibt
   - Die Nachbereitung ist **optional und wird nicht vorgeplant**: ab Terminbeginn steht an einem Abend ohne Thema ein Hinweis „Nachbereitung hinzufügen?" — ein Klick legt die Sektion an, im Bearbeitungsmodus lässt sie sich wieder ganz entfernen. Nicht jeder Abend braucht eine; eine leere Karte an jedem Termin wäre eine Aufforderung, der man meistens nicht nachkommt
   - **Auch innerhalb der Karte ist jedes der beiden Stücke einzeln und optional.** Zusammenfassung und Actionstep stehen nur da, wenn etwas drinsteht; im Bearbeitungsmodus legt ein Knopf das fehlende an und öffnet gleich das Eingabefeld. Bleibt es leer, verschwindet es wieder — ein Feld ohne Inhalt gibt es nicht, und manchmal gibt es eben nur einen Vorsatz und nichts zusammenzufassen. Solange gar nichts geschrieben ist, steht außerhalb des Bearbeitungsmodus wieder der Hinweis statt einer leeren Karte
   - Der **Haken** hängt seit jeher am Termin und gilt pro Person; er funktioniert für beide Quellen unverändert. Setzen lässt er sich erst, **wenn der Abend angefangen hat** — maßgeblich ist die Treffpunktzeit, nicht der Kalendertag: einen Vorsatz für heute Abend hakt man heute früh nicht ab

6. **Song-Vorschläge/Auswahl**
   - Zu jedem Termin können Song-Vorschläge gemacht werden
   - Ein Song besteht aus einem Titel (erforderlich), Artist und einer URL (optional). Die URL zeigt auf **Text oder Akkorde** — bei 4 Instrumentalist:innen ist ein Akkordblatt genauso der richtige Link. Der Inhalt wird nie gespeichert, wir verlinken nach draußen
   - Neben dem Link-Feld steht ein Knopf, der ihn **öffnet** — gerade beim KI-Vorschlag ist „stimmt der überhaupt" die nächste Frage, und bisher hieß das: markieren, kopieren, woanders einfügen. Er erscheint erst, wenn im Feld eine echte `http(s)`-Adresse steht
   - Bereits vorgeschlagene Songs werden abgespeichert und können als Vorschlag angezeigt werden beim eintragen
   - Man baut sich mit der Zeit also eine Song-Datenbank auf, die sich durchsuchen lässt. Hier können jederzeit neue hinzukommen
   - **Zwei Abkürzungen beim Erfassen, beide per Knopfdruck** (nie beim Tippen — jeder Aufruf dauert Sekunden und kostet etwas): aus einem eingefügten Link Titel und Interpret lesen, und umgekehrt zu Titel und Interpret bis zu drei Links vorschlagen. Umgesetzt mit Gemini; die Suche bevorzugt Ultimate Guitar, dann Genius
   - **Der zweite Druck sucht daneben weiter.** Vorher kam beliebig oft derselbe Zwischenspeicher zurück — wer einen schlechten Vorschlag bekommen hatte, war damit fertig. Jetzt bleiben die bisherigen stehen (mit „neu" markiert, was dazukam), und die bekannten Adressen gehen als „kennen wir schon" mit in die Anfrage. Ein Vorschlag pro Seite gilt nur **innerhalb** eines Laufs: zwei Ultimate-Guitar-Links nebeneinander sind genau der Sinn der Sache, wenn der erste nicht taugte
   - Die Hilfe füllt **nur leere Felder**. Steht schon etwas anderes drin, wird es angeboten statt überschrieben — sonst löscht ein Knopfdruck die eigene Korrektur
   - **Jeder vorgeschlagene Link wird vor der Rückgabe abgerufen, und gespeichert wird das Ziel der Weiterleitung.** Ein Sprachmodell schreibt überzeugende URLs auf, die es nie gab, und die Suche liefert Google-Weiterleitungen, die nach Wochen ablaufen — beides wäre als `lyricsUrl` eine Zeitbombe
   - **Beim Lesen eines Links geht nur der Seitenkopf ans Modell**, nicht die Seite: Eine Ultimate-Guitar-Seite wiegt 36.000 Tokens, `<title>` und `og:`-Angaben rund 250. Nur wenn der eigene Abruf scheitert (Cloudflare), holt Google die Seite
   - Ohne `GEMINI_API_KEY` verschwinden nur die beiden Knöpfe, alles andere bleibt wie es ist

7. **Termin Absagen oder Rollen-Tausch**
   - Man soll Termine absagen können und auch angeben können in welchem Zeitraum man abwesend ist --> automatische absagen
   - Sagen **alle** ab, fällt der Abend von selbst aus. Der Weg zurück ist eine Zusage, kein Admin-Eingriff: in der „Fällt aus"-Meldung steht dafür ein Knopf, für jede:n

8. **Termin-Rhythmus (Verwaltung)**
   - Wochentag, Uhrzeit und **Zeitzone** der automatisch erzeugten Termine sind einstellbar (Vorgabe Dienstag 18 Uhr, `Europe/Berlin`)
   - Tag und Uhrzeit gelten für neue Termine, nicht rückwirkend — was schon steht, hat schon Zusagen
   - Die Zeitzone gilt sofort und überall: in ihr wird die Uhrzeit gelesen **und** gezählt, welchen Tag wir haben. Geprüft wird gegen die Liste, die die Laufzeit ohnehin mitbringt (`Intl.supportedValuesOf`), damit kein Tippfehler still danebengeht
   - Ändert sich die Uhrzeit des **nächsten** Termins, bekommen die anderen eine Benachrichtigung

9. **Geburtstage und Geschenke**
   - Geburtstage kommen aus `person.birthdate` und sonst nirgendwoher. Ohne Eintrag steht die Person nirgends — **auch nicht als Schenkende**: Der Platz in der Reihe *ist* der Geburtstag
   - Sie stehen im Kalender (Punkt in der Ecke der Zelle), in der Terminliste bis zum letzten geladenen Abend, und in einem eigenen Register „Geburtstage" neben Liste, Planung und Kalender
   - **Je Person gibt es genau eine offene Runde**, nämlich ihr nächster Geburtstag; ältere bleiben als Geschichte stehen. Deshalb gibt es keine „vergangenen Geburtstage": Wer gestern gefeiert hat, steht ab heute wieder unten unter „Kommende", mit dem Geburtstag in einem Jahr
   - **Die Zuteilung: du bekommst den, der als nächstes dran ist.** Alle Geburtstage der Reihe nach durchs Jahr, und wer gerade gefeiert hat, besorgt das Geschenk für den nächsten. Daraus fällt von selbst ab, dass in einem Jahr jede:r genau einmal dran ist, dass niemand für sich selbst zuständig ist, und dass man genau dann erinnert wird, wenn man es zuletzt selbst erlebt hat
   - Die Zuständigkeit wird **gerechnet und gespeichert**. Beides zusammen ist der Punkt: Rechnen allein könnte die Vergangenheit nicht festhalten und würde jede nahe Zuteilung noch umwerfen; Speichern allein zöge nicht nach, wenn jemand seinen Geburtstag nachträgt
   - **Was eingefroren ist, wird nicht angefasst** — weder von einem Moduswechsel noch von einem nachgetragenen Datum. Zwei Gründe: die Frist läuft (Vorgabe 14 Tage, vom Admin einstellbar), oder es steht schon ein **Preis** dran. Wer das Geschenk hat, darf die Zuständigkeit nicht mehr verlieren
   - Geschenk-Vorschläge hängen an der **Person**, nicht am Geburtstag: Was übrig blieb, ist nächstes Jahr immer noch eine gute Idee, und was genommen wurde, muss man kennen, um es nicht zweimal zu schenken. Zustimmen darf jede:r bei beliebig vielen; **aussuchen und den Preis eintragen** nur, wer besorgt
   - **Wer Geburtstag hat, sieht nichts** — und zwar nicht ausgeblendet, sondern nie verschickt (`ideas: null`, `gift`/`priceCents`/`giftDecided` leer). Eine Überraschung, die nur eine Entwicklerkonsole weit weg ist, ist keine
   - Der Admin kann das Ganze **abschalten** (Vorgabe) oder auf eine **feste** Zuteilung umstellen, die Runde für Runde gleich bleibt. Ändert sich dabei die Gruppe, schließt das System die Lücken selbst, bleibt aber auf „fest" und weist in der Verwaltung darauf hin
   - Drei Benachrichtigungen: die Zuständigkeit hat gewechselt (Ereignis), der Geburtstag rückt näher (Vorlaufzeit, Vorgabe 14 Tage), es steht fest was es wird (Ereignis). Die **Vorlaufzeit bestimmt zugleich**, ab wann die Rolle auf dem Startbildschirm unter „Deine Rollen" steht — zwei Systeme mit zwei Meinungen darüber, ab wann etwas ansteht, wären eines zu viel

10. **Archiv**
   - Es gibt ein Archiv, wo vergangene Termine und Themen angezeigt werden
   - Jedes Thema hat eine eigene Seite mit allen seinen Abenden; zwei Register trennen „Eigene" (auch die noch nicht gehaltenen) von „Alle"
   - Hier lassen sich auch neue Themen und Lieder anlegen — der Ort zum Vorarbeiten, ohne auf einen Dienstag zu warten
   - Auch die Song-Datenbank kann hier eingesehen werden
   - Das Register **„Termine"** steht als letztes, weil man hier meistens ein Thema oder ein Lied sucht und nur manchmal einen Abend. Es zeigt je Abend die Art, den Zeitpunkt samt Uhrzeit und die Nachbereitung — egal ob sie vom Thema oder vom Baustein kommt. Abgesagte Abende blendet eine Checkbox ein; von selbst stehen sie nicht da, weil man nachliest, was war

## 7. Backlog (nicht priorisiert)

1. Essen / Too-Good-To-Go-Abholung (inkl. Vertretungsproblem)

> Die Geschenke-Koordination stand hier einmal als Punkt 8. Sie ist gebaut
> (§6.9) — allerdings ohne den ursprünglich angedachten Gruppenchat: Vorschläge
> mit Zustimmung beantworten dieselbe Frage, ohne dass ein zweiter Chat neben
> WhatsApp entsteht, gegen den diese App eigentlich gebaut ist.

## 8. Push-Notifications (PWA/iOS) – technische Anforderungen

Notwendig für Erinnerungen (Host, Actionstep, Gebetsbuddy-Zuteilung):

1. App muss über **HTTPS** ausgeliefert werden (Secure Context nötig für Notification API)
2. `manifest.json` mit `"display": "standalone"` muss vorhanden sein
3. Ein **Service Worker** muss registriert sein (sonst keine Subscription möglich)
4. **iOS-Sonderfall:** Push funktioniert nur nach "Zum Home-Bildschirm hinzufügen" – im normalen Safari/Chrome-Tab auf iOS 16.4+ deaktiviert
5. `requestPermission()` muss durch eine **explizite Nutzeraktion** ausgelöst werden (z. B. Button-Klick), nicht automatisch beim Laden

**Status EU/Deutschland:** Push funktioniert seit iOS 17.4 (März 2024) uneingeschränkt, auch in der EU.

**Wichtiges technisches Detail für den Service Worker:** Im `push`-Event-Handler unbedingt `event.waitUntil()` verwenden – sonst können Subscriptions nach wenigen Benachrichtigungen abbrechen.

**Android/Desktop:** Push funktioniert direkt über den Browser, keine Einschränkungen.

## 9. UI/UX-Kontext (relevant für API-/Datenmodell-Design)

Auch wenn der Fokus hier auf dem Backend liegt, beeinflussen folgende UI/UX-Entscheidungen die API:

- **Home-Screen** braucht einen kompakten Endpoint/View: nächstes Treffen, eigene Rollen (Host/Gebetsbuddy/Thema) als Badges, offener Actionstep, Kurzüberblick der aktuellen Woche. Die Karte „Nächstes Treffen" trägt oben rechts die **Uhrzeit** mit Uhr-Symbol — nur dort: auf den Terminlisten liest man quer über Wochen, da wäre sie an jeder Zeile Rauschen
- Die **Begrüßung wechselt**, täglich und passend zur Tageszeit, und nicht nur auf Hochdeutsch (österreichisch, schwäbisch, fränkisch). „Hallo Niko! Schön, dass du da bist." stand dort jeden Tag, und einen Satz, den man jeden Tag liest, liest man irgendwann nicht mehr. Welcher es ist, wird aus Datum und Personen-Id gerechnet — pro Tag fest, damit er nicht unter dem Daumen wegspringt, und pro Person verschieden, damit nicht alle neun dasselbe lesen
- **Vier Bildschirme tragen ein Hintergrundbild im Kopfbereich**: Heute, Gebet, Archiv, Profil. **Termine bewusst nicht** — dort liest man eine Liste über Wochen und sucht eine Zeile, ein Foto darüber wäre nur Weg bis zur ersten. Ein Bild gilt für die ganze Gruppe, jede:r darf es tauschen (`header_image`, Datei im Volume wie die Profilbilder). Solange keins hochgeladen ist, steht ein Verlauf da — je Bildschirm ein eigener, ehrlicher als ein Stockfoto und trotzdem eine Orientierung, wo man ist. Über allem liegt ein Schleier, der nach unten in die Leinwand ausläuft: er ist der Grund, warum die Überschrift auf **jedem** Foto lesbar bleibt
- es gibt eine **Kalender-Ansicht** und eine **Tabellenansicht (Mehrwochen-Planung)**. In der Planung ist ein Abend, an dem jede Rolle vergeben ist, die es an ihm gibt, als **„fertig geplant"** markiert (grüne Zeile mit Haken). Ein Baustein, der aus ist, fehlt nicht — und ein Ort ohne Host-Bedarf auch nicht
- Design-Ton (weniger backend-relevant, aber für Copy/Notification-Texte wichtig): warm, persönlich, informell ("Du bist dran mit dem Thema" statt "Thema: Person X")
