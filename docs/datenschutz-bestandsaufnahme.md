# Bestandsaufnahme für die Datenschutzerklärung

Diese Datei ist **kein Rechtstext**, sondern die Eingabe für einen: Sie sagt,
welche Daten Acts2 verarbeitet, wo sie liegen und wohin sie gehen. Alles darin
stammt aus dem Quelltext dieses Projekts; hinter jeder Angabe steht die
Fundstelle, damit man sie nachprüfen kann, statt sie glauben zu müssen.

**Stand:** 19.08.2026. Wer am Datenmodell, an den Benachrichtigungen oder an der
Lied-Suche etwas ändert, ändert auch dieses Dokument.

> Am Ende steht unter **„Was hier fehlt"** eine kurze Liste mit Dingen, die im
> Code nicht stehen können — Anbieter, Standorte, Fristen. Ohne sie ist die
> Erklärung nicht vollständig.

---

## 1. Der Befund vorweg: es gibt nichts Nicht-Essenzielles

Das ist der ungewöhnlichste Punkt dieser Aufnahme, deshalb steht er oben.

- **Keine Analyse, keine Statistik, keine Werbung, kein Tracking.** Kein
  Google Analytics, kein Plausible, kein Matomo, kein Pixel, kein A/B-Werkzeug.
- **Keine externen Schriften zur Laufzeit.** Die Schriften kommen über
  `next/font`, das sie **zur Bauzeit** herunterlädt und aus der eigenen Domain
  ausliefert (`src/app/layout.tsx`, `src/app/globals.css`). Der Browser der
  Nutzer spricht dabei nie mit Google.
- **Keine Einbettungen.** Keine YouTube-Videos, keine Karten im iframe, keine
  Social-Plugins.
- **Keine eigenen Cookies.** Die App setzt keine. Keycloak setzt seine
  Sitzungs-Cookies, aber auf seiner eigenen Domain `auth.acts2.de`.

Daraus folgt: Ein Cookie-Banner nach § 25 TDDDG hätte hier nichts zu fragen —
es gibt keinen Zugriff auf Endgeräte-Informationen, der über das für den Dienst
unbedingt Erforderliche hinausginge. Was es sehr wohl braucht, ist die
ausdrückliche Einwilligung nach Art. 9 (2) (a) DSGVO; siehe Abschnitt 6.

---

## 2. Wohin Daten das Haus verlassen

| Empfänger | Was ankommt | Wann | Fundstelle |
| --- | --- | --- | --- |
| **Cloudflare Pages** (Hosting von `acts2.de`) | IP-Adresse, User-Agent, aufgerufene Adresse, Zeitpunkt | bei jedem Aufruf der App | `deploy/README.md` |
| **Eigener VPS, nginx** (`api.acts2.de`, `auth.acts2.de`) | IP-Adresse in den Zugriffsprotokollen (`X-Real-IP`, `X-Forwarded-For`) | bei jedem API- und Anmeldevorgang | `deploy/nginx/api.conf`, `auth.conf` |
| **SMTP-Anbieter** | Empfängeradresse und Mailinhalt | Einladung, Adressbestätigung, Passwort-Reset | `hauskreis-backend/scripts/setup-keycloak.sh` |
| **Push-Dienst des Browsers** (Google FCM bei Chrome/Android, Apple bei Safari/iOS, Mozilla bei Firefox) | Endpunkt-Adresse, Zeitpunkt, Größe — **nicht der Inhalt** | bei jeder Benachrichtigung | `src/notification/notification.service.ts` |
| **Google Gemini API** | Liedtitel, Interpret, schon bekannte Adressen; oder der `<title>`/`og:`-Kopf einer eingefügten Seite | **nur** auf Knopfdruck im Lied-Formular | `src/song/gemini.client.ts` |
| **Google Suche** (Werkzeug `google_search` innerhalb derselben Anfrage) | dieselbe Suchanfrage nach dem Lied | dito | `src/song/song-lookup.service.ts` |
| **Die vorgeschlagene Liedseite** (z. B. Ultimate Guitar, Genius) | die **Server**-IP, nicht die des Nutzers — der Server ruft den Link ab, um Weiterleitungen aufzulösen | dito | `src/song/song-lookup.service.ts:405` |
| **Google Maps** | erst wenn jemand auf eine Adresse tippt und die Karte öffnet | selten, immer nutzerausgelöst | `src/lib/meeting.ts` |
| **GitHub** (Actions, Container Registry) | Quelltext und Images — **keine** Nutzerdaten | bei jedem Deploy | `.github/workflows/` |

### Drei Punkte, die eine Standard-Erklärung falsch darstellen würde

**Push-Inhalte sind Ende zu Ende verschlüsselt.** Die Bibliothek `web-push`
verschlüsselt den Inhalt mit den Schlüsseln des Endgeräts (VAPID, `aes128gcm`).
Google, Apple und Mozilla stellen zu, sehen aber nur Endpunkt, Zeitpunkt und
Größe — nicht, dass jemand am Dienstag das Thema hat. Eine Formulierung wie
„Übermittlung von Benachrichtigungsinhalten an Google" wäre sachlich falsch.

**Gemini bekommt keine Personendaten.** Übertragen werden Liedtitel und
Interpret. Der Aufruf geschieht **nur** auf ausdrücklichen Knopfdruck im
Lied-Formular („Link suchen", „Aus Link ausfüllen"), nie beim Tippen und nie im
Hintergrund. Ohne `GEMINI_API_KEY` verschwinden die beiden Knöpfe ganz.

**Der Linkabruf geht vom Server aus.** Wenn der Server einen vorgeschlagenen
Link abruft, um die Weiterleitung aufzulösen, sieht die Zielseite die IP des
Servers. Die IP der Nutzer erfährt sie erst, wenn jemand den Link selbst
anklickt.

---

## 3. Was gespeichert wird — eigene Datenbank

Alles in einer PostgreSQL-Datenbank auf dem eigenen VPS
(`hauskreis-backend/prisma/schema.prisma`).

**Zur Person** — Anzeigename, Anmeldename, E-Mail-Adresse, Geburtsdatum
(optional), Profilbild, ob jemand ein Instrument spielt, ob er gerade hosten
kann, ob Abende automatisch zugesagt werden, Verknüpfung zum Keycloak-Konto,
Beitrittszeitpunkt.

**Zum Wohnen** — Name und Anschrift der Wohnung, Koordinaten, Kapazität. Damit
liegen die **Privatadressen** der Mitglieder in der Datenbank.

**Zum Gruppenleben** — Termine samt Uhrzeit und Ort; wer wann zugesagt, abgesagt
oder nichts gesagt hat; eingetragene Abwesenheitszeiträume; wer Gastgeber,
Thema, Musik oder Testimony übernimmt; **Gebetsanliegen** als freier Text;
Themen mit Zusammenfassungen und Actionsteps; Lieder samt Links; wer mit wem
betet; Geburtstage, Geschenk-Ideen, Zustimmungen dazu und Preise; das
Hintergrundbild der Gruppe.

**Technisches** — Push-Abonnements (Endpunkt und Schlüssel je Gerät),
Benachrichtigungs-Einstellungen, und ein Protokoll darüber, **dass** eine
Benachrichtigung verschickt wurde: Empfänger, Art, Bezug und Zeitpunkt. **Der
Text der Nachricht wird nicht gespeichert** (`model NotificationLog`).

**Dateien** — Profilbilder und Hintergrundbilder liegen als Dateien in einem
Docker-Volume auf dem VPS (`UPLOAD_DIR`, Unterordner `people/` und `headers/`),
nicht in der Datenbank und nicht bei einem Bilderdienst.

## 3a. Was Keycloak speichert

Eigene Instanz auf demselben VPS, eigene Datenbank: Anmeldename, E-Mail-Adresse,
Passwort-Hash, ob die Adresse bestätigt ist, offene Pflichtaktionen, Sitzungen
und Anmeldeereignisse.

---

## 4. Was im Browser liegt

**`localStorage`**

| Schlüssel | Inhalt | Zweck |
| --- | --- | --- |
| `oidc.*` | Zugangs- und Erneuerungs-Token | Angemeldet bleiben, auch nach dem Schließen (`src/lib/auth/oidc-config.ts`) |
| Design-Wahl | `light` / `dark` / `system` | `src/lib/theme.ts` |
| „Neuigkeiten gesehen" | zuletzt gesehene Version | `src/lib/release-storage.ts` |
| zuletzt gewählter Hauskreis | Id | `src/lib/hauskreis/hauskreis-context.tsx` |

**`sessionStorage`** — ein Zeitstempel, der verhindert, dass die App nach einem
Ladefehler in eine Neulade-Schleife gerät (`src/lib/chunk-error.ts`).

**Cache Storage (Service Worker)** — die App-Hülle, Seiten und statische
Dateien, damit sie offline startet. **API-Antworten werden ausdrücklich nicht
zwischengespeichert** (`src/app/sw.ts`, `NetworkOnly`) — auf einem geteilten
Gerät käme sonst nach einem Kontowechsel die Antwort für jemand anderen zurück.

**Cookies** — keine eigenen. Keycloak setzt auf `auth.acts2.de` seine
Sitzungs-Cookies (`AUTH_SESSION_ID`, `KEYCLOAK_IDENTITY`, `KEYCLOAK_SESSION`);
ohne sie funktioniert die Anmeldung nicht.

---

## 5. Protokolle und Aufbewahrung

- **nginx** schreibt Zugriffsprotokolle mit IP-Adressen. Aufbewahrungsdauer:
  siehe „Was hier fehlt".
- **Docker** begrenzt die Container-Protokolle auf 3 × 10 MB je Dienst
  (`docker-compose.prod.yml`). Sie enthalten Fehler und Betriebsmeldungen, keine
  Inhalte aus der App.
- **Cloudflare** führt eigene Protokolle über die Auslieferung der Seite.
- **Sicherungen** laufen als eigener Dienst auf dem VPS (`deploy/backup.sh`,
  `acts2-backup.timer`); dazu die Snapshots des VPS-Anbieters.

---

## 6. Besondere Kategorien — Art. 9 DSGVO

Acts2 ist eine App für einen christlichen Hauskreis. Damit sind mehrere
Angaben **Daten über religiöse Überzeugungen**:

- die Mitgliedschaft selbst — dass jemand in dieser Gruppe steht,
- **Gebetsanliegen** als freier Text,
- Themen, Zusammenfassungen und Actionsteps,
- die Anwesenheit bei den Treffen und die Zuordnung zu Gebetspartnern.

Die Verarbeitung stützt sich auf die **ausdrückliche Einwilligung** nach
Art. 9 (2) (a). Sie wird beim **Erstellen des Kontos** eingeholt — auf beiden
Wegen dorthin, also bei der Selbstregistrierung ebenso wie beim Einstieg über
einen Einladungslink. Der Wortlaut steht in
`hauskreis-backend/keycloak/themes/hauskreis/login/messages/messages_de.properties`
(`termsText`); angenommen wird sie über ein Kontrollkästchen, und Keycloak
vermerkt den Zeitpunkt am Konto. Der Widerruf für die Zukunft ist möglich:
„Hauskreis verlassen" und „Konto löschen" stehen im Profil.

---

## 7. Löschung — und warum sie hier Anonymisierung heißt

„Konto löschen" **entfernt die Zeile nicht**, sondern anonymisiert sie
(`anonymizedAt` in `model Person`): Name, E-Mail-Adresse und Geburtsdatum fallen
weg, das Anmeldekonto bei Keycloak ebenfalls. Stehen bleibt die Zuschreibung im
Archiv — wer welchen Abend gehalten hat, wer da war — unter „Ehemaliges
Mitglied".

Der Grund ist die Alternative: Ein hartes Löschen nähme dem Archiv nicht die
Person, sondern die **Zusammenhänge**; Termine hätten dann keinen Gastgeber
mehr, Themen keinen Verfasser. Das Archiv wäre danach nicht anonym, sondern
löchrig. Eine Standard-Datenschutzerklärung schreibt an dieser Stelle „Löschung
Ihrer Daten"; hier muss das ausdrücklich anders formuliert werden.

---

## 8. Auftragsverarbeiter — wer wofür

| Rolle | Wer | Wofür ein AV-Vertrag nötig ist |
| --- | --- | --- |
| Hosting Frontend | Cloudflare | ja |
| Hosting Backend, Keycloak, Datenbank | VPS-Anbieter | ja |
| Mailversand | SMTP-Anbieter | ja |
| KI-Funktion Lied-Suche | Google (Gemini) | ja, sofern man den Aufruf als Verarbeitung wertet |
| Push-Zustellung | Google / Apple / Mozilla | umstritten; Inhalte sind verschlüsselt |

Cloudflare und Google sitzen in den USA — die Erklärung muss die Übermittlung
in ein Drittland benennen (Angemessenheitsbeschluss EU-US Data Privacy
Framework bzw. Standardvertragsklauseln).

---

## 9. Was hier fehlt

Das steht nicht im Quelltext und muss von dir kommen:

1. **VPS-Anbieter und Serverstandort** — für die Erklärung und den AV-Vertrag.
2. **SMTP-Anbieter** — wer die Mails tatsächlich verschickt.
3. **Cloudflare-Proxy** — bei `acts2.de` an oder aus? Davon hängt ab, ob
   Cloudflare den Datenverkehr sieht oder nur ausliefert.
4. **Aufbewahrungsdauer der nginx-Protokolle** — Vorgabe der Distribution ist
   meist 14 Tage über `logrotate`; nachsehen und eintragen.
5. **Impressumsdaten** — vollständiger Name und ladungsfähige Anschrift; in
   `hauskreis-frontend/content/impressum.md` stehen dafür Platzhalter.
6. **Ob die App privat oder geschäftsmäßig betrieben wird** — davon hängt ab,
   wie viel das Impressum verlangt.
