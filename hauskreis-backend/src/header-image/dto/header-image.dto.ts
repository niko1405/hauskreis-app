import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { HeaderScreen } from '../../../generated/prisma/enums';
import { isoDateTimeOut } from '../../common/dto/response';

/**
 * Der Bildschirm, um dessen Kopfbild es geht.
 *
 * In der URL kleingeschrieben (`…/header-images/home`) — das ist die Form, in
 * der eine Adresse gelesen wird, und `SCREAMING_CASE` in einem Pfad sieht nach
 * einer Konstante aus, die dorthin verrutscht ist. Übersetzt wird an genau
 * dieser Stelle, damit weder Controller noch Frontend die Prisma-Schreibweise
 * kennen müssen.
 */
export const screenSlugs = ['home', 'prayer', 'archive', 'profile'] as const;

export type ScreenSlug = (typeof screenSlugs)[number];

const SCREEN: Record<ScreenSlug, HeaderScreen> = {
  home: HeaderScreen.HOME,
  prayer: HeaderScreen.PRAYER,
  archive: HeaderScreen.ARCHIVE,
  profile: HeaderScreen.PROFILE,
};

export function screenOf(slug: ScreenSlug): HeaderScreen {
  return SCREEN[slug];
}

export function slugOf(screen: HeaderScreen): ScreenSlug {
  return screen.toLowerCase() as ScreenSlug;
}

const headerImageParamsSchema = z.object({
  hauskreisId: z.uuid(),
  screen: z.enum(screenSlugs),
});

/**
 * Was zurückkommt, wenn ein Bild gesetzt wurde: der Zeitstempel.
 *
 * Dieselbe Mechanik wie beim Profilbild — er hängt als Query-Parameter an der
 * Bild-URL, und ohne ihn zeigte der Browser noch das alte Bild aus seinem
 * Zwischenspeicher.
 */
export const headerImageResponseSchema = z.object({
  screen: z.enum(screenSlugs),
  updatedAt: isoDateTimeOut,
});

export const headerImageListResponseSchema = z.array(headerImageResponseSchema);

export class HeaderImageParamsDto extends createZodDto(
  headerImageParamsSchema,
) {}
export class HeaderImageResponseDto extends createZodDto(
  headerImageResponseSchema,
) {}
export class HeaderImageListResponseDto extends createZodDto(
  headerImageListResponseSchema,
) {}
