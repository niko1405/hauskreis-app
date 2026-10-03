/**
 * Die Setlist und ihre Vorschläge: Reihenfolge, Stimmen, wer was darf.
 *
 * Die Setlist ordnet das Musik-Team, die Vorschläge ordnen die Stimmen. Wer
 * etwas aus der Setlist nimmt, macht es wieder zum Vorschlag; löschen darf
 * einen Vorschlag jede:r, ein Lied in der Setlist nur, wer es dorthin stellen
 * darf.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MeetingSongService } from './meeting-song.service';
// Type-only imports keep Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { SongService } from './song.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { RoleAttendanceService } from '../attendance/role-attendance.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import type { EditRightsService } from '../meeting/edit-rights.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { withClock } from '../meeting/group-clock.testing';

const at = (iso: string) => new Date(iso);

function entry(
  id: string,
  options: {
    selected?: boolean;
    position?: number | null;
    votes?: string[];
    createdAt?: string;
  } = {},
) {
  return {
    id,
    isSelected: options.selected ?? false,
    position: options.position ?? null,
    createdAt: at(options.createdAt ?? '2026-08-01T10:00:00Z'),
    song: { id: `song-${id}`, title: id, artist: null, lyricsUrl: null },
    suggestedBy: null,
    votes: (options.votes ?? []).map((personId) => ({ personId })),
  };
}

function setup(
  options: {
    rows?: ReturnType<typeof entry>[];
    /** Ob die Person die Setlist ändern darf. */
    mayPick?: boolean;
    status?: MeetingStatus;
  } = {},
) {
  const rows = options.rows ?? [];

  const meetingSong = {
    findMany: jest.fn((args: { where: { isSelected?: boolean } }) =>
      Promise.resolve(
        args.where.isSelected === true
          ? rows.filter((row) => row.isSelected)
          : rows,
      ),
    ),
    findFirst: jest.fn((args: { where: { id?: string } }) => {
      // Ohne Id fragt der Dienst nach dem letzten Platz der Setlist.
      if (args.where.id === undefined) {
        const last = rows
          .filter((row) => row.isSelected)
          .toSorted((a, b) => (b.position ?? 0) - (a.position ?? 0))[0];
        return Promise.resolve(last ?? null);
      }
      return Promise.resolve(
        rows.find((row) => row.id === args.where.id) ?? null,
      );
    }),
    findUniqueOrThrow: jest.fn((args: { where: { id: string } }) =>
      Promise.resolve(rows.find((row) => row.id === args.where.id)),
    ),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(1),
  };

  const meetingSongVote = {
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };

  const prisma = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue({
        date: at('2026-08-04T00:00:00Z'),
        endDate: null,
        status: options.status ?? MeetingStatus.PLANNED,
      }),
    },
    meetingSong,
    meetingSongVote,
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({ meetingSong }),
  };

  const editRights = {
    assertMayPickSongs: jest.fn(() =>
      options.mayPick === false
        ? Promise.reject(new ForbiddenException('nur das Musik-Team'))
        : Promise.resolve(),
    ),
  };

  const service = withClock(
    new MeetingSongService(
      prisma as unknown as PrismaService,
      {} as unknown as SongService,
      {} as unknown as RoleAssignmentNotifier,
      {} as unknown as RoleAttendanceService,
      {} as unknown as AvailabilityService,
      editRights as unknown as EditRightsService,
      undefined as never,
    ),
  );

  return { service, meetingSong, meetingSongVote, editRights };
}

describe('MeetingSongService', () => {
  describe('findAll', () => {
    it('stellt die Setlist nach Platz voran, dann die Vorschläge nach Stimmen', async () => {
      const { service } = setup({
        rows: [
          entry('leise', { votes: ['anna'] }),
          entry('zweites', { selected: true, position: 2 }),
          entry('beliebt', { votes: ['anna', 'chris'] }),
          entry('erstes', { selected: true, position: 1 }),
        ],
      });

      const list = await service.findAll('hk-1', 'm1', 'anna');

      expect(list.map((row) => row.id)).toEqual([
        'erstes',
        'zweites',
        'beliebt',
        'leise',
      ]);
    });

    it('nennt die Zahl der Stimmen und ob die eigene dabei ist — nicht, von wem', async () => {
      const { service } = setup({
        rows: [entry('lied', { votes: ['anna', 'chris'] })],
      });

      const [row] = await service.findAll('hk-1', 'm1', 'chris');

      expect(row).toMatchObject({ votes: 2, votedByMe: true });
      expect(row).not.toHaveProperty('votes.0');
    });

    it('lässt bei Gleichstand gelten, wer zuerst vorgeschlagen hat', async () => {
      const { service } = setup({
        rows: [
          entry('später', { createdAt: '2026-08-02T10:00:00Z' }),
          entry('früher', { createdAt: '2026-08-01T10:00:00Z' }),
        ],
      });

      const list = await service.findAll('hk-1', 'm1', 'anna');

      expect(list.map((row) => row.id)).toEqual(['früher', 'später']);
    });
  });

  describe('setSelected', () => {
    it('hängt ein neues Lied ans Ende der Setlist', async () => {
      const { service, meetingSong } = setup({
        rows: [
          entry('erstes', { selected: true, position: 1 }),
          entry('zweites', { selected: true, position: 2 }),
          entry('neu'),
        ],
      });

      await service.setSelected(
        'hk-1',
        'm1',
        'neu',
        { isSelected: true },
        'lena',
      );

      expect(meetingSong.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isSelected: true, position: 3 },
        }),
      );
    });

    it('macht ein entferntes Lied wieder zum Vorschlag', async () => {
      const { service, meetingSong } = setup({
        rows: [entry('erstes', { selected: true, position: 1 })],
      });

      await service.setSelected(
        'hk-1',
        'm1',
        'erstes',
        { isSelected: false },
        'lena',
      );

      expect(meetingSong.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isSelected: false, position: null },
        }),
      );
      // Gelöscht wird nichts — Stimmen und Vorschlag bleiben.
      expect(meetingSong.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    const setlist = [
      entry('a', { selected: true, position: 1 }),
      entry('b', { selected: true, position: 2 }),
      entry('vorschlag'),
    ];

    it('setzt die Plätze in der geschickten Reihenfolge', async () => {
      const { service, meetingSong } = setup({ rows: setlist });

      await service.reorder(
        'hk-1',
        'm1',
        { meetingSongIds: ['b', 'a'] },
        'lena',
      );

      expect(meetingSong.update).toHaveBeenCalledWith({
        where: { id: 'b' },
        data: { position: 1 },
      });
      expect(meetingSong.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { position: 2 },
      });
    });

    it('lehnt eine Liste ab, die nicht genau die Setlist ist', async () => {
      const { service, meetingSong } = setup({ rows: setlist });

      await expect(
        service.reorder('hk-1', 'm1', { meetingSongIds: ['a'] }, 'lena'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.reorder(
          'hk-1',
          'm1',
          { meetingSongIds: ['a', 'vorschlag'] },
          'lena',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(meetingSong.update).not.toHaveBeenCalled();
    });

    it('gehört dem Musik-Team', async () => {
      const { service, meetingSong } = setup({
        rows: setlist,
        mayPick: false,
      });

      await expect(
        service.reorder('hk-1', 'm1', { meetingSongIds: ['b', 'a'] }, 'niko'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(meetingSong.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lässt jede:n einen Vorschlag löschen', async () => {
      const { service, meetingSong, editRights } = setup({
        rows: [entry('vorschlag')],
        mayPick: false,
      });

      await service.remove('hk-1', 'm1', 'vorschlag', 'niko');

      expect(editRights.assertMayPickSongs).not.toHaveBeenCalled();
      expect(meetingSong.deleteMany).toHaveBeenCalled();
    });

    it('lässt ein Lied in der Setlist nur das Musik-Team löschen', async () => {
      const { service, meetingSong } = setup({
        rows: [entry('gesetzt', { selected: true, position: 1 })],
        mayPick: false,
      });

      await expect(
        service.remove('hk-1', 'm1', 'gesetzt', 'niko'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(meetingSong.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('setVote', () => {
    it('lässt jede:n stimmen und wieder zurücknehmen', async () => {
      const { service, meetingSongVote } = setup({
        rows: [entry('lied')],
        mayPick: false,
      });

      await service.setVote('hk-1', 'm1', 'lied', 'niko', true);
      await service.setVote('hk-1', 'm1', 'lied', 'niko', false);

      expect(meetingSongVote.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { meetingSongId: 'lied', personId: 'niko' },
        }),
      );
      expect(meetingSongVote.deleteMany).toHaveBeenCalledWith({
        where: { meetingSongId: 'lied', personId: 'niko' },
      });
    });

    it('nimmt an einem abgesagten Abend keine Stimmen mehr an', async () => {
      const { service, meetingSongVote } = setup({
        rows: [entry('lied')],
        status: MeetingStatus.CANCELLED,
      });

      await expect(
        service.setVote('hk-1', 'm1', 'lied', 'niko', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(meetingSongVote.upsert).not.toHaveBeenCalled();
    });
  });
});
