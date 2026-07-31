import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

export interface RouteInfo {
  method: string;
  path: string;
}

export interface RouteGroup {
  name: string;
  count: number;
}

/**
 * Alle registrierten Routen, aus Nests eigenen Metadaten gelesen.
 *
 * Nicht über den Express-Router: `express` ist nur eine transitive Abhängigkeit
 * des Plattform-Adapters und war im Produktions-Image schon einmal nicht
 * auflösbar (siehe der Body-Parser in `main.ts`). `ModulesContainer` ist
 * öffentliches Nest-API und funktioniert unabhängig davon, welcher Adapter
 * darunter liegt.
 */
export function collectRoutes(
  app: INestApplication,
  globalPrefix = '',
): RouteInfo[] {
  const modules = app.get(ModulesContainer);
  const scanner = new MetadataScanner();
  const routes: RouteInfo[] = [];

  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      if (!wrapper.metatype || !wrapper.instance) {
        continue;
      }

      const controllerPath: string =
        (Reflect.getMetadata(PATH_METADATA, wrapper.metatype) as string) ?? '';
      const prototype = Object.getPrototypeOf(wrapper.instance) as object;

      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, object>)[methodName];
        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as
          string | undefined;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;

        // Keine Route, sondern eine gewöhnliche Methode des Controllers.
        if (methodPath === undefined || verb === undefined) {
          continue;
        }

        routes.push({
          method: RequestMethod[verb] ?? 'ALL',
          path: joinPath(globalPrefix, controllerPath, methodPath),
        });
      }
    }
  }

  return routes.toSorted((a, b) => a.path.localeCompare(b.path));
}

/** Der Mandanten-Präfix, unter dem fast alle Routen hängen. */
const TENANT_SEGMENT = 'hauskreise';

/**
 * Fasst die Routen zu Gruppen zusammen, wie man sie im Kopf hat.
 *
 * Fast alles hängt unter `/api/hauskreise/:hauskreisId/…`; nach dem ersten
 * Segment zu gruppieren ergäbe eine einzige Gruppe mit sechzig Einträgen.
 * Deshalb zählt dort das Segment dahinter — `meetings`, `songs`, `absences`.
 *
 * Parameter-Segmente scheiden als Name aus: `/push/settings/:type` gehört zu
 * `push`, nicht zu einer Gruppe namens `:type`.
 */
export function groupRoutes(routes: RouteInfo[]): RouteGroup[] {
  const counts = new Map<string, number>();

  for (const route of routes) {
    const named = route.path
      .split('/')
      .filter(Boolean)
      .filter((segment) => !segment.startsWith(':'));
    // Das erste Segment ist der globale Präfix und sagt nichts aus.
    const [, ...rest] = named;
    const name =
      rest[0] === TENANT_SEGMENT && rest[1] ? rest[1] : (rest[0] ?? '/');

    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function joinPath(...parts: string[]): string {
  const path = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0)
    .join('/');

  return `/${path}`;
}
