# CLAUDE.md – Hauskreis-App (Backend-Kontext)

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

| Bereich | Wahl |
|---|---|
| Medium | PWA (kein natives App-Store-Release nötig) |
| Frontend | Next.js 16 (App Router) + React 19, TanStack Query, Tailwind 4, PWA über Serwist (`@serwist/next`) |
| Backend | NestJS 11 (TypeScript, Express-Adapter) |
| Datenbank / ORM | PostgreSQL 17 + Prisma 7 (Driver Adapter `@prisma/adapter-pg`) |
| Auth | Keycloak 26 (OIDC), Token-Prüfung via JWKS (`jose`); Rollen als Realm-Rollen |
| Validierung | Zod 4 über `nestjs-zod` (global registrierte Pipe) |
| Paketmanager | pnpm |
| Lint/Format | oxlint + Prettier |
| Jobs | `@nestjs/schedule` (in-process, da dauerhaft laufender Server) |
| Hosting Backend | dedizierter Node-Host (Keycloak braucht einen laufenden Prozess) |

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

### `locations`
- zB `id`, `name`, `frequency_factor` (Gewichtung: 3 Haupt-Locations häufiger, weitere seltener, abhängig von Stadt-Lage)
- Sonderfall: manche Termine haben **keinen Host** (z. B. Treffen im Schlosspark/draußen) → Feld bleibt leer, keine Rolle nötig, kein Fehlerzustand

### `meeting` (Termine)
- zB `id`, `date`, `location_id` (nullable), `host_person_id` (nullable), `topic_id` (nullable), `actionstep_text`, `summary_text`, `info_text`, `person[]`
- Termine finden jeden Dienstag in der Woche statt
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
- Wer zuerst **wählt**, wird Owner (nicht wer zuerst zugeteilt wurde). Wählen darf **nur, wer am Abend zugeteilt ist** — auch kein Admin, und „niemand zugeteilt heißt jede:r darf" gilt hier nicht. Wer eine Einheit hält, wird Mitarbeiter:in und darf am ganzen Thema schreiben; löschen darf nur der Owner. Fällt jemand aus der Zuteilung, verliert er die Einheit dieses Abends — und das Schreibrecht am Thema nur, wenn er sonst nirgends mehr daran hängt
- Ein mehrteiliges Thema zählt in der Vorschlagslogik wie **ein einzelner Slot** (nicht mehrfach)
- Ein Thema erscheint im Archiv, sobald einer seiner Abende vorbei ist. Titel, Actionstep und Zusammenfassung einer noch nicht gehaltenen Einheit sind bis **18 Uhr am Termintag** nur für die Zuständigen sichtbar
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
   - Wird der Baustein „Thema" abgeschaltet, fällt die Zuteilung weg (wie bei der Musik); die Einheit wird nur gelöst, nicht geleert
   - Gleiche Vorschlagslogik wie beim Host (nach "zuletzt Thema gehabt"), gezählt wird die Zuteilung am Termin

3. **Song-Zuteilung**
   - für jeden Termin gibt es mind. 1 Person (auch mehrere möglich), welche für die (alle) Songs zuständig ist
   - es gibt auch Termine ohne Songs, dann wird auch keine Person benötigt
   - zu beachten gilt: nicht jede Person kann ein Instrument spielen, die Zuteilung soll aber auch manuell mit intelligenten Vorschlägen erfolgen

4. **Gebetsbuddys**
   - Rotierendes System, alle 2 Wochen neue Zuteilung
   - 2er-/3er-Gruppen bei 9 Personen (geht nicht glatt auf → Logik für ungerade Verteilung nötig)
   - Reminder/Benachrichtigung bei neuer Zuteilung

5. **Actionsteps + Zusammenfassung**
   - Eintragung von Actionstep + Zusammenfassung nach jedem Treffen
   - Wöchentliche Erinnerung an den Actionstep
   - Zusammenfassung hilft auch Abwesenden, auf dem Laufenden zu bleiben

6. **Song-Vorschläge/Auswahl**
   - Zu jedem Termin können Song-Vorschläge gemacht werden
   - Ein Song besteht aus einem Titel (erforderlich), Artist und einer URL (optional) zu den Lyrics (werden nicht gespeichert, wir greifen hier auf externe Quellen zu)
   - Bereits vorgeschlagene Songs werden abgespeichert und können als Vorschlag angezeigt werden beim eintragen
   - Man baut sich mit der Zeit also eine Song-Datenbank auf, die sich durchsuchen lässt. Hier können jederzeit neue hinzukommen  

7. **Termin Absagen oder Rollen-Tausch**
   - Man soll Termine absagen können und auch angeben können in welchem Zeitraum man abwesend ist --> automatische absagen

8. **Archiv**
   - Es gibt ein Archiv, wo vergangene Termine und Themen angezeigt werden
   - Jedes Thema hat eine eigene Seite mit allen seinen Abenden; ein Filter zeigt zusätzlich die eigenen, noch nicht gehaltenen
   - Auch die Song-Datenbank kann hier eingesehen werden

## 7. Backlog (nicht priorisiert)

8. Geschenke-Koordination (Gruppenchat in der App, wo die betroffene Person, welche Geburtstag hat, nicht mit drin ist)
9. Essen / Too-Good-To-Go-Abholung (inkl. Vertretungsproblem)

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

- **Home-Screen** braucht einen kompakten Endpoint/View: nächstes Treffen, eigene Rollen (Host/Gebetsbuddy/Thema) als Badges, offener Actionstep, Kurzüberblick der aktuellen Woche
- es gibt eine **Kalender-Ansicht** und eine **Tabellenansicht (Mehrwochen-Planung)**
- Design-Ton (weniger backend-relevant, aber für Copy/Notification-Texte wichtig): warm, persönlich, informell ("Du bist dran mit dem Thema" statt "Thema: Person X")