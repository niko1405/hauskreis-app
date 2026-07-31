import { createLocationSchema, updateLocationSchema } from './location.dto';

const base = { name: 'Bei Sofie' };

describe('createLocationSchema — Koordinaten', () => {
  it('accepts a location without a position', () => {
    expect(createLocationSchema.safeParse(base).success).toBe(true);
  });

  it('accepts both coordinates together', () => {
    const result = createLocationSchema.safeParse({
      ...base,
      latitude: 48.7758,
      longitude: 9.1829,
      address: 'Königstraße 1, Stuttgart',
    });

    expect(result.success).toBe(true);
  });

  // Eine Breite ohne Länge zeigt auf nichts — das Frontend könnte daraus keine
  // Karten-URL bauen und müsste den halben Zustand trotzdem behandeln.
  it.each([
    ['nur latitude', { latitude: 48.7758 }],
    ['nur longitude', { longitude: 9.1829 }],
  ])('rejects %s', (_label, coordinates) => {
    const result = createLocationSchema.safeParse({ ...base, ...coordinates });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('zusammen');
  });

  it.each([
    ['latitude über 90', { latitude: 91, longitude: 0 }],
    ['latitude unter -90', { latitude: -91, longitude: 0 }],
    ['longitude über 180', { latitude: 0, longitude: 181 }],
    ['longitude unter -180', { latitude: 0, longitude: -181 }],
  ])('rejects %s', (_label, coordinates) => {
    expect(
      createLocationSchema.safeParse({ ...base, ...coordinates }).success,
    ).toBe(false);
  });

  it('accepts the extremes themselves', () => {
    const result = createLocationSchema.safeParse({
      ...base,
      latitude: -90,
      longitude: 180,
    });

    expect(result.success).toBe(true);
  });
});

describe('updateLocationSchema — Koordinaten', () => {
  it('leaves the position alone when neither field is sent', () => {
    expect(updateLocationSchema.safeParse({ name: 'Neuer Name' }).success).toBe(
      true,
    );
  });

  // null ist die einzige Art, eine gespeicherte Position wieder loszuwerden.
  it('clears the position when both are null', () => {
    const result = updateLocationSchema.safeParse({
      latitude: null,
      longitude: null,
    });

    expect(result.success).toBe(true);
  });

  it('refuses to clear only one half', () => {
    const result = updateLocationSchema.safeParse({
      latitude: null,
      longitude: 9.1829,
    });

    expect(result.success).toBe(false);
  });
});
