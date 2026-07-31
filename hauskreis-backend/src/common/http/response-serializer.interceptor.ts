import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map } from 'rxjs/operators';
import { ZodError } from 'zod';
import type { Observable } from 'rxjs';
import type { ZodType } from 'zod';

export const RESPONSE_SCHEMA = 'hauskreis:response-schema';

/**
 * Prüft und beschneidet jede Antwort anhand ihres Zod-Schemas.
 *
 * **Warum nicht der `ZodSerializerInterceptor` aus nestjs-zod:** der ruft
 * `schema.parse()` auf dem Rückgabewert des Controllers auf, und der enthält
 * echte `Date`-Objekte aus Prisma. Ein Schema, das ein `Date` annimmt, lässt
 * sich aber nicht als JSON Schema ausdrücken — Zod 4 lehnt sowohl `z.date()`
 * als auch jedes `transform()` darauf ab. Man müsste sich zwischen einer
 * Prüfung zur Laufzeit und einer brauchbaren OpenAPI-Beschreibung entscheiden.
 *
 * Dieser Interceptor führt die Antwort erst durch `JSON.parse(JSON.stringify())`
 * — genau die Umwandlung, die Express ohnehin gleich vornehmen würde, inklusive
 * `Date` zu ISO-String — und prüft danach. Damit beschreiben die Schemas das,
 * was das Frontend wirklich sieht, und sind zugleich vollständig darstellbar.
 *
 * Die zusätzliche Runde kostet bei diesen Antwortgrößen nichts Messbares.
 */
@Injectable()
export class ResponseSerializerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseSerializerInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const schema = this.reflector.getAllAndOverride<ZodType | undefined>(
      RESPONSE_SCHEMA,
      [context.getHandler(), context.getClass()],
    );

    if (!schema) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body: unknown) => {
        // 204 und Ähnliches: nichts da, nichts zu prüfen.
        if (body === undefined || body === null) {
          return body;
        }

        const asJson: unknown = JSON.parse(JSON.stringify(body));
        const result = schema.safeParse(asJson);

        if (!result.success) {
          // Bewusst ein 500: Der Aufrufer hat nichts falsch gemacht, wir
          // liefern etwas anderes als versprochen. Still durchzulassen wäre
          // schlimmer — dann wäre die OpenAPI-Beschreibung eine Behauptung.
          this.logger.error(
            `Antwort passt nicht zum eigenen Schema: ${describe(result.error)}`,
          );
          throw new InternalServerErrorException(
            'Response did not match its declared schema',
          );
        }

        return result.data;
      }),
    );
  }
}

function describe(error: ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
