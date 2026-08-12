/**
 * Ein Mensch, ein Hauskreis — und die drei Wege, das zu ändern.
 *
 * Der heikelste Fall ist das Verlassen: wer als einzige Admin-Person geht,
 * darf keine Gruppe zurücklassen, in der niemand mehr einladen kann.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MembershipService } from './membership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PersonService } from '../person/person.service';
import type { PhotoService } from '../person/photo.service';
import type { PrayerBuddyGeneratorService } from '../prayer-buddy/prayer-buddy-generator.service';
import type { RoleReleaseService } from '../meeting/role-release.service';
import type { MeetingCancellationService } from '../meeting/meeting-cancellation.service';
import type { NotificationService } from '../notification/notification.service';
import { PersonRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/auth.types';

const user: AuthenticatedUser = {
  keycloakUserId: 'kc-1',
  email: 'niko@example.com',
  name: 'Niko',
  roles: [],
};

function setup(
  options: {
    me?: Record<string, unknown> | null;
    others?: {
      id: string;
      name: string;
      role: PersonRole;
      acceptedAt: Date | null;
      email?: string;
    }[];
    linked?: Record<string, unknown> | null;
    /** Was beim Verlassen an kommenden Abenden frei wurde. */
    leftover?: Partial<{
      meetingIds: string[];
      host: number;
      song: number;
      topic: number;
    }>;
  } = {},
) {
  const personUpdate = jest.fn().mockResolvedValue({});
  const personCreate = jest.fn().mockResolvedValue({ id: 'p-new' });
  const hauskreisDelete = jest.fn().mockResolvedValue({});
  const hauskreisCreate = jest.fn().mockResolvedValue({ id: 'hk-new' });

  const prisma = {
    person: {
      findUnique: jest.fn().mockResolvedValue(options.linked ?? null),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.me === undefined
            ? { id: 'p1', role: PersonRole.MEMBER, locationId: null }
            : options.me,
        ),
      findMany: jest.fn().mockResolvedValue(options.others ?? []),
      update: personUpdate,
      create: personCreate,
    },
    hauskreis: { delete: hauskreisDelete, create: hauskreisCreate },
    // Was beim Löschen des Kontos mitgeht: rein Persönliches ohne Archivwert.
    // Es hängt an `Cascade`, aber das feuert nur beim Löschen der Zeile — und
    // die bleibt hier gerade stehen.
    pushSubscription: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    notificationPreference: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notificationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    absencePeriod: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    // Die Transaktion reicht denselben Client durch; hier zählt nur, was
    // geschrieben werden wollte. Beide Formen: Callback und Array.
    $transaction: jest.fn((run: ((tx: unknown) => unknown) | unknown[]) =>
      typeof run === 'function' ? run(prisma) : Promise.all(run as unknown[]),
    ),
  } as unknown as PrismaService;

  const replanAfterMembershipChange = jest.fn().mockResolvedValue({
    repaired: 0,
    discarded: 0,
    planned: 0,
    notified: 0,
  });

  const releaseEverythingUpcoming = jest.fn().mockResolvedValue({
    meetingIds: [],
    host: 0,
    song: 0,
    topic: 0,
    ...options.leftover,
  });
  const reconcile = jest.fn().mockResolvedValue(undefined);
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });
  // Wer geht, nimmt sein Gesicht mit; die Zeile bleibt fürs Archiv.
  const removePhoto = jest.fn().mockResolvedValue(undefined);

  const discardInvitationAccount = jest.fn().mockResolvedValue(undefined);

  const service = new MembershipService(
    prisma,
    {
      syncHomes: jest.fn(),
      discardInvitationAccount,
    } as unknown as PersonService,
    {
      replanAfterMembershipChange,
    } as unknown as PrayerBuddyGeneratorService,
    { releaseEverythingUpcoming } as unknown as RoleReleaseService,
    { reconcile } as unknown as MeetingCancellationService,
    { notify } as unknown as NotificationService,
    { remove: removePhoto } as unknown as PhotoService,
  );

  return {
    service,
    personUpdate,
    personCreate,
    hauskreisDelete,
    hauskreisCreate,
    replanAfterMembershipChange,
    releaseEverythingUpcoming,
    reconcile,
    notify,
    removePhoto,
    discardInvitationAccount,
  };
}

const member = {
  id: 'p1',
  name: 'Niko',
  role: PersonRole.MEMBER,
  locationId: null,
};
const admin = {
  id: 'p1',
  name: 'Niko',
  role: PersonRole.ADMIN,
  locationId: null,
};
/** Jemand, der schon einmal da war — `acceptedAt` ist gesetzt. */
const other = (role: PersonRole) => ({
  id: 'p2',
  name: 'Mira',
  role,
  acceptedAt: new Date('2026-01-01'),
});

describe('MembershipService.create', () => {
  it('macht die gründende Person zum Admin', async () => {
    const { service, personCreate } = setup();

    await service.create(user, { name: 'Hauskreis Nord' });

    expect(personCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hauskreisId: 'hk-new',
        keycloakUserId: 'kc-1',
        role: PersonRole.ADMIN,
      }),
    });
  });

  /** Ein Wechsel ist ein Umzug und kein stilles Nebeneinander. */
  it('weist ab, wer noch in einem Hauskreis ist', async () => {
    const { service } = setup({
      linked: { active: true, hauskreis: { name: 'Hauskreis Süd' } },
    });

    await expect(
      service.create(user, { name: 'Hauskreis Nord' }),
    ).rejects.toThrow(ConflictException);
  });

  it('lässt gründen, wer den alten schon verlassen hat', async () => {
    const { service, personCreate } = setup({
      linked: { active: false, hauskreis: { name: 'Hauskreis Süd' } },
    });

    await service.create(user, { name: 'Hauskreis Nord' });

    expect(personCreate).toHaveBeenCalled();
  });
});

describe('MembershipService.leave', () => {
  it('behält die Zeile fürs Archiv und gibt den Platz frei', async () => {
    const { service, personUpdate } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
    });

    await service.leave('hk-1', 'p1', {});

    expect(personUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      // `username` fällt mit: er ist global eindeutig, und wer geht, soll in
      // einem anderen Hauskreis wieder unter seinem Namen ankommen können.
      data: {
        active: false,
        keycloakUserId: null,
        username: null,
        locationId: null,
      },
    });
  });

  /**
   * Sonst säße jemand für immer in einem Hauskreis fest, den er verlassen
   * will — deshalb eine Rückfrage und kein Verbot.
   */
  it('verlangt eine Nachfolge von der einzigen Admin-Person', async () => {
    const { service } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    await expect(service.leave('hk-1', 'p1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('setzt die benannte Nachfolge auf Admin', async () => {
    const { service, personUpdate } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    const result = await service.leave('hk-1', 'p1', {
      successorPersonId: 'p2',
    });

    expect(personUpdate).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { role: PersonRole.ADMIN },
    });
    expect(result.successorPersonId).toBe('p2');
  });

  it('weist eine Nachfolge ab, die nicht dazugehört', async () => {
    const { service } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    await expect(
      service.leave('hk-1', 'p1', { successorPersonId: 'fremd' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lässt einen Admin gehen, solange ein anderer bleibt', async () => {
    const { service, personUpdate } = setup({
      me: admin,
      others: [other(PersonRole.ADMIN)],
    });

    const result = await service.leave('hk-1', 'p1', {});

    expect(result.successorPersonId).toBeNull();
    expect(personUpdate).toHaveBeenCalledTimes(1);
  });

  /**
   * Ohne das stünde die gegangene Person in bis zu fünf geplanten Runden — und
   * wer mit ihr gepaart war, bliebe zwei Wochen lang allein.
   */
  it('zieht die Gebetsrotation nach', async () => {
    const { service, replanAfterMembershipChange } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
    });

    await service.leave('hk-1', 'p1', {});

    expect(replanAfterMembershipChange).toHaveBeenCalledWith('hk-1');
  });

  /**
   * Bis hierher blieb alles stehen: die Person hostete weiter am 26. August
   * und stand in der Planungstabelle.
   */
  it('räumt die künftigen Rollen weg und bewertet die Abende neu', async () => {
    const { service, releaseEverythingUpcoming, reconcile } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
      leftover: { meetingIds: ['m1', 'm2'], host: 1 },
    });

    await service.leave('hk-1', 'p1', {});

    expect(releaseEverythingUpcoming).toHaveBeenCalledWith('hk-1', 'p1');
    // Alle kommenden Abende, nicht nur die berührten: mit der Person ändert
    // sich die Schwelle, ab der „alle haben abgesagt" gilt.
    expect(reconcile.mock.calls.map((call) => call[0])).toEqual(['m1', 'm2']);
  });

  it('sagt den Verbleibenden Bescheid', async () => {
    const { service, notify } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
    });

    await service.leave('hk-1', 'p1', {});

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'p2',
        type: 'MEMBER_LEFT',
        // Die Person, um die es geht — sonst hielte `hasBeenSent` den zweiten
        // Austritt für eine Dublette des ersten.
        relatedPersonId: 'p1',
      }),
    );
    expect(notify.mock.calls[0][0].payload.title).toBe(
      'Niko ist nicht mehr dabei',
    );
  });

  it('nennt, was dadurch offen bleibt', async () => {
    const { service, notify } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
      leftover: { meetingIds: ['m1'], host: 2, topic: 1 },
    });

    await service.leave('hk-1', 'p1', {});

    // Was offen ist, nicht wie viel: für die Zahl gibt es die Planungstabelle.
    expect(notify.mock.calls[0][0].payload.body).toContain(
      'Der Plan braucht jetzt einen Gastgeber und jemanden fürs Thema.',
    );
  });

  it('schweigt über offene Rollen, wenn keine offen ist', async () => {
    const { service, notify } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
    });

    await service.leave('hk-1', 'p1', {});

    expect(notify.mock.calls[0][0].payload.body).not.toContain('Der Plan');
  });

  /** Ein zehnter Schalter für einen Fall, den man einmal im Jahr erlebt, wäre
   * eine schlechtere Einstellungsliste. */
  it('sagt der Nachfolge im selben Zug, dass sie übernimmt', async () => {
    const { service, notify } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    await service.leave('hk-1', 'p1', { successorPersonId: 'p2' });

    expect(notify.mock.calls[0][0].payload.body).toContain(
      'Du übernimmst ab jetzt die Verwaltung',
    );
  });

  it('erzählt das den anderen nicht', async () => {
    const { service, notify } = setup({
      me: admin,
      others: [
        other(PersonRole.MEMBER),
        {
          id: 'p3',
          name: 'Chris',
          role: PersonRole.MEMBER,
          acceptedAt: new Date('2026-01-01'),
        },
      ],
    });

    await service.leave('hk-1', 'p1', { successorPersonId: 'p2' });

    const toChris = notify.mock.calls.find(
      (call) => call[0].personId === 'p3',
    ) as [{ payload: { body: string } }];
    expect(toChris[0].payload.body).not.toContain('Du übernimmst');
  });

  /** Eine leere Gruppe, die niemand betreten kann, ist kein Zustand. */
  it('nimmt den Hauskreis mit, wenn die letzte Person geht', async () => {
    const { service, hauskreisDelete } = setup({ me: admin, others: [] });

    await expect(service.leave('hk-1', 'p1', {})).resolves.toEqual({
      hauskreisDeleted: true,
      successorPersonId: null,
    });
    expect(hauskreisDelete).toHaveBeenCalledWith({ where: { id: 'hk-1' } });
  });

  /**
   * Eine offene Einladung ist kein Mitglied. Vorher zählte sie mit, und die
   * Verwaltung fiel an jemanden, der sich nie angemeldet hatte.
   */
  it('nimmt den Hauskreis auch mit, wenn nur Einladungen übrig sind', async () => {
    const { service, hauskreisDelete, discardInvitationAccount } = setup({
      me: admin,
      others: [
        {
          id: 'p2',
          name: 'Mira',
          role: PersonRole.MEMBER,
          acceptedAt: null,
          email: 'mira@example.com',
        },
      ],
    });

    await expect(service.leave('hk-1', 'p1', {})).resolves.toEqual({
      hauskreisDeleted: true,
      successorPersonId: null,
    });
    expect(hauskreisDelete).toHaveBeenCalledWith({ where: { id: 'hk-1' } });
    // Sonst bliebe ein Keycloak-Konto stehen, das sich anmelden kann und
    // nirgends dazugehört.
    expect(discardInvitationAccount).toHaveBeenCalledWith('mira@example.com');
  });

  /**
   * Der Kreis der Nachfolge ist absichtlich weiter: wer seine Nachfolge
   * einlädt und dann geht, soll das können — solange jemand anders bleibt.
   */
  it('lässt eine noch nicht angemeldete Person die Nachfolge antreten', async () => {
    const { service, personUpdate } = setup({
      me: admin,
      others: [
        other(PersonRole.MEMBER),
        {
          id: 'p3',
          name: 'Chris',
          role: PersonRole.MEMBER,
          acceptedAt: null,
          email: 'chris@example.com',
        },
      ],
    });

    await service.leave('hk-1', 'p1', { successorPersonId: 'p3' });

    expect(personUpdate).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { role: PersonRole.ADMIN },
    });
  });
});

/**
 * Konto löschen — der Austritt plus alles, was danach noch auf die Person zeigt.
 *
 * Die eine Entscheidung, die hier hängt: **anonymisieren statt löschen**. Die
 * Fremdschlüssel stehen zweigeteilt (`SetNull` für die Zuschreibung, `Cascade`
 * für die Mitgliedschaft), ein `person.delete` nähme also beides mit — der
 * Abend verlöre seinen Gastgeber *und* die Einheit ihre Gehalten-von-Zeile.
 */
describe('deleteAccount', () => {
  const bleibt = [other(PersonRole.ADMIN)];

  it('räumt die Person aus der Zeile, ohne die Zeile zu löschen', async () => {
    const { service, personUpdate } = setup({ me: member, others: bleibt });

    await expect(service.deleteAccount('hk-1', 'p1', {})).resolves.toEqual({
      hauskreisDeleted: false,
    });

    const anonymisiert = personUpdate.mock.calls.find(
      (call) => call[0].data.anonymizedAt !== undefined,
    );

    expect(anonymisiert?.[0]).toMatchObject({
      where: { id: 'p1' },
      data: { name: 'Ehemaliges Mitglied', email: null, birthdate: null },
    });
  });

  it('löscht das Keycloak-Konto — aber erst nach dem Austritt', async () => {
    const { service, discardInvitationAccount } = setup({
      me: { ...member, keycloakUserId: 'kc-1', email: 'niko@example.com' },
      others: bleibt,
    });

    await service.deleteAccount('hk-1', 'p1', {});

    // Die Adresse muss **vorher** gelesen werden: der Austritt räumt die
    // Keycloak-Id weg, und danach wüsste niemand mehr, welches Konto gemeint
    // war. `discardInvitationAccount` zählt selbst nach, ob die Person die App
    // noch woanders benutzt.
    expect(discardInvitationAccount).toHaveBeenCalledWith('niko@example.com');
  });

  it('anonymisiert nichts mehr, wenn der Hauskreis mitging', async () => {
    // Letzte Person: `leave` löscht den ganzen Hauskreis samt Zeile. Ein
    // `update` darauf liefe ins Leere — übrig bleibt nur das Konto.
    const { service, personUpdate, discardInvitationAccount } = setup({
      me: { ...admin, email: 'niko@example.com' },
      others: [],
    });

    await expect(service.deleteAccount('hk-1', 'p1', {})).resolves.toEqual({
      hauskreisDeleted: true,
    });

    expect(
      personUpdate.mock.calls.some(
        (call) => call[0].data.anonymizedAt !== undefined,
      ),
    ).toBe(false);
    expect(discardInvitationAccount).toHaveBeenCalledWith('niko@example.com');
  });

  it('verlangt eine Nachfolge wie der Austritt', async () => {
    const { service } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    // Nicht nachgebaut, sondern durchgereicht: zwei Fassungen derselben Regel
    // liefen mit der Zeit auseinander.
    await expect(service.deleteAccount('hk-1', 'p1', {})).rejects.toThrow(
      BadRequestException,
    );
  });
});

/**
 * Der Teil, der schiefgehen darf.
 *
 * Bis zum Keycloak-Aufruf sind Name, Adresse und Geburtstag weg — nicht
 * zurückzunehmen. Ein Fehler wäre jetzt die schlechteste aller Antworten: die
 * Löschung ist passiert, ein zweiter Versuch fände die Zeile nicht mehr, und
 * die Person stünde vor einer Fehlermeldung für etwas, das geklappt hat.
 */
describe('deleteAccount, wenn Keycloak nicht antwortet', () => {
  it('meldet trotzdem Erfolg und schreibt es ins Log', async () => {
    const { service, discardInvitationAccount, personUpdate } = setup({
      me: { ...member, email: 'niko@example.com' },
      others: [other(PersonRole.ADMIN)],
    });
    discardInvitationAccount.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.deleteAccount('hk-1', 'p1', {})).resolves.toEqual({
      hauskreisDeleted: false,
    });

    // Die Zeile ist trotzdem anonymisiert — das ist der Teil, um den es geht.
    expect(
      personUpdate.mock.calls.some(
        (call) => call[0].data.anonymizedAt !== undefined,
      ),
    ).toBe(true);
  });
});
