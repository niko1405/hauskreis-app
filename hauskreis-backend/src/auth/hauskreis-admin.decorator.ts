import { SetMetadata } from '@nestjs/common';

export const HAUSKREIS_ADMIN_KEY = 'hauskreisAdmin';

/**
 * Nur für Admins **dieses** Hauskreises.
 *
 * Der Nachfolger von `@Roles(ROLE_ADMIN)` an allen Routen unter
 * `/hauskreise/:hauskreisId/…`. Der Unterschied ist der ganze Punkt: die alte
 * Fassung las eine Realm-Rolle aus dem Token und galt damit in jedem Hauskreis.
 * Wer sich einen eigenen anlegt, ist dort Admin — und im alten weiter Mitglied.
 *
 * Durchgesetzt in `HauskreisMemberGuard`, der die Mitgliedschaft ohnehin schon
 * auflösen muss.
 */
export const HauskreisAdmin = () => SetMetadata(HAUSKREIS_ADMIN_KEY, true);
