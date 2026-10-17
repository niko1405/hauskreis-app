import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { NoteService } from './note.service';
import { noteResponseSchema } from './dto/note-response.dto';
import { PreconditionRequiredException } from '../common/http/optimistic-update';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';

const NOTE = '00000000-0000-4000-8000-0000000000aa';

const anna = { id: 'p1', name: 'Anna', photoUpdatedAt: null };
const ben = { id: 'p2', name: 'Ben', photoUpdatedAt: null };

/** Annas Packliste, Ben schreibt mit. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE,
    hauskreisId: 'hk',
    title: 'Packliste',
    body: '- [ ] Zelt\n- [x] Schlafsack',
    forEveryone: false,
    createdByPersonId: 'p1',
    updatedByPersonId: 'p1',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-02T10:00:00.000Z'),
    version: 3,
    createdBy: { ...anna, active: true },
    updatedBy: anna,
    members: [{ person: { ...ben, active: true } }],
    ...overrides,
  };
}

function setup(current: ReturnType<typeof row> | null = row()) {
  const note = {
    findFirst: jest.fn().mockResolvedValue(current),
    findMany: jest.fn().mockResolvedValue(current ? [current] : []),
    count: jest.fn().mockResolvedValue(current ? 1 : 0),
    create: jest.fn().mockResolvedValue(current),
    update: jest.fn().mockResolvedValue(current),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: jest.fn().mockResolvedValue(current),
    delete: jest.fn().mockResolvedValue({}),
  };
  const noteMember = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const person = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue({ name: 'Anna' }),
  };
  const prisma = {
    note,
    noteMember,
    person,
    $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
  };
  const notify = jest.fn().mockResolvedValue({});

  const service = new NoteService(
    prisma as unknown as PrismaService,
    { notify } as unknown as NotificationService,
  );

  return { service, note, noteMember, person, notify };
}

beforeEach(() => jest.clearAllMocks());

describe('NoteService — wer sie sieht', () => {
  it('fragt in der Liste nur, was die Person sehen darf', async () => {
    const { service, note } = setup();

    const page = await service.findAll(
      'hk',
      { take: 20, skip: 0, search: 'zelt' },
      'p2',
    );

    const where = note.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual([
      { forEveryone: true },
      { createdByPersonId: 'p2' },
      { members: { some: { personId: 'p2' } } },
    ]);
    expect(where.AND[1].OR[0].title.contains).toBe('zelt');
    // Die Liste trägt keinen Text, nur Vorschau und Stand der Checkliste.
    expect(page.items[0]).not.toHaveProperty('body');
    expect(page.items[0].preview).toBe('Zelt Schlafsack');
    expect(page.items[0].checklist).toEqual({ done: 1, total: 2 });
  });

  it('gibt eine fremde Notiz als 404 aus, nicht als 403', async () => {
    const { service } = setup(null);
    await expect(service.findOne('hk', NOTE, 'p3')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('kennt keinen Admin-Weg — auch wenn die Abfrage sie liefern würde', async () => {
    // Die Regel steht zweimal: in der Abfrage und in `mayReadNote`. Hier
    // liefert der Mock die Notiz trotzdem; die zweite Prüfung hält.
    const { service } = setup();
    await expect(service.findOne('hk', NOTE, 'p9')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lässt bei „Ganze Gruppe" alle lesen', async () => {
    const { service } = setup(row({ forEveryone: true, members: [] }));
    await expect(service.findOne('hk', NOTE, 'p9')).resolves.toMatchObject({
      id: NOTE,
      mayManage: false,
    });
  });
});

describe('NoteService.create', () => {
  it('trägt die anderen ein, nicht den, der anlegt, und sagt es ihnen', async () => {
    const { service, note, person, notify } = setup();
    person.findMany
      .mockResolvedValueOnce([{ id: 'p2' }]) // gehören zur Gruppe
      .mockResolvedValueOnce([{ id: 'p2' }]); // wer es hört

    await service.create(
      'hk',
      { title: 'Packliste', personIds: ['p1', 'p2'] },
      'p1',
    );

    expect(note.create.mock.calls[0][0].data.members.createMany.data).toEqual([
      { personId: 'p2' },
    ]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      personId: 'p2',
      type: 'NOTE_SHARED',
      relatedKey: NOTE,
      payload: { url: `/notiz?id=${NOTE}` },
    });
  });

  it('lehnt Leute aus einer anderen Gruppe ab', async () => {
    const { service, person } = setup();
    person.findMany.mockResolvedValueOnce([]);

    await expect(
      service.create('hk', { title: 'X', personIds: ['fremd'] }, 'p1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('meldet bei „Nur ich" niemandem etwas', async () => {
    const { service, notify } = setup();
    await service.create('hk', { title: 'Für mich' }, 'p1');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('NoteService.update', () => {
  it('verlangt If-Match', async () => {
    const { service } = setup();
    await expect(
      service.update('hk', NOTE, { body: 'neu' }, 'p2'),
    ).rejects.toBeInstanceOf(PreconditionRequiredException);
  });

  it('meldet einen fremden Stand als 412', async () => {
    const { service, note } = setup();
    note.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update('hk', NOTE, { body: 'neu' }, 'p2', {
        kind: 'versions',
        versions: [2],
      }),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('merkt sich, wer zuletzt geschrieben hat, und meldet nichts', async () => {
    const { service, note, notify } = setup();

    await service.update('hk', NOTE, { body: 'neu' }, 'p2', {
      kind: 'versions',
      versions: [3],
    });

    expect(note.updateMany.mock.calls[0][0].data).toMatchObject({
      body: 'neu',
      updatedByPersonId: 'p2',
      version: { increment: 1 },
    });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('NoteService.setPeople', () => {
  it('lässt nur den, der sie angelegt hat, die Leute ändern', async () => {
    const { service } = setup();
    await expect(
      service.setPeople('hk', NOTE, { forEveryone: true, personIds: [] }, 'p2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('öffnet den Notausgang, wenn der Ersteller gegangen ist', async () => {
    const { service, person } = setup(
      row({ createdBy: { ...anna, active: false } }),
    );
    person.findMany.mockResolvedValueOnce([{ id: 'p2' }]);
    await expect(
      service.setPeople(
        'hk',
        NOTE,
        { forEveryone: false, personIds: ['p2'] },
        'p2',
      ),
    ).resolves.toMatchObject({ id: NOTE });
  });

  it('ersetzt die Liste, hebt die Version und meldet nur, wer neu ist', async () => {
    const { service, note, noteMember, person, notify } = setup();
    person.findMany
      .mockResolvedValueOnce([{ id: 'p2' }, { id: 'p3' }])
      .mockResolvedValueOnce([{ id: 'p3' }]);

    await service.setPeople(
      'hk',
      NOTE,
      { forEveryone: false, personIds: ['p2', 'p3'] },
      'p1',
    );

    expect(noteMember.deleteMany).toHaveBeenCalledWith({
      where: { noteId: NOTE, personId: { notIn: ['p2', 'p3'] } },
    });
    expect(note.update.mock.calls[0][0].data).toEqual({
      forEveryone: false,
      version: { increment: 1 },
    });
    // Wer schon dabei war (Anna, Ben), hört nichts.
    const audience = person.findMany.mock.calls[1][0].where.id;
    expect(audience.notIn).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].personId).toBe('p3');
  });

  it('meldet niemandem etwas, wenn sie schon für alle offen war', async () => {
    const { service, notify } = setup(row({ forEveryone: true }));
    await service.setPeople(
      'hk',
      NOTE,
      { forEveryone: true, personIds: [] },
      'p1',
    );
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('NoteService.check', () => {
  it('hakt den gemeinten Punkt ab, auf genau dem Stand, den es gelesen hat', async () => {
    const { service, note } = setup();

    await service.check(
      'hk',
      NOTE,
      { index: 0, text: 'Zelt', done: true },
      'p2',
    );

    expect(note.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: NOTE, hauskreisId: 'hk', version: 3 },
      data: { body: '- [x] Zelt\n- [x] Schlafsack', updatedByPersonId: 'p2' },
    });
  });

  it('setzt neu an, wenn jemand anders gerade einen anderen Punkt abgehakt hat', async () => {
    const { service, note } = setup();
    note.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      service.check('hk', NOTE, { index: 0, text: 'Zelt', done: true }, 'p2'),
    ).resolves.toMatchObject({ id: NOTE });
    expect(note.updateMany).toHaveBeenCalledTimes(2);
  });

  it('meldet 409, wenn an der Stelle inzwischen etwas anderes steht', async () => {
    const { service } = setup();
    await expect(
      service.check('hk', NOTE, { index: 0, text: 'Kocher', done: true }, 'p2'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('NoteService.remove', () => {
  it('löscht nur, wer sie angelegt hat', async () => {
    const { service, note } = setup();
    await expect(service.remove('hk', NOTE, 'p2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.remove('hk', NOTE, 'p1');
    expect(note.delete).toHaveBeenCalledWith({ where: { id: NOTE } });
  });
});

/** Ohne `version` im Schema gäbe es keinen ETag — siehe `groupIdeaResponseSchema`. */
describe('noteResponseSchema', () => {
  const note = {
    id: NOTE,
    title: 'Packliste',
    body: '',
    forEveryone: false,
    createdBy: null,
    updatedBy: null,
    members: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    version: 2,
    mayManage: true,
  };

  it('trägt die Version', () => {
    expect(noteResponseSchema.parse(note).version).toBe(2);
  });

  it('lehnt eine Antwort ohne Version ab', () => {
    const { version: _version, ...ohne } = note;
    expect(() => noteResponseSchema.parse(ohne)).toThrow(/version/);
  });
});
