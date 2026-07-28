import { addMeetingSongSchema, createSongSchema } from './song.dto';

describe('createSongSchema', () => {
  it('needs only a title', () => {
    expect(createSongSchema.parse({ title: 'Amazing Grace' })).toEqual({
      title: 'Amazing Grace',
    });
  });

  it('rejects a lyrics link that is not a URL', () => {
    expect(
      createSongSchema.safeParse({ title: 'X', lyricsUrl: 'nope' }).success,
    ).toBe(false);
  });
});

describe('addMeetingSongSchema', () => {
  const uuid = '4a3f1c2e-7b5d-4e8a-9f10-2c3d4e5f6a7b';

  it('accepts a song the group already knows', () => {
    expect(addMeetingSongSchema.safeParse({ songId: uuid }).success).toBe(true);
  });

  it('accepts a brand new song', () => {
    expect(
      addMeetingSongSchema.safeParse({
        title: 'Neues Lied',
        artist: 'Wer auch immer',
      }).success,
    ).toBe(true);
  });

  it('rejects both at once', () => {
    // Ambiguous: which one wins, and what happens to the title?
    expect(
      addMeetingSongSchema.safeParse({ songId: uuid, title: 'Neues Lied' })
        .success,
    ).toBe(false);
  });

  it('rejects neither', () => {
    expect(addMeetingSongSchema.safeParse({}).success).toBe(false);
  });
});
