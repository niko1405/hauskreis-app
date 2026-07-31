/**
 * Seeds the database from the CSV files in `prisma/seed-data/`.
 *
 * The data itself deliberately lives in CSV rather than in this file, so it can
 * be edited without touching code. This script only reads, validates and
 * upserts it.
 *
 * Guarded twice on purpose: it refuses to run unless SEED_ENABLED=true *and*
 * NODE_ENV is not production, so it can never wipe or bloat a real database.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client';

const SEED_DIR = join(__dirname, 'seed-data');

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.iso.date().nullable());

const csvBool = z
  .string()
  .trim()
  .transform((value) => (value === '' ? 'false' : value.toLowerCase()))
  .pipe(z.stringbool());

const hauskreisRow = z.object({
  name: z.string().trim().min(1),
});

const optionalInt = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .refine((value) => value === null || (Number.isInteger(value) && value > 0), {
    message: 'must be a positive whole number, or empty for "no limit"',
  });

/** A coordinate, or empty for "we have not looked it up". */
const optionalCoordinate = (limit: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .refine(
      (value) =>
        value === null || (Number.isFinite(value) && Math.abs(value) <= limit),
      { message: `must be a number between -${limit} and ${limit}, or empty` },
    );

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value));

const locationRow = z
  .object({
    hauskreisName: z.string().trim().min(1),
    name: z.string().trim().min(1),
    hostWeight: z.coerce.number().min(0),
    /// Empty means "everyone fits" — only the tight homes need a number.
    capacity: optionalInt,
    requiresHost: csvBool,
    active: csvBool,
    /// Both or neither, same rule the API enforces — see the refine below.
    latitude: optionalCoordinate(90),
    longitude: optionalCoordinate(180),
    address: optionalText,
  })
  // Ohne das ließe sich per CSV einsäen, was ein PATCH auf denselben Ort mit
  // 400 ablehnen würde: eine Breite ohne Länge zeigt auf nichts.
  .refine((row) => (row.latitude === null) === (row.longitude === null), {
    message:
      'latitude and longitude must be filled in together, or both left empty',
    path: ['longitude'],
  });

const personRow = z.object({
  hauskreisName: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.email(),
  birthdate: optionalDate,
  playsInstrument: csvBool,
  canHost: csvBool,
  /// Empty for anyone who brings no home into the hosting rotation.
  locationName: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value)),
  active: csvBool,
});

function readCsv<T extends z.ZodType>(
  file: string,
  rowSchema: T,
): z.infer<T>[] {
  const raw = readFileSync(join(SEED_DIR, file), 'utf8');
  const records: unknown[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((record, index) => {
    const result = rowSchema.safeParse(record);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      // +2 because row 1 is the header and humans count from 1.
      throw new Error(`${file} row ${index + 2} is invalid — ${issues}`);
    }
    return result.data as z.infer<T>;
  });
}

function assertSeedingAllowed(): void {
  const seedEnabled = process.env.SEED_ENABLED?.toLowerCase() === 'true';
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  if (!seedEnabled) {
    throw new Error(
      'Seeding is disabled. Set SEED_ENABLED=true in your .env to allow it.',
    );
  }

  if (nodeEnv === 'production') {
    throw new Error('Refusing to seed while NODE_ENV=production.');
  }
}

async function main(): Promise<void> {
  assertSeedingAllowed();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const hauskreise = readCsv('hauskreis.csv', hauskreisRow);
    const locations = readCsv('location.csv', locationRow);
    const people = readCsv('person.csv', personRow);

    const idByName = new Map<string, string>();

    for (const row of hauskreise) {
      const existing = await prisma.hauskreis.findFirst({
        where: { name: row.name },
      });
      const record =
        existing ??
        (await prisma.hauskreis.create({ data: { name: row.name } }));
      idByName.set(record.name, record.id);
    }

    const resolveHauskreis = (file: string, name: string): string => {
      const id = idByName.get(name);
      if (!id) {
        throw new Error(
          `${file} references unknown hauskreis "${name}" — add it to hauskreis.csv first.`,
        );
      }
      return id;
    };

    // Locations first: people reference them by name.
    const locationIdByName = new Map<string, string>();

    for (const row of locations) {
      const hauskreisId = resolveHauskreis('location.csv', row.hauskreisName);

      const record = await prisma.location.upsert({
        where: { hauskreisId_name: { hauskreisId, name: row.name } },
        update: {
          hostWeight: row.hostWeight,
          capacity: row.capacity,
          requiresHost: row.requiresHost,
          active: row.active,
          latitude: row.latitude,
          longitude: row.longitude,
          address: row.address,
        },
        create: {
          hauskreisId,
          name: row.name,
          hostWeight: row.hostWeight,
          capacity: row.capacity,
          requiresHost: row.requiresHost,
          active: row.active,
          latitude: row.latitude,
          longitude: row.longitude,
          address: row.address,
        },
      });

      locationIdByName.set(`${hauskreisId}::${record.name}`, record.id);
    }

    for (const row of people) {
      const hauskreisId = resolveHauskreis('person.csv', row.hauskreisName);

      let locationId: string | null = null;
      if (row.locationName) {
        locationId =
          locationIdByName.get(`${hauskreisId}::${row.locationName}`) ?? null;

        if (!locationId) {
          throw new Error(
            `person.csv references unknown location "${row.locationName}" — add it to location.csv first.`,
          );
        }
      }

      await prisma.person.upsert({
        where: { hauskreisId_email: { hauskreisId, email: row.email } },
        update: {
          name: row.name,
          birthdate: row.birthdate ? new Date(row.birthdate) : null,
          playsInstrument: row.playsInstrument,
          canHost: row.canHost,
          locationId,
          active: row.active,
        },
        create: {
          hauskreisId,
          name: row.name,
          email: row.email,
          birthdate: row.birthdate ? new Date(row.birthdate) : null,
          playsInstrument: row.playsInstrument,
          canHost: row.canHost,
          locationId,
          active: row.active,
        },
      });
    }

    console.log(
      `Seeded ${hauskreise.length} hauskreis(e), ${locations.length} location(s) and ${people.length} people from ${SEED_DIR}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
