# Achtung, Abweichung: entwickelt und getestet wird auf Node 24 (siehe
# `node --version`), das Image liefert Node 22. Beides läuft, aber es ist nicht
# dasselbe — wer die Angleichung will, setzt hier `node:24-alpine` und baut neu.
# Eine `engines`-Angabe in package.json gibt es bewusst noch nicht, sonst müsste
# sie hier mitgepflegt werden.
# Alpine hält das Image klein genug, dass ein Rebuild kein Ereignis ist.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies. Split from the build so a source change does not re-resolve
# the whole tree.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build. `prisma generate` has to come first: the app imports from
# `generated/prisma`, so without it `nest build` fails on missing types.
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm exec nest build

# ---------------------------------------------------------------------------
# Runtime. Production dependencies only.
#
# **Diese Stufe ist auch das Migrations-Image.** Sie war es einmal nicht: der
# `migrate`-Service lief aus der `build`-Stufe, weil `prisma` und `dotenv` als
# devDependencies geführt wurden und `--prod` sie hier wegließ. Solange auf dem
# Server gebaut wurde, kostete das nichts. Sobald das Image aus der CI kommt,
# hieße es zwei Images bauen, pushen und ziehen — für einen Aufruf, der einmal
# pro Deploy läuft. Deshalb stehen beide jetzt unter `dependencies`, und der
# `migrate`-Service ist nur noch ein anderes `command:` auf demselben Image.
#
# Dafür braucht die Stufe zweierlei mehr: die Migrationen selbst und
# `prisma.config.ts`, aus der der CLI Schema-Pfad und `DATABASE_URL` liest.
#
# Der Löwenanteil der Größe sind Prismas Engines. Für eine selbst gehostete
# Gruppe von neun Leuten klein genug — der Build muss sich dafür nicht verbiegen.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated

# Nur für `prisma migrate deploy`. Die Anwendung selbst rührt beides nie an.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

# Der Einhängepunkt des Uploads-Volumes, angelegt **bevor** der Benutzer wechselt.
#
# Ohne diese Zeile gibt es den Pfad im Image nicht, und Docker legt ihn beim
# Einhängen selbst an — als `root:root 0755`. Der Prozess läuft aber als `node`,
# und `PhotoService.store()` beginnt mit `mkdir(dir, { recursive: true })`:
# jeder Bild-Upload endete mit `EACCES`, obwohl an der Anwendung nichts falsch
# war. Existiert das Verzeichnis dagegen im Image, übernimmt das leere Volume
# beim ersten Start dessen Eigentümer und Rechte.
#
# Der Pfad ist derselbe wie `UPLOAD_DIR` in docker-compose.prod.yml. Läuft der
# Container ohne diese Variable, schreibt die Anwendung nach `./uploads` unter
# dem WORKDIR und dieses Verzeichnis bleibt unbenutzt — dann sind die Bilder
# allerdings beim nächsten `up` weg.
RUN mkdir -p /data/uploads && chown node:node /data/uploads

# Das Image bringt einen `node`-Benutzer mit; als root zu laufen wäre unnötig.
#
# Kein `chown -R /app`: Ebenen sind unveränderlich, ein rekursives chown schreibt
# jede Datei neu und legt damit eine vollständige Kopie des node_modules-Baums
# als zusätzliche Ebene an — hier waren das 423 MB obendrauf, während das
# Original darunter liegen bleibt. Nötig ist es ohnehin nicht: die Dateien
# gehören root und sind für alle lesbar, und alles, was die Anwendung schreibt,
# geht entweder nach stdout (Logs) oder ins Volume oben (Bilder) — nie in den
# Anwendungsbaum selbst.
USER node

EXPOSE 3000

# `installShutdownHandlers()` in main.ts fängt SIGTERM ab, `docker stop` schließt
# den Datenbank-Pool also, statt ihn zu kappen. Das ist hier nicht bloß Kür:
# durch die Exec-Form des CMD läuft node als PID 1, und für PID 1 installiert
# Linux keine Standard-Signalbehandlung. Ohne eigenen Handler würde SIGTERM
# schlicht ignoriert und Docker müsste nach 10 Sekunden SIGKILL nachschieben.
# Gemessen: 1,1 s bis zum Ende, Exit-Code 0.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/src/main"]
