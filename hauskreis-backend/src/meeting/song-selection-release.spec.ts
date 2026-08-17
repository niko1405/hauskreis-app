/**
 * Was mit der Lied-Auswahl passiert, wenn für die Musik niemand mehr zuständig
 * ist.
 *
 * Vor dem Abend ist das Abhaken eine **Entscheidung** („das singen wir"), und
 * treffen darf sie nur, wer die Musik macht — auch kein Admin, und ein Abend
 * ohne Zuteilung ist keiner, an dem alle dürfen (`edit-rights.spec.ts`). Fiel
 * die Zuteilung danach weg, blieb die Auswahl trotzdem stehen: eine Absprache,
 * an der niemand mehr beteiligt war, und an die niemand mehr herankam.
 *
 * Geprüft wird hier die Funktion selbst und nicht ihre drei Aufrufer. Sie ist
 * das, was alle drei gemeinsam haben — Zuteilung umtragen, für einen Abend
 * absagen, den Hauskreis verlassen —, und die Frage „ist dieser Abend schon
 * vorbei" beantwortet bewusst jeder Aufrufer für sich.
 */
import { clearSongSelectionIfUnled } from './meeting-version';
import type { Prisma } from '../../generated/prisma/client';

function setup(ledMeetingIds: string[]) {
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });

  const db = {
    meetingSongLeader: {
      findMany: jest
        .fn()
        .mockResolvedValue(ledMeetingIds.map((meetingId) => ({ meetingId }))),
    },
    meetingSong: { updateMany },
  };

  return { db: db as unknown as Prisma.TransactionClient, updateMany };
}

describe('clearSongSelectionIfUnled', () => {
  it('nimmt die Auswahl zurück, wenn niemand mehr zuständig ist', async () => {
    const { db, updateMany } = setup([]);

    await clearSongSelectionIfUnled(db, ['m1']);

    expect(updateMany).toHaveBeenCalledWith({
      where: { meetingId: { in: ['m1'] }, isSelected: true },
      data: { isSelected: false },
    });
  });

  /**
   * Der häufigste Fall beim Umtragen: Von zwei Zuständigen fällt einer weg. Die
   * Absprache steht weiter, es kümmert sich nur noch eine Person darum.
   */
  it('lässt sie stehen, solange noch jemand zuständig ist', async () => {
    const { db, updateMany } = setup(['m1']);

    await clearSongSelectionIfUnled(db, ['m1']);

    expect(updateMany).not.toHaveBeenCalled();
  });

  /**
   * Wer den Hauskreis verlässt, gibt seine Rollen an **allen** kommenden Abenden
   * ab. Räumen muss man dann nur die, an denen er der Letzte war.
   */
  it('trifft aus mehreren Abenden nur die verwaisten', async () => {
    const { db, updateMany } = setup(['m2']);

    await clearSongSelectionIfUnled(db, ['m1', 'm2', 'm3']);

    expect(updateMany).toHaveBeenCalledWith({
      where: { meetingId: { in: ['m1', 'm3'] }, isSelected: true },
      data: { isSelected: false },
    });
  });

  it('fragt gar nicht erst nach, wenn es nichts zu prüfen gibt', async () => {
    const { db, updateMany } = setup([]);

    await clearSongSelectionIfUnled(db, []);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
