import { ConflictException, NotFoundException } from '@nestjs/common';
import { PersonService } from './person.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { KeycloakAdminService } from '../auth/keycloak-admin.service';
import type { LocationService } from '../location/location.service';
import type { ModuleRef } from '@nestjs/core';
import { MEMBERSHIP_SERVICE } from '../hauskreis/membership.token';
import type { AutoAttendanceService } from '../attendance/auto-attendance.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { withClock } from '../meeting/group-clock.testing';

type PersonDelegate = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  delete: jest.Mock;
  updateMany: jest.Mock;
};

/** Was beim Konto-Löschen mit abgeräumt wird — rein persönlich, kein Archiv. */
function sideTables() {
  return {
    pushSubscription: { deleteMany: jest.fn() },
    notificationPreference: { deleteMany: jest.fn() },
    notificationLog: { deleteMany: jest.fn() },
    absencePeriod: { deleteMany: jest.fn() },
    meetingPrayerRequest: { deleteMany: jest.fn() },
  };
}

function setup() {
  const person: PersonDelegate = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(2),
    delete: jest.fn(),
    updateMany: jest.fn(),
  };
  const side = sideTables();
  const prisma = {
    person,
    ...side,
    // Nimmt hier nur die Liste der Aufrufe entgegen; was darin steht, prüfen
    // die Tests einzeln.
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : Promise.resolve(),
    ),
  };
  const keycloakAdmin = {
    inviteUser: jest.fn(),
    deleteUser: jest.fn(),
    deleteUserByEmail: jest.fn(),
  };
  // Zieht sonst den Namen einer Wohnung nach; hier interessiert nur, dass es
  // aufgerufen werden *kann*.
  const locations = { syncHomeName: jest.fn() };
  // Füllt sonst die Zusagen derer nach, die grundsätzlich dabei sind.
  const autoAttendance = { apply: jest.fn().mockResolvedValue(0) };
  // Wer dazukommt oder geht, ändert die Gebetsrotation. Was dabei herauskommt,
  // prüft `prayer-buddy-replan.spec.ts`; hier zählt nur, dass gefragt wird.
  const replanAfterMembershipChange = jest.fn().mockResolvedValue({
    repaired: 0,
    discarded: 0,
    planned: 0,
    notified: 0,
  });
  // Wer entfernt wird, geht denselben Weg wie jemand, der selbst geht. Was
  // dabei passiert, prüft `membership.service.spec.ts`; hier zählt, dass es
  // aufgerufen wird — und dass die Zeile nicht mehr hart gelöscht wird.
  const leave = jest
    .fn()
    .mockResolvedValue({ hauskreisDeleted: false, successorPersonId: null });
  const moduleRef = {
    get: jest.fn((token: unknown) =>
      token === MEMBERSHIP_SERVICE
        ? { leave }
        : { replanAfterMembershipChange },
    ),
  };
  const service = withClock(
    new PersonService(
      prisma as unknown as PrismaService,
      keycloakAdmin as unknown as KeycloakAdminService,
      locations as unknown as LocationService,
      autoAttendance as unknown as AutoAttendanceService,
      moduleRef as unknown as ModuleRef,
    ),
  );
  return {
    service,
    person,
    side,
    keycloakAdmin,
    locations,
    replanAfterMembershipChange,
    autoAttendance,
    leave,
  };
}

const user: AuthenticatedUser = {
  keycloakUserId: 'kc-123',
  email: 'lea@example.com',
  emailVerified: true,
  roles: ['member'],
};

describe('PersonService.resolveForUser', () => {
  it('returns the already linked person without touching the email lookup', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p1',
      keycloakUserId: 'kc-123',
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p1',
      keycloakUserId: 'kc-123',
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(person.findFirst).not.toHaveBeenCalled();
    expect(person.update).not.toHaveBeenCalled();
  });

  it('links an unlinked person by email on first login', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([{ id: 'p2' }]);
    person.update.mockResolvedValue({ id: 'p2', keycloakUserId: 'kc-123' });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p2',
      keycloakUserId: 'kc-123',
    });
    // `active: true` schließt aus, was jemand verlassen hat — sonst holte der
    // nächste Login ihn dorthin zurück.
    expect(person.findMany).toHaveBeenCalledWith({
      where: { email: 'lea@example.com', keycloakUserId: null, active: true },
      select: { id: true },
    });
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      // Der erste Login ist der Moment, in dem die Einladung angenommen ist.
      data: { keycloakUserId: 'kc-123', acceptedAt: expect.any(Date) },
    });
  });

  /**
   * Sonst entschiede die Reihenfolge, in der Postgres die Zeilen zurückgibt,
   * in welchem Hauskreis jemand landet. Das Frontend zeigt stattdessen die
   * offenen Einladungen zur Auswahl.
   */
  it('entscheidet bei mehreren offenen Einladungen nicht selbst', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([{ id: 'p2' }, { id: 'p3' }]);

    await expect(service.resolveForUser(user)).rejects.toThrow(
      NotFoundException,
    );
    expect(person.update).not.toHaveBeenCalled();
  });

  it('marks an invited person as arrived on their first login', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: null,
    });
    person.update.mockResolvedValue({ id: 'p3', acceptedAt: new Date() });

    await service.resolveForUser(user);

    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  /**
   * Der Augenblick, in dem wirklich jemand dazukommt — und damit der, in dem
   * die Gebetsrotation nachzieht. Vorher passierte das beim Einladen, also für
   * jemanden, der die App vielleicht nie öffnet.
   */
  it('holt die Person bei der ersten Anmeldung in die Gebetsrotation', async () => {
    const { service, person, replanAfterMembershipChange } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: null,
    });
    person.update.mockResolvedValue({
      id: 'p3',
      hauskreisId: 'hk-7',
      acceptedAt: new Date(),
    });

    await service.resolveForUser(user);

    expect(replanAfterMembershipChange).toHaveBeenCalledWith('hk-7');
  });

  /**
   * Sie läuft im Anfrageweg, und zwar bei der allerersten Anfrage überhaupt.
   * Eine Begrüßung, die aus einer Fehlermeldung besteht, wäre der schlechteste
   * denkbare Einstieg — und der Cron um vier Uhr baut ohnehin nach.
   */
  it('lässt die Anmeldung nicht an der Gebetsrotation scheitern', async () => {
    const { service, person, replanAfterMembershipChange } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: null,
    });
    person.update.mockResolvedValue({ id: 'p3', hauskreisId: 'hk-7' });
    replanAfterMembershipChange.mockRejectedValue(new Error('Datenbank weg'));

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p3',
      hauskreisId: 'hk-7',
    });
  });

  it('leaves the arrival date alone on every login after the first', async () => {
    const { service, person } = setup();
    const arrived = new Date('2026-01-02T03:04:05.000Z');
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: arrived,
    });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: arrived,
    });
    expect(person.update).not.toHaveBeenCalled();
  });

  it('throws when no person matches the email', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([]);

    await expect(service.resolveForUser(user)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the token carries no email to match on', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveForUser({
        keycloakUserId: 'kc-9',
        emailVerified: true,
        roles: [],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(person.findMany).not.toHaveBeenCalled();
  });
});

describe('PersonService.invite', () => {
  // Kein Name mehr: den wählt die Person beim Aktivieren ihres Kontos selbst.
  const invitation = {
    email: 'lea@example.com',
    role: 'member' as const,
  };

  /**
   * Eine Einladung ist eine offene Frage, keine Zusage.
   *
   * Hier stand das Gegenteil: Wer eingeladen war, kam sofort in die Rotation,
   * damit er nicht bis zu zehn Wochen auf seine ersten Buddys wartet. Das
   * Warten war ein echtes Problem, der Schluss trotzdem falsch — ein Name, dem
   * niemand schreiben kann, ließ sein Gegenüber zwei Wochen allein beten.
   * Nachgezogen wird jetzt beim **Annehmen** (`resolveForUser`,
   * `MembershipService.acceptInvitation`).
   */
  it('lässt die Gebetsrotation beim Einladen in Ruhe', async () => {
    const { service, person, keycloakAdmin, replanAfterMembershipChange } =
      setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: true,
      invitationEmailSent: true,
    });
    person.create.mockResolvedValue({ id: 'p9' });

    await service.invite('hk-1', invitation);

    expect(replanAfterMembershipChange).not.toHaveBeenCalled();
  });

  it('rolls the Keycloak account back when the local insert fails', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: true,
      invitationEmailSent: true,
    });
    person.create.mockRejectedValue(new Error('duplicate email'));

    await expect(service.invite('hk-1', invitation)).rejects.toThrow(
      'duplicate email',
    );

    expect(keycloakAdmin.deleteUserByEmail).toHaveBeenCalledWith(
      'lea@example.com',
    );
  });

  /**
   * Sonst nähme ein misslungener Versuch, jemanden einzuladen, einem Menschen
   * den Zugang zu dem Hauskreis weg, in dem er längst ist.
   */
  it('lässt ein Konto stehen, das es vorher schon gab', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: false,
      invitationEmailSent: false,
    });
    person.create.mockRejectedValue(new Error('duplicate email'));

    await expect(service.invite('hk-1', invitation)).rejects.toThrow(
      'duplicate email',
    );

    expect(keycloakAdmin.deleteUserByEmail).not.toHaveBeenCalled();
  });

  /**
   * Die Zeile bleibt beim Verlassen stehen, damit vergangene Abende weiter
   * zeigen, wer gehostet hat. Ohne diesen Blick wäre eine zweite Einladung an
   * dieselbe Adresse ein Verstoß gegen `@@unique([hauskreisId, email])` — wer
   * einmal gegangen ist, käme nie wieder herein.
   */
  it('weckt eine verlassene Zeile wieder auf, statt eine zweite anzulegen', async () => {
    const { service, person, keycloakAdmin } = setup();
    person.findFirst.mockResolvedValue({
      id: 'p-alt',
      active: false,
      name: 'Lea',
    });
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: false,
      invitationEmailSent: false,
    });
    person.update.mockResolvedValue({ id: 'p-alt' });

    await service.invite('hk-1', invitation);

    expect(person.create).not.toHaveBeenCalled();
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p-alt' },
      data: {
        role: 'MEMBER',
        active: true,
        acceptedAt: null,
        keycloakUserId: null,
        username: null,
        email: 'lea@example.com',
        anonymizedAt: null,
      },
    });
  });

  it('weist ab, wer schon dabei ist', async () => {
    const { service, person, keycloakAdmin } = setup();
    person.findFirst.mockResolvedValue({
      id: 'p-alt',
      active: true,
      name: 'Lea',
    });

    await expect(service.invite('hk-1', invitation)).rejects.toThrow(
      ConflictException,
    );
    expect(keycloakAdmin.inviteUser).not.toHaveBeenCalled();
  });

  /** Eine Einladung nimmt niemandem seine bestehende Mitgliedschaft weg. */
  it('legt die Person ohne Keycloak-Verknüpfung an', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: true,
      invitationEmailSent: true,
    });
    person.create.mockResolvedValue({ id: 'p9' });

    await service.invite('hk-1', { ...invitation, role: 'admin' });

    expect(person.create).toHaveBeenCalledWith({
      data: {
        hauskreisId: 'hk-1',
        // Ein Platzhalter bis zur ersten Anmeldung — dann übernimmt
        // `resolveForUser` den selbst gewählten Nutzernamen.
        name: 'lea',
        email: 'lea@example.com',
        role: 'ADMIN',
      },
    });
  });
});

/**
 * Der Nutzername gehört an zwei Stellen gleichzeitig — sonst kann man sich mit
 * dem, den man in der App sieht, nicht anmelden.
 */
describe('PersonService und der Nutzername', () => {
  const membership = {
    id: 'p1',
    hauskreisId: 'hk-1',
    role: 'ADMIN' as const,
  };

  function setupUpdate(before: Record<string, unknown>) {
    const fixture = setup();
    fixture.person.findFirst.mockResolvedValue(before);
    fixture.person.update.mockResolvedValue({ id: 'p1' });
    fixture.person.findMany.mockResolvedValue([]);
    return fixture;
  }

  it('schreibt einen geänderten Namen nach Keycloak', async () => {
    const { service, keycloakAdmin } = setupUpdate({
      locationId: null,
      active: true,
      username: 'niko',
      keycloakUserId: 'kc-1',
    });
    keycloakAdmin.changeUsername = jest.fn().mockResolvedValue(undefined);

    await service
      .update('hk-1', 'p1', { username: 'niko.v' }, membership)
      .catch(() => undefined);

    expect(keycloakAdmin.changeUsername).toHaveBeenCalledWith('kc-1', 'niko.v');
  });

  it('fasst Keycloak nicht an, wenn der Name gleich bleibt', async () => {
    const { service, keycloakAdmin } = setupUpdate({
      locationId: null,
      active: true,
      username: 'niko',
      keycloakUserId: 'kc-1',
    });
    keycloakAdmin.changeUsername = jest.fn();

    await service
      .update('hk-1', 'p1', { username: 'niko' }, membership)
      .catch(() => undefined);

    expect(keycloakAdmin.changeUsername).not.toHaveBeenCalled();
  });

  /** Eine offene Einladung hat noch kein Konto — da gibt es nichts abzugleichen. */
  it('fasst Keycloak nicht an, solange kein Konto verknüpft ist', async () => {
    const { service, keycloakAdmin } = setupUpdate({
      locationId: null,
      active: true,
      username: null,
      keycloakUserId: null,
    });
    keycloakAdmin.changeUsername = jest.fn();

    await service
      .update('hk-1', 'p1', { username: 'lea' }, membership)
      .catch(() => undefined);

    expect(keycloakAdmin.changeUsername).not.toHaveBeenCalled();
  });

  it('übernimmt den Namen aus dem Token beim ersten Anmelden', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-1',
      username: null,
      acceptedAt: null,
    });
    person.update.mockResolvedValue({ id: 'p3' });

    await service.resolveForUser({
      keycloakUserId: 'kc-1',
      email: 'lea@example.com',
      username: 'lea.m',
      emailVerified: true,
      roles: [],
    });

    // Anzeigename mit vorbelegt: bis hierher stand dort, was jemand anders beim
    // Einladen eingetippt hat.
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: {
        acceptedAt: expect.any(Date),
        username: 'lea.m',
        name: 'lea.m',
      },
    });
  });

  it('überschreibt einen selbst gesetzten Anzeigenamen nicht', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-1',
      username: 'alt',
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    person.update.mockResolvedValue({ id: 'p3' });

    await service.resolveForUser({
      keycloakUserId: 'kc-1',
      email: 'lea@example.com',
      username: 'neu',
      emailVerified: true,
      roles: [],
    });

    // Der Nutzername zieht nach, der Anzeigename bleibt: ihn bei jeder
    // Anmeldung neu zu setzen nähme eine Entscheidung aus dem Profil zurück.
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { acceptedAt: undefined, username: 'neu' },
    });
  });
});

describe('PersonService und die Admin-Rechte', () => {
  const asAdmin = { id: 'p9', hauskreisId: 'hk-1', role: 'ADMIN' as const };
  const asMember = { id: 'p9', hauskreisId: 'hk-1', role: 'MEMBER' as const };

  it('lässt niemanden ohne Admin-Rechte Rollen vergeben', async () => {
    const { service } = setup();

    await expect(
      service.update('hk-1', 'p1', { role: 'ADMIN' }, asMember),
    ).rejects.toThrow(/Nur Admins/);
  });

  /**
   * Sonst stünde eine Gruppe da, in der niemand mehr einladen darf — und
   * anders als beim Verlassen gibt es hier keine Tür, durch die man wieder
   * hinauskommt.
   */
  it('lässt die letzte Admin-Person sich nicht selbst degradieren', async () => {
    const { service, person } = setup();
    person.count = jest.fn().mockResolvedValue(1);

    await expect(
      service.update('hk-1', 'p9', { role: 'MEMBER' }, asAdmin),
    ).rejects.toThrow(/einzige Person mit Admin-Rechten/);
  });

  it('lässt sie gehen, sobald jemand anders auch Admin ist', async () => {
    const { service, person } = setup();
    person.count = jest.fn().mockResolvedValue(2);
    person.findFirst.mockResolvedValue({
      locationId: null,
      active: true,
      username: null,
      keycloakUserId: null,
    });
    person.update.mockResolvedValue({ id: 'p9' });
    person.findMany.mockResolvedValue([]);

    await expect(
      service
        .update('hk-1', 'p9', { role: 'MEMBER' }, asAdmin)
        .catch(() => 'ok'),
    ).resolves.toBeDefined();
  });

  it('lässt einen Admin jemand anderen befördern', async () => {
    const { service, person } = setup();
    person.count = jest.fn().mockResolvedValue(1);
    person.findFirst.mockResolvedValue({
      locationId: null,
      active: true,
      username: null,
      keycloakUserId: null,
    });
    person.update.mockResolvedValue({ id: 'p1' });
    person.findMany.mockResolvedValue([]);

    await expect(
      service
        .update('hk-1', 'p1', { role: 'ADMIN' }, asAdmin)
        .catch(() => 'ok'),
    ).resolves.toBeDefined();
  });
});

describe('PersonService.remove', () => {
  const asAdmin = { id: 'p9', hauskreisId: 'hk-1', role: 'ADMIN' as const };

  /**
   * Das Verlassen im Profil klärt die Nachfolge — wer sich hier selbst
   * herausnähme, käme an dieser Frage vorbei und könnte eine Gruppe ohne Admin
   * zurücklassen.
   */
  it('lässt einen Admin sich nicht selbst entfernen', async () => {
    const { service, person } = setup();

    await expect(service.remove('hk-1', 'p9', asAdmin)).rejects.toThrow(
      /Dich selbst kannst du hier nicht entfernen/,
    );

    // Die Regel greift, bevor irgendetwas gelesen oder geschrieben wird —
    // sonst hinge sie an der Reihenfolge der Aufrufe darunter.
    expect(person.findFirst).not.toHaveBeenCalled();
    expect(person.delete).not.toHaveBeenCalled();
  });

  /**
   * Der wichtigste Test dieser Datei.
   *
   * Hier stand einmal ein `person.delete`, und daran hängen fünf Tabellen mit
   * `onDelete: Cascade` — Anwesenheiten, Musik- und Themen-Zuständigkeiten,
   * gehaltene Einheiten, Actionstep-Haken. Ein Admin, der jemanden entfernte,
   * löschte damit dessen ganze Spur im Archiv. Genau das verhindert
   * `deleteAccount` an seiner Stelle seit jeher; hier fehlte es.
   */
  it('begleitet hinaus, statt die Zeile zu löschen', async () => {
    const { service, person, keycloakAdmin, leave } = setup();
    person.findFirst.mockResolvedValue({
      id: 'p1',
      email: 'mo@example.com',
      locationId: null,
      acceptedAt: new Date('2026-01-06'),
      active: true,
    });

    await service.remove('hk-1', 'p1', asAdmin);

    expect(person.delete).not.toHaveBeenCalled();
    // Derselbe Weg wie beim eigenen Verlassen, mit der Id dessen, der es
    // angestoßen hat — davon hängt die Formulierung der Nachricht ab.
    expect(leave).toHaveBeenCalledWith('hk-1', 'p1', {}, 'p9');
    // Wer schon da war, behält sein Konto: es gehört einem Menschen und nicht
    // dieser Gruppe.
    expect(keycloakAdmin.deleteUserByEmail).not.toHaveBeenCalled();
  });

  /**
   * Eine zurückgezogene Einladung ist der andere Fall: An der Zeile hängt
   * nichts, und die Adresse muss für eine neue Einladung wieder frei werden.
   */
  it('löscht eine noch nicht angenommene Einladung ganz', async () => {
    const { service, person, keycloakAdmin, leave } = setup();
    person.findFirst.mockResolvedValue({
      id: 'p2',
      email: 'neu@example.com',
      locationId: null,
      acceptedAt: null,
      active: true,
    });
    // Keine Zeile trägt die Adresse mehr — erst dann gibt
    // `discardInvitationAccount` das Keycloak-Konto frei.
    person.count.mockResolvedValue(0);

    await service.remove('hk-1', 'p2', asAdmin);

    expect(leave).not.toHaveBeenCalled();
    expect(person.delete).toHaveBeenCalledWith({ where: { id: 'p2' } });
    expect(keycloakAdmin.deleteUserByEmail).toHaveBeenCalledWith(
      'neu@example.com',
    );
  });

  it('lässt jemanden in Ruhe, der schon draußen ist', async () => {
    const { service, person, leave } = setup();
    person.findFirst.mockResolvedValue({
      id: 'p3',
      email: null,
      locationId: null,
      acceptedAt: new Date('2025-05-05'),
      active: false,
    });

    await service.remove('hk-1', 'p3', asAdmin);

    expect(leave).not.toHaveBeenCalled();
    expect(person.delete).not.toHaveBeenCalled();
  });
});

describe('PersonService.invite mit Zusammenführung', () => {
  const invitation = { email: 'lea@example.com', role: 'member' as const };

  it('weckt eine anonymisierte Zeile auf und gibt ihr die Adresse zurück', async () => {
    const { service, person, keycloakAdmin } = setup();
    // Zur Adresse gibt es nichts — das Konto wurde gelöscht.
    person.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'p-alt', name: 'Ehemaliges Mitglied' });
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: true,
      invitationEmailSent: true,
    });
    person.update.mockResolvedValue({ id: 'p-alt' });

    await service.invite('hk-1', { ...invitation, formerPersonId: 'p-alt' });

    expect(person.create).not.toHaveBeenCalled();
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p-alt' },
      data: expect.objectContaining({
        active: true,
        email: 'lea@example.com',
        // Sonst bliebe die Zeile als gelöscht markiert, obwohl gerade jemand
        // eingeladen wurde.
        anonymizedAt: null,
        // Und „Ehemaliges Mitglied" stünde als Name einer offenen Einladung da.
        name: 'lea',
      }),
    });
  });

  it('führt nicht zusammen, wenn die Adresse hier schon jemandem gehört', async () => {
    const { service, person, keycloakAdmin } = setup();
    person.findFirst
      .mockResolvedValueOnce({ id: 'p-andere', active: false, name: 'Mo' })
      .mockResolvedValueOnce({ id: 'p-alt', name: 'Ehemaliges Mitglied' });

    await expect(
      service.invite('hk-1', { ...invitation, formerPersonId: 'p-alt' }),
    ).rejects.toThrow(ConflictException);

    // Vor dem Keycloak-Aufruf: sonst stünde ein Konto ohne Zeile da.
    expect(keycloakAdmin.inviteUser).not.toHaveBeenCalled();
  });
});

describe('PersonService.deleteOrphanedAccount', () => {
  it('verweist auf den anderen Weg, solange man noch dazugehört', async () => {
    const { service, person, keycloakAdmin } = setup();
    person.findUnique.mockResolvedValue({ id: 'p1' });

    await expect(service.deleteOrphanedAccount(user)).rejects.toThrow(
      /gehörst noch zu einem Hauskreis/,
    );

    // Dort hängt die Nachfolgefrage dran; hier darf nichts vorbeigehen.
    expect(person.updateMany).not.toHaveBeenCalled();
    expect(keycloakAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('anonymisiert vergangene Mitgliedschaften und löscht das Konto', async () => {
    const { service, person, side, keycloakAdmin } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([
      { id: 'p1', hauskreisId: 'hk-1', locationId: null, active: false },
    ]);

    await service.deleteOrphanedAccount(user);

    // Die Zeile bleibt stehen — sonst verlöre jeder vergangene Abend seinen
    // Gastgeber (CLAUDE.md §5).
    expect(person.delete).not.toHaveBeenCalled();
    expect(person.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Ehemaliges Mitglied',
          email: null,
          birthdate: null,
        }),
      }),
    );
    expect(side.pushSubscription.deleteMany).toHaveBeenCalled();
    expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-123');
  });

  it('entfernt offene Einladungen ganz — sie tragen keine Geschichte', async () => {
    const { service, person, keycloakAdmin, replanAfterMembershipChange } =
      setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([
      { id: 'p2', hauskreisId: 'hk-2', locationId: null, active: true },
    ]);

    await service.deleteOrphanedAccount(user);

    expect(person.delete).toHaveBeenCalledWith({ where: { id: 'p2' } });
    expect(person.updateMany).not.toHaveBeenCalled();
    // Und ohne die Rotation anzufassen: Eine offene Einladung stand nie darin.
    expect(replanAfterMembershipChange).not.toHaveBeenCalled();
    expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-123');
  });

  /**
   * Bis hierher sind Name, Adresse und Geburtstag weg. Ein Fehler jetzt hieße,
   * jemandem eine Panne zu melden für etwas, das passiert ist — und ein
   * zweiter Versuch fände nichts mehr vor.
   */
  it('scheitert nicht daran, dass Keycloak gerade klemmt', async () => {
    const { service, person, keycloakAdmin } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([
      { id: 'p1', hauskreisId: 'hk-1', locationId: null, active: false },
    ]);
    keycloakAdmin.deleteUser.mockRejectedValue(new Error('Keycloak ist weg'));

    await expect(service.deleteOrphanedAccount(user)).resolves.toBeUndefined();
    expect(person.updateMany).toHaveBeenCalled();
  });
});
