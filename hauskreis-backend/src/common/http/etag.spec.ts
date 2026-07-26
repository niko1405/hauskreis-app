import {
  formatEtag,
  parseEtagVersion,
  parseIfMatch,
  versionWhere,
} from './etag';

describe('formatEtag / parseEtagVersion', () => {
  it('round-trips a version', () => {
    expect(parseEtagVersion(formatEtag(7))).toBe(7);
  });

  it('emits a weak tag', () => {
    expect(formatEtag(0)).toBe('W/"0"');
  });

  it('accepts a strong tag too', () => {
    expect(parseEtagVersion('"12"')).toBe(12);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseEtagVersion('  W/"3" ')).toBe(3);
  });

  it.each(['', '*', 'W/"abc"', 'garbage', '"3', '3"', 'W/"-1"', 'W/"1.5"'])(
    'rejects %p',
    (tag) => {
      expect(parseEtagVersion(tag)).toBeUndefined();
    },
  );
});

describe('parseIfMatch', () => {
  it('returns undefined when the header is absent', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
  });

  it('treats a blank header as absent', () => {
    expect(parseIfMatch('   ')).toBeUndefined();
  });

  it('recognises the wildcard', () => {
    expect(parseIfMatch('*')).toEqual({ kind: 'any' });
  });

  it('parses a single tag', () => {
    expect(parseIfMatch('W/"4"')).toEqual({ kind: 'versions', versions: [4] });
  });

  it('parses a list', () => {
    expect(parseIfMatch('W/"4", "5" , W/"6"')).toEqual({
      kind: 'versions',
      versions: [4, 5, 6],
    });
  });

  it('yields no versions for an unparseable header, so it cannot match', () => {
    expect(parseIfMatch('"not-a-version"')).toEqual({
      kind: 'versions',
      versions: [],
    });
  });
});

describe('versionWhere', () => {
  it('adds no constraint without a precondition', () => {
    expect(versionWhere(undefined)).toEqual({});
  });

  it('adds no version constraint for the wildcard', () => {
    expect(versionWhere({ kind: 'any' })).toEqual({});
  });

  it('constrains to the given versions', () => {
    expect(versionWhere({ kind: 'versions', versions: [2, 3] })).toEqual({
      version: { in: [2, 3] },
    });
  });

  it('produces an unsatisfiable constraint when nothing parsed', () => {
    expect(versionWhere({ kind: 'versions', versions: [] })).toEqual({
      version: { in: [] },
    });
  });
});
