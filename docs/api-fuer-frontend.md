# Die API aus Sicht des Frontends

Begleitdokument zu [`hauskreis-backend/openapi.json`](../hauskreis-backend/openapi.json).
Dort stehen alle 70 Endpunkte mit ihren genauen Formen; hier stehen die Regeln,
die _für jeden_ Aufruf gelten und sich in OpenAPI schlecht ausdrücken lassen.

Wer ein Modell mit dieser API arbeiten lässt, gibt ihm am besten beide Dateien.
Das `README.md` des Backends ist dafür **nicht** gedacht: es erklärt auf 1600
Zeilen, _warum_ die Dinge so sind, und das ist beim Bauen von Ansichten eher
Ablenkung.

```
openapi.json          Was es gibt und welche Form es hat
api-fuer-frontend.md  Die Regeln, die überall gelten   <- diese Datei
```

Die Spezifikation wird **erzeugt**, nicht gepflegt: `pnpm openapi`. Sie stammt
aus denselben Zod-Schemas, gegen die der Server zur Laufzeit prüft — sie kann
also nicht behaupten, was der Server nicht liefert.

---

## 1. Anmeldung

Keycloak, OpenID Connect. Im Browser der **öffentliche Client `hauskreis-app`**
mit PKCE (`S256`), nicht `hauskreis-backend` — der hat ein Secret und einen
Service-Account mit Rechten auf der Realm-Admin-API und gehört nirgends in
Frontend-Code.

|              | Entwicklung                              |
| ------------ | ---------------------------------------- |
| Issuer       | `http://localhost:8080/realms/hauskreis` |
| Client-ID    | `hauskreis-app`                          |
| Redirect-URI | `http://localhost:3001/*`                |
| Flow         | Authorization Code + PKCE                |

Das Access-Token gehört als `Authorization: Bearer …` an **jeden** Aufruf außer
`GET /api/health`. Es hält standardmäßig **5 Minuten** — der Client braucht
also einen Refresh, sonst kippt die App mitten in der Benutzung auf `401`.

Der Server prüft `iss`, `aud` (`hauskreis-backend`), `azp` und die Signatur.
Ein Token, das eine andere Anwendung für sich geholt hat, wird abgelehnt.

**Wer bin ich:** `GET /api/me` liefert die eigene Person **plus die Rollen aus
dem Token**. Daran entscheidet sich, ob Admin-Bedienelemente sichtbar sind —
das JWT selbst muss das Frontend dafür nicht auseinandernehmen.

Beim ersten Login wird die Person über die E-Mail-Adresse zugeordnet. Gibt es
keine passende, antwortet `/api/me` mit `404` und der Hinweis lautet: von einem
Admin einladen lassen.

---

## 2. Schreiben: `If-Match` ist Pflicht

Das ist die Regel, an der ein Frontend als Erstes scheitert.

Jedes `PATCH` und `PUT` auf eine einzelne Ressource verlangt den ETag aus dem
vorangehenden `GET`:

```http
GET /api/hauskreise/{id}/meetings/{id}
→ 200  ETag: W/"3"

PATCH /api/hauskreise/{id}/meetings/{id}
If-Match: W/"3"
→ 200  ETag: W/"4"
```

| Antwort | Bedeutung                    | Was zu tun ist                                          |
| ------- | ---------------------------- | ------------------------------------------------------- |
| `428`   | kein `If-Match` mitgeschickt | Vorher lesen, ETag mitführen                            |
| `412`   | ETag veraltet                | Jemand anders war schneller. Neu laden, Konflikt zeigen |

**Das ist Absicht, kein Schutz vor Tippfehlern.** Neun Leute planen gleichzeitig
am selben Abend; ohne diese Prüfung überschreibt der letzte Speichervorgang
stillschweigend den vorherigen. Ein `412` ist der einzige Moment, in dem die App
das überhaupt bemerken kann — er gehört angezeigt, nicht verschluckt.

Praktisch heißt das: der Fetch-Wrapper führt den ETag beim Lesen mit und hängt
ihn beim Schreiben an. Ein Formular, das nur die geänderten Felder kennt, aber
nicht den ETag, ist der übliche Baufehler.

**Cross-Origin muss der ETag lesbar sein.** Der Server setzt dafür
`Access-Control-Expose-Headers: ETag`; ohne das versteckt der Browser den Header
und jedes `PATCH` käme mit `428` zurück. Ist bereits eingerichtet, aber es
erklärt, warum ein Proxy davorzuschalten schiefgehen kann.

`POST` und `DELETE` brauchen kein `If-Match`.

---

## 3. Lesen: `If-None-Match`

Umgekehrt geht es auch: ein `GET` mit `If-None-Match: W/"3"` antwortet `304`,
solange sich nichts geändert hat. Nützlich für Ansichten, die häufig neu laden.

---

## 4. Fehler

Immer dieselbe Form, für jeden Statuscode:

```jsonc
{
  "statusCode": 400,
  "message": "Validation failed",
  "path": "/api/hauskreise/…/locations/…",
  "errors": [
    // nur bei 400 aus einer Prüfung
    {
      "field": "longitude",
      "message": "latitude und longitude müssen zusammen gesetzt werden",
    },
  ],
}
```

| Code          | Wann                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| `400`         | Eingabe passt nicht zum Schema; `errors` nennt Feld für Feld, was fehlt |
| `401`         | Token fehlt, ist abgelaufen oder gehört zu einem fremden Client         |
| `403`         | Angemeldet, aber ohne das nötige Recht (meist: Admin-Route)             |
| `404`         | Nicht vorhanden — **oder** gehört zu einem anderen Hauskreis            |
| `409`         | Konflikt, etwa eine E-Mail, die es in Keycloak schon gibt               |
| `412` / `428` | siehe oben                                                              |
| `429`         | Mehr als 300 Aufrufe pro Minute                                         |

`404` statt `403` bei fremden Ressourcen ist Absicht: die Existenz einer fremden
ID soll sich nicht am Statuscode ablesen lassen.

---

## 5. Listen und Paginierung

Alle paginierten Listen tragen dieselbe Hülle:

```jsonc
{ "items": [ … ], "total": 87, "take": 20, "skip": 0, "hasMore": true }
```

`take` maximal 100, Vorgabe 20. `total` zählt alle Treffer des Filters,
unabhängig von `take`/`skip`. `hasMore` ist ableitbar, kommt aber mit — daran
verzweigt man, und selbst ausgerechnet ist es die Stelle für Off-by-one-Fehler.

**Nicht paginiert** sind `…/people`, `…/locations`, `…/assignments`,
`…/home` und `…/hauskreise`. Bei den ersten beiden, weil es neun bzw. acht
Einträge sind; bei `assignments`, weil die Zeitspanne bereits auf ein Jahr
begrenzt ist.

---

## 6. Datumsfelder

Zwei Sorten, sauber getrennt — man erkennt sie am Namen:

| Sorte              | Form                       | Felder                                                                                                                                                            |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tag**, ohne Zeit | `2026-08-11`               | `meeting.date`, `absence.startDate`/`endDate`, `person.birthdate`, Gebetsbuddy-Zeiträume, `/home`, `/assignments`, `song.lastPlayedAt`, die Fakten der Vorschläge |
| **Zeitpunkt**, mit | `2026-07-31T21:46:43.444Z` | ausschließlich `createdAt`, `updatedAt`, `sentAt`                                                                                                                 |

In OpenAPI stehen sie als `format: date` und `format: date-time` — daran kann
ein erzeugter Client sie unterscheiden.

**Ein Tag ist kein Zeitpunkt, und `new Date('2026-08-11')` macht einen daraus:**
JavaScript liest die Kurzform als UTC-Mitternacht, und lokal formatiert wird
daraus westlich von UTC der **10. August**. Für die Anzeige den String
zerlegen, oder mit `new Date(2026, 7, 11)` einen lokalen Tag bauen.

In **Anfragen** gilt dasselbe Format: `YYYY-MM-DD`, ein voller Zeitstempel wird
abgelehnt (`400`). Ein Tag, den man schickt, kommt genau so zurück.

> Bis Juli 2026 gaben `meeting.date`, `absence.startDate`/`endDate`,
> `topic.meetings[].date` und `person.birthdate` volle Zeitstempel heraus, weil
> Prisma `@db.Date`-Spalten als `DateTime` liefert. Das ist behoben; wer gegen
> die alte Form gebaut hat, kann das Abschneiden entfernen.

---

## 7. Wo man anfängt

```
GET /api/me                                → wer bin ich, welche Rollen
GET /api/hauskreise                        → die hauskreisId für alles Weitere
GET /api/hauskreise/{id}/home              → der ganze Home-Screen, ein Aufruf
```

`…/home` ist bewusst so gebaut, dass der Startbildschirm **keine** vier
Einzelaufrufe braucht: nächster Termin samt Ort (mit Koordinaten für „In Maps
öffnen"), eigene Rollen der nächsten acht Wochen, offener Actionstep, aktuelle
Gebetsbuddys.

Für die Mehrwochen-Tabelle `…/assignments?from=&to=` **ohne** `personId`; mit
`personId` sind es die Badges einer Person. Eine Route für beides, damit die
zwei Ansichten nicht unterschiedlicher Meinung sein können, wer dran ist.

---

## 8. Zwei fachliche Eigenheiten

**Vorschläge sind Vorschläge.** `…/host-suggestions`, `…/topic-suggestions` und
`…/song-leader-suggestions` liefern eine sortierte Liste **mit den Fakten
dahinter** — wann jemand zuletzt dran war, wie oft schon, was noch ansteht. Die
App teilt niemanden zwangsweise ein; die Felder bleiben leer, bis jemand von
Hand einträgt. Ein Frontend, das nur die Reihenfolge übernimmt und die Fakten
wegwirft, gibt genau das auf, wofür der Endpunkt gebaut ist (CLAUDE.md §4).

**Leere Felder sind oft ein gültiger Zustand, kein fehlender Wert.** Ein Termin
ohne Host ist ein Treffen im Schlosspark. Ein Thema ohne Titel ist eines, für
das noch niemand einen festgelegt hat. Ein Lobpreisabend hat gar kein Thema. Das
gehört nicht als Fehler oder als „—" angezeigt, sondern als das, was es ist.
