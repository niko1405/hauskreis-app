import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { RESPONSE_SCHEMA } from './response-serializer.interceptor';
import { ErrorDto } from '../dto/response';
import type { ZodDto } from 'nestjs-zod';

/**
 * Beschreibt die Antwort einer Route — einmal für die OpenAPI-Datei und einmal
 * für die Prüfung zur Laufzeit.
 *
 * Beides aus derselben Quelle, damit die Beschreibung nicht behaupten kann, was
 * der Server nicht liefert. Was nicht im Schema steht, verlässt den Server auch
 * nicht: der Interceptor beschneidet die Antwort.
 *
 * Die Fehlerantworten hängen mit dran, weil sie für *jede* Route dieselben sind
 * und ein Frontend sie kennen muss, um sinnvoll zu reagieren.
 */
const outputDtos = new WeakMap<ZodDto, ZodDto>();

/**
 * Die Ausgabe-Seite eines DTOs, unter dem Namen des DTOs selbst.
 *
 * **Warum überhaupt:** `nestjs-zod` beschreibt ein DTO standardmäßig aus seiner
 * *Eingabe*-Seite. Bei `isoDateOut` ist das ein Oder aus Tag und Zeitstempel —
 * was der Server annimmt, nicht was er liefert. Für eine Antwort ist die
 * Ausgabe-Seite die richtige, dort steht schlicht `format: date`.
 *
 * **Warum umbenannt:** `dto.Output` heißt von Haus aus `…Dto_Output`, und
 * dieser Name landet als Schema-Name in der Datei und damit in jedem erzeugten
 * Client. Da unsere Antwort-DTOs ohnehin eigene Klassen sind und nie zugleich
 * als Anfrage-Rumpf dienen, kann der Name so bleiben, wie er hier heißt.
 *
 * **Warum gemerkt:** `dto.Output` ist ein Getter, der bei jedem Zugriff eine
 * neue Klasse baut. Ohne die WeakMap bekäme jede Route ihre eigene Klasse
 * gleichen Namens, und Swagger müsste sie alle wieder zusammenführen.
 */
function outputDto(dto: ZodDto): ZodDto {
  const cached = outputDtos.get(dto);
  if (cached) {
    return cached;
  }

  const output = dto.Output;
  Object.defineProperty(output, 'name', {
    value: (dto as unknown as { name: string }).name,
  });
  outputDtos.set(dto, output);
  return output;
}

export function ApiZodResponse(
  dto: ZodDto,
  options: { status?: number; description?: string } = {},
) {
  const status = options.status ?? 200;

  return applyDecorators(
    SetMetadata(RESPONSE_SCHEMA, dto.schema),
    ApiResponse({
      status,
      description: options.description ?? '',
      type: outputDto(dto),
    }),
    ApiResponse({
      status: 400,
      description: 'Eingabe passt nicht zum Schema — `errors` nennt die Felder',
      type: ErrorDto,
    }),
    ApiResponse({
      status: 401,
      description:
        'Token fehlt, ist abgelaufen oder gehört zu einem fremden Client',
      type: ErrorDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Angemeldet, aber ohne das nötige Recht',
      type: ErrorDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Nicht vorhanden — oder gehört zu einem anderen Hauskreis',
      type: ErrorDto,
    }),
  );
}

/**
 * Zusätzlich zu `ApiZodResponse` für alles, was schreibt: die beiden Antworten,
 * die dieser API eigen sind und ein Frontend sonst erst im Betrieb entdeckt.
 */
export function ApiConditionalWrite() {
  return applyDecorators(
    ApiResponse({
      status: 412,
      description:
        'Das `If-Match` ist veraltet — jemand anders hat inzwischen gespeichert. Neu laden und erneut versuchen.',
      type: ErrorDto,
    }),
    ApiResponse({
      status: 428,
      description:
        'Kein `If-Match` mitgeschickt. Den ETag aus dem vorangehenden GET verwenden.',
      type: ErrorDto,
    }),
  );
}

/**
 * Für die Löschrouten: kein Rumpf, aber der Statuscode gehört beschrieben.
 *
 * Ohne das stünde in der Datei nur eine leere `200`-Antwort, und ein Client,
 * der auf JSON wartet, liefe ins Leere.
 */
export function ApiZodNoContent(description = 'Gelöscht, kein Inhalt') {
  return applyDecorators(
    ApiResponse({ status: 204, description }),
    ApiResponse({
      status: 401,
      description: 'Nicht angemeldet',
      type: ErrorDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Angemeldet, aber ohne das nötige Recht',
      type: ErrorDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Nicht vorhanden',
      type: ErrorDto,
    }),
  );
}
