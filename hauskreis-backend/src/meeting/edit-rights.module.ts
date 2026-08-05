import { Module } from '@nestjs/common';
import { EditRightsService } from './edit-rights.service';

/**
 * Die Zuständigkeitsregel, für sich allein.
 *
 * Ein eigenes Modul **ohne Importe**, und das ist der ganze Zweck: `Meeting`,
 * `Topic` und `Song` brauchen die Regel alle drei. Läge sie in einem von
 * ihnen, hätten die anderen beiden eine Kante dorthin — und der Modulgraph hat
 * schon einmal genau so einen Zyklus bekommen, der sich weder in `pnpm check`
 * noch in den Tests zeigt, sondern erst beim Hochfahren.
 *
 * Möglich ist das, weil `PrismaModule` `@Global` ist: ein Dienst, der nur die
 * Datenbank braucht, importiert nichts.
 */
@Module({
  providers: [EditRightsService],
  exports: [EditRightsService],
})
export class EditRightsModule {}
