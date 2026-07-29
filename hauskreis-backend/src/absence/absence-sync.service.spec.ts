import { AbsenceSyncService } from './absence-sync.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { MeetingNotificationService } from '../meeting/meeting-notification.service';
import {
  AttendanceSource,
  AttendanceStatus,
} from '../../generated/prisma/enums';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = utc('2026-08-01');

type Attendance = { status: AttendanceStatus; source: AttendanceSource };

function setup(options: {
  periods?: Array<{ startDate: Date; endDate: Date }>;
  meetings?: Array<{ id: string; date: Date; attendance?: Attendance }>;
}) {
  const absenceFindMany = jest.fn().mockResolvedValue(
    (options.periods ?? []).map((period) => ({
      personId: 'niko',
      ...period,
    })),
  );

  const meetingFindMany = jest.fn().mockResolvedValue(
    (options.meetings ?? []).map((meeting) => ({
      id: meeting.id,
      date: meeting.date,
      attendances: meeting.attendance ? [meeting.attendance] : [],
    })),
  );

  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const handleDecline = jest.fn().mockResolvedValue(undefined);

  const service = new AbsenceSyncService(
    {
      absencePeriod: { findMany: absenceFindMany },
      meeting: { findMany: meetingFindMany },
      meetingAttendance: { createMany, deleteMany },
    } as unknown as PrismaService,
    { handleDecline } as unknown as MeetingNotificationService,
  );

  return { service, createMany, deleteMany, handleDecline, meetingFindMany };
}

const holiday = { startDate: utc('2026-08-10'), endDate: utc('2026-08-24') };

describe('AbsenceSyncService.syncPerson', () => {
  it('declines the evenings the holiday covers', async () => {
    const { service, createMany } = setup({
      periods: [holiday],
      meetings: [
        { id: 'before', date: utc('2026-08-04') },
        { id: 'inside', date: utc('2026-08-11') },
        { id: 'last-day', date: utc('2026-08-24') },
        { id: 'after', date: utc('2026-08-25') },
      ],
    });

    await expect(
      service.syncPerson('hk-1', 'niko', { now: NOW }),
    ).resolves.toEqual({ declined: 2, withdrawn: 0 });

    expect(
      createMany.mock.calls[0][0].data.map((row) => row.meetingId),
    ).toEqual(['inside', 'last-day']);
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      status: AttendanceStatus.ABSENT,
      source: AttendanceSource.ABSENCE,
    });
  });

  it('leaves a deliberate answer alone', async () => {
    // "Doch, ich komme an dem Abend" outranks the blanket date range.
    const { service, createMany, deleteMany } = setup({
      periods: [holiday],
      meetings: [
        {
          id: 'inside',
          date: utc('2026-08-11'),
          attendance: {
            status: AttendanceStatus.ATTENDING,
            source: AttendanceSource.SELF,
          },
        },
      ],
    });

    await expect(
      service.syncPerson('hk-1', 'niko', { now: NOW }),
    ).resolves.toEqual({ declined: 0, withdrawn: 0 });

    expect(createMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('never withdraws a decline the person made themselves', async () => {
    const { service, deleteMany } = setup({
      periods: [],
      meetings: [
        {
          id: 'somewhere',
          date: utc('2026-08-11'),
          attendance: {
            status: AttendanceStatus.ABSENT,
            source: AttendanceSource.SELF,
          },
        },
      ],
    });

    await service.syncPerson('hk-1', 'niko', { now: NOW });

    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('gives evenings back when the period no longer covers them', async () => {
    // The holiday was shortened; the derived decline has to go with it.
    const { service, deleteMany } = setup({
      periods: [{ startDate: utc('2026-08-10'), endDate: utc('2026-08-12') }],
      meetings: [
        {
          id: 'still-inside',
          date: utc('2026-08-11'),
          attendance: {
            status: AttendanceStatus.ABSENT,
            source: AttendanceSource.ABSENCE,
          },
        },
        {
          id: 'now-outside',
          date: utc('2026-08-18'),
          attendance: {
            status: AttendanceStatus.ABSENT,
            source: AttendanceSource.ABSENCE,
          },
        },
      ],
    });

    await expect(
      service.syncPerson('hk-1', 'niko', { now: NOW }),
    ).resolves.toEqual({ declined: 0, withdrawn: 1 });

    expect(deleteMany.mock.calls[0][0].where.meetingId.in).toEqual([
      'now-outside',
    ]);
  });

  it('leaves the past alone', async () => {
    const { service, meetingFindMany } = setup({ periods: [holiday] });

    await service.syncPerson('hk-1', 'niko', { now: NOW });

    // A holiday entered after the fact must not rewrite who was there.
    expect(meetingFindMany.mock.calls[0][0].where.date).toEqual({ gte: NOW });
  });

  it('lets the ordinary drop-out notifications fire', async () => {
    const { service, handleDecline } = setup({
      periods: [holiday],
      meetings: [{ id: 'inside', date: utc('2026-08-11') }],
    });

    await service.syncPerson('hk-1', 'niko', { now: NOW });

    // The whole point of writing rows: the host hears about a holiday exactly
    // as they would about a manual cancellation.
    expect(handleDecline).toHaveBeenCalledWith('inside', 'niko');
  });

  it('can stay quiet when asked', async () => {
    const { service, handleDecline, createMany } = setup({
      periods: [holiday],
      meetings: [{ id: 'inside', date: utc('2026-08-11') }],
    });

    await service.syncPerson('hk-1', 'niko', { now: NOW, notify: false });

    expect(createMany).toHaveBeenCalled();
    expect(handleDecline).not.toHaveBeenCalled();
  });

  it('does nothing when there is nothing to change', async () => {
    const { service, createMany, deleteMany } = setup({
      periods: [holiday],
      meetings: [
        {
          id: 'inside',
          date: utc('2026-08-11'),
          attendance: {
            status: AttendanceStatus.ABSENT,
            source: AttendanceSource.ABSENCE,
          },
        },
      ],
    });

    await expect(
      service.syncPerson('hk-1', 'niko', { now: NOW }),
    ).resolves.toEqual({ declined: 0, withdrawn: 0 });

    expect(createMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
