import { paginationSchema, toPage } from './pagination';

describe('paginationSchema', () => {
  it('defaults to the first page', () => {
    expect(paginationSchema.parse({})).toEqual({ take: 20, skip: 0 });
  });

  it('coerces the query string numbers', () => {
    expect(paginationSchema.parse({ take: '50', skip: '100' })).toEqual({
      take: 50,
      skip: 100,
    });
  });

  it('caps the page size', () => {
    expect(paginationSchema.safeParse({ take: 1000 }).success).toBe(false);
    expect(paginationSchema.safeParse({ take: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ skip: -1 }).success).toBe(false);
  });
});

describe('toPage', () => {
  const items = Array.from({ length: 20 }, (_, index) => index);

  it('reports more to come on a full first page', () => {
    const page = toPage(items, 55, { take: 20, skip: 0 });

    expect(page).toMatchObject({ total: 55, take: 20, skip: 0, hasMore: true });
    expect(page.items).toHaveLength(20);
  });

  it('reports the end on the last page', () => {
    expect(
      toPage(items.slice(0, 15), 55, { take: 20, skip: 40 }),
    ).toMatchObject({ hasMore: false });
  });

  it('handles an exactly-full last page', () => {
    // 40 rows, second page of 20: full, but nothing follows.
    expect(toPage(items, 40, { take: 20, skip: 20 })).toMatchObject({
      hasMore: false,
    });
  });

  it('handles an empty result', () => {
    expect(toPage([], 0, { take: 20, skip: 0 })).toEqual({
      items: [],
      total: 0,
      take: 20,
      skip: 0,
      hasMore: false,
    });
  });

  it('handles skipping past the end', () => {
    expect(toPage([], 55, { take: 20, skip: 999 })).toMatchObject({
      hasMore: false,
    });
  });
});
