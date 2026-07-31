import type { INestApplication, LoggerService } from '@nestjs/common';

/** Wie lange offene Verbindungen Zeit bekommen, bevor hart beendet wird. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

const SIGNALS = ['SIGINT', 'SIGTERM'] as const;

/**
 * Beendet den Server auf Strg+C (SIGINT) und `docker stop` (SIGTERM) geordnet.
 *
 * Bewusst statt `app.enableShutdownHooks()`: das registriert dieselben
 * Signal-Handler, nur ohne Ausgabe und ohne Zeitlimit. Man sah also nicht, ob
 * die Datenbankverbindungen wirklich geschlossen wurden — und wenn `close()`
 * an einer offenen Keep-Alive-Verbindung hing, blieb der Prozess still stehen.
 * `app.close()` führt die Lifecycle-Hooks (`onModuleDestroy` in
 * `PrismaService`) ohnehin aus, egal wodurch es ausgelöst wird.
 */
export function installShutdownHandlers(
  app: INestApplication,
  logger: LoggerService,
): void {
  let shuttingDown = false;

  for (const signal of SIGNALS) {
    process.on(signal, () => {
      // Zweites Strg+C heißt "jetzt sofort". Wer ungeduldig wird, hat meist
      // einen Grund, und ein Server, der sich nicht beenden lässt, ist
      // schlimmer als einer, der eine Verbindung abreißen lässt.
      if (shuttingDown) {
        logger.warn?.(`${signal} erneut empfangen — beende sofort`, 'Shutdown');
        process.exit(1);
      }

      shuttingDown = true;
      void closeGracefully(app, logger, signal);
    });
  }
}

async function closeGracefully(
  app: INestApplication,
  logger: LoggerService,
  signal: string,
): Promise<void> {
  logger.log?.(`${signal} empfangen — fahre herunter`, 'Shutdown');

  // Der Timer darf den Prozess nicht am Leben halten, falls close() schneller
  // ist: sonst hinge das Beenden noch die volle Frist nach.
  const timer = setTimeout(() => {
    logger.error?.(
      `Herunterfahren dauerte länger als ${SHUTDOWN_TIMEOUT_MS} ms — erzwinge Ende`,
      'Shutdown',
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  try {
    await app.close();
    clearTimeout(timer);
    logger.log?.('Verbindungen geschlossen, auf Wiedersehen', 'Shutdown');
    // 0, nicht 128+Signal: das Beenden war beabsichtigt und erfolgreich.
    // `docker stop` wertet alles andere als Fehlschlag.
    process.exit(0);
  } catch (error) {
    clearTimeout(timer);
    logger.error?.(
      `Fehler beim Herunterfahren: ${error instanceof Error ? error.message : String(error)}`,
      'Shutdown',
    );
    process.exit(1);
  }
}
