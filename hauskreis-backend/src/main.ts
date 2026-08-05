import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { installShutdownHandlers } from './common/bootstrap/shutdown';
import { collectRoutes, groupRoutes } from './common/bootstrap/routes';
import { renderBanner } from './common/bootstrap/banner';
import { appVersion } from './common/bootstrap/version';
import { QuietBootstrapLogger } from './common/bootstrap/quiet-logger';
import { setupSwaggerUi } from './common/bootstrap/openapi';

const GLOBAL_PREFIX = 'api';
const BIND_HOST = '0.0.0.0';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  // Nests Routen-Geplauder unterdrücken — der Banner fasst es zusammen, und
  // ohne es streitet nichts mehr mit ihm um die Reihenfolge der Ausgabe.
  app.useLogger(new QuietBootstrapLogger(logger));

  const config = app.get(AppConfigService);
  const corsOrigins = config.get('CORS_ORIGINS');

  // Behind a reverse proxy every request would otherwise look like it came from
  // the proxy, and the rate limiter would count the whole group as one caller.
  app.set('trust proxy', 1);

  // `crossOriginResourcePolicy` aus: Profilbilder liefert diese API aus, und
  // die App läuft unter einer anderen Herkunft. Helmets Vorgabe `same-origin`
  // lässt den Browser das Bild verwerfen, **nachdem** es geladen wurde — im
  // Netz-Tab steht 200, im `<img>` steht nichts. Der Zugriff selbst hängt
  // weiter am Bearer-Token; diese Kopfzeile schützt nichts, was CORS nicht
  // ohnehin regelt.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  // Pinned rather than left to the Express default, so the limit is a decision
  // on the record. Nothing this API accepts comes close to it. Nest's own
  // helper rather than `express.json()`: express is a transitive dependency of
  // the platform adapter, and importing it directly only works as long as the
  // package manager happens to hoist it — in the production image it did not.
  app.useBodyParser('json', { limit: '128kb' });
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    // Without this the browser hides the ETag from a cross-origin frontend —
    // only the CORS-safelisted headers are readable by default. No ETag means
    // no `If-Match`, and every PATCH from the app would come back 428.
    exposedHeaders: ['ETag'],
  });
  app.setGlobalPrefix(GLOBAL_PREFIX);
  // Nach setGlobalPrefix, sonst fehlt das /api vor jedem Pfad im Dokument.
  const docsEnabled = !config.isProduction;
  setupSwaggerUi(app, docsEnabled);
  installShutdownHandlers(app, logger);

  // Die Adresse ist nicht optional, auch wenn der Default meistens reicht.
  // Ohne sie bindet Node dual-stack auf `::`. Im Container ist das in Ordnung,
  // unter WSL nicht: die localhost-Weiterleitung nach Windows spiegelt dann nur
  // `[::1]`, und jeder Client, der `localhost` auf IPv4 auflöst — Bruno tut das —
  // läuft in ECONNREFUSED auf 127.0.0.1. Explizit auf 0.0.0.0 zu binden ist
  // ohnehin das, was eine containerisierte App tun soll.
  const port = config.get('PORT');
  await app.listen(port, BIND_HOST);

  // Erst nach `listen`, damit der Banner nicht behauptet, es liefe etwas, das
  // gleich noch an einem belegten Port scheitert.
  const routes = collectRoutes(app, GLOBAL_PREFIX);
  process.stdout.write(
    renderBanner(
      {
        version: appVersion(),
        environment: config.get('NODE_ENV'),
        host: BIND_HOST,
        port,
        globalPrefix: `/${GLOBAL_PREFIX}`,
        keycloakUrl: config.get('KEYCLOAK_URL'),
        keycloakRealm: config.get('KEYCLOAK_REALM'),
        corsOrigins,
        pushEnabled: Boolean(
          config.get('VAPID_PUBLIC_KEY') && config.get('VAPID_PRIVATE_KEY'),
        ),
        docsEnabled,
        routes,
        groups: groupRoutes(routes),
        // `process.uptime()` statt einer eigenen Startmarke: es zählt ab dem
        // Prozessstart und schließt damit auch das Laden der Module ein, das
        // den Großteil ausmacht.
        startupSeconds: process.uptime(),
      },
      process.stdout.isTTY === true,
    ),
  );
}

void bootstrap();
