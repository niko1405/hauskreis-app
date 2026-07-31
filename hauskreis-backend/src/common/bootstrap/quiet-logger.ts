import type { LoggerService } from '@nestjs/common';

/**
 * Nests Startgeplauder — 110 Zeilen „Mapped {…} route" bei jedem Neustart.
 * Genau die Information, die der Banner in vier Zeilen zusammenfasst.
 */
const BOOTSTRAP_CONTEXTS = new Set([
  'InstanceLoader',
  'NestApplication',
  'NestFactory',
  'RouterExplorer',
  'RoutesResolver',
]);

/**
 * Reicht alles durch, außer Nests eigenen Start-Meldungen auf `log`-Ebene.
 *
 * Nicht nur Geschmack: der Banner geht mit `process.stdout.write` direkt
 * hinaus, pino in der Entwicklung über einen `pino-pretty`-Worker-Thread. Die
 * beiden Ströme lassen sich nicht ordnen — der Banner landete zuverlässig
 * *vor* den Routen-Zeilen und war damit sofort weggescrollt. Ohne das Geplauder
 * gibt es nichts mehr, womit er um die Reihenfolge streiten könnte.
 *
 * `warn` und `error` kommen immer durch. Eine Warnung beim Start — etwa
 * fehlende VAPID-Schlüssel — darf nicht verschwinden, nur weil sie aus einem
 * Nest-Kontext stammt.
 */
export class QuietBootstrapLogger implements LoggerService {
  constructor(private readonly inner: LoggerService) {}

  log(message: unknown, ...optional: unknown[]): void {
    if (isBootstrapChatter(optional)) {
      return;
    }

    this.inner.log(message, ...optional);
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.inner.error(message, ...optional);
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.inner.warn(message, ...optional);
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.inner.debug?.(message, ...optional);
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.inner.verbose?.(message, ...optional);
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    this.inner.fatal?.(message, ...optional);
  }

  setLogLevels(
    levels: Parameters<NonNullable<LoggerService['setLogLevels']>>[0],
  ): void {
    this.inner.setLogLevels?.(levels);
  }
}

/** Nest hängt den Kontext als letztes Argument an. */
function isBootstrapChatter(optional: unknown[]): boolean {
  const context = optional.at(-1);

  return typeof context === 'string' && BOOTSTRAP_CONTEXTS.has(context);
}
