import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Die OpenAPI-Beschreibung der ganzen API.
 *
 * Erzeugt, nicht gepflegt: Anfragen, Parameter und Antworten stammen aus
 * denselben Zod-Schemas, gegen die zur Laufzeit validiert wird. Eine Beschreibung,
 * die von Hand nachgezogen werden müsste, wäre nach dem zweiten Feature falsch —
 * und eine falsche Beschreibung ist schlimmer als gar keine, weil man ihr glaubt.
 *
 * `cleanupOpenApiDoc` ist Pflicht, nicht Kür: `@nestjs/swagger` kennt Zod nicht
 * und lässt sonst Platzhalter stehen, wo die Schemas hingehören.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Hauskreis API')
    .setDescription(
      [
        'Organisation eines Hauskreises: Termine, Hosts, Themen, Songs,',
        'Gebetsbuddys, Actionsteps.',
        '',
        'Zwei Dinge, die man beim Schreiben wissen muss und die sich hier',
        'schlecht ausdrücken lassen:',
        '',
        '1. **Jedes `PATCH`/`PUT` verlangt `If-Match`** mit dem ETag aus dem',
        '   vorangehenden `GET`. Ohne kommt `428`, mit veraltetem `412`.',
        '2. **Auth ist Keycloak (OIDC)**, im Browser der öffentliche Client',
        '   `hauskreis-app` mit PKCE. Das Token gehört als Bearer in jeden',
        '   Request außer `/api/health`.',
        '',
        'Ausführlich in `docs/api-fuer-frontend.md`.',
      ].join('\n'),
    )
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access-Token aus Keycloak',
      },
      'keycloak',
    )
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/**
 * Hängt die durchklickbare Fassung unter `/api/docs` ein.
 *
 * Nur außerhalb der Produktion: die Seite verrät die vollständige Angriffsfläche
 * inklusive aller Admin-Routen, und für neun Leute gibt es keinen Grund, sie
 * öffentlich anzubieten.
 */
export function setupSwaggerUi(app: INestApplication, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'api/docs/json',
    swaggerOptions: { persistAuthorization: true },
  });
}
