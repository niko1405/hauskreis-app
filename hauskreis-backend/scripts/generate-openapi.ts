/**
 * Schreibt die OpenAPI-Beschreibung nach `openapi.json`.
 *
 * Ohne `listen()`: das Dokument entsteht aus den Metadaten der Module, nicht aus
 * laufenden Requests. Damit lässt sich die Datei auch dann erzeugen, wenn weder
 * Datenbank noch Keycloak erreichbar sind — etwa in einer CI, die nur prüfen
 * will, ob die eingecheckte Fassung noch zum Code passt.
 *
 * Aufruf: `pnpm openapi`
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/common/bootstrap/openapi';

const OUTPUT = join(__dirname, '..', 'openapi.json');

async function main(): Promise<void> {
  // `abortOnError: false`, sonst verschluckt Nest einen Fehler im Modulgraphen:
  // es meldet ihn über den Logger — den `logger: false` gerade abgeschaltet hat
  // — und beendet den Prozess mit 1, ohne eine Zeile auszugeben. Ein Zirkel
  // zwischen zwei Modulen sähe damit aus wie „läuft einfach nicht".
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  // Muss zum echten Start passen, sonst fehlt das /api vor jedem Pfad.
  app.setGlobalPrefix('api');
  await app.init();

  const document = buildOpenApiDocument(app);
  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (sum, item) =>
      sum +
      Object.keys(item as object).filter((key) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(key),
      ).length,
    0,
  );

  writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();

  console.log(`${OUTPUT}: ${operations} Operationen auf ${paths} Pfaden`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
