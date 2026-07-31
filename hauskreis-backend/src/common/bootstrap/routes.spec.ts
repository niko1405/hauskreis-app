import { groupRoutes, type RouteInfo } from './routes';

function routes(...paths: string[]): RouteInfo[] {
  return paths.map((path) => ({ method: 'GET', path }));
}

describe('groupRoutes', () => {
  // Fast alles hängt unter /api/hauskreise/:hauskreisId/… — nach dem ersten
  // Segment zu gruppieren ergäbe eine Gruppe mit sechzig Einträgen.
  it('groups by the segment behind the tenant parameter', () => {
    const groups = groupRoutes(
      routes(
        '/api/hauskreise/:hauskreisId/meetings',
        '/api/hauskreise/:hauskreisId/meetings/:id',
        '/api/hauskreise/:hauskreisId/meetings/:meetingId/songs',
        '/api/hauskreise/:hauskreisId/topics',
      ),
    );

    expect(groups).toEqual([
      { name: 'meetings', count: 3 },
      { name: 'topics', count: 1 },
    ]);
  });

  it('keeps the tenant collection itself under its own name', () => {
    const groups = groupRoutes(
      routes('/api/hauskreise', '/api/hauskreise/:hauskreisId'),
    );

    expect(groups).toEqual([{ name: 'hauskreise', count: 2 }]);
  });

  // /push/settings/:type gehört zu push, nicht zu einer Gruppe namens ":type".
  it('never names a group after a parameter segment', () => {
    const groups = groupRoutes(
      routes(
        '/api/push/settings/:type',
        '/api/push/subscriptions',
        '/api/push/test',
      ),
    );

    expect(groups).toEqual([{ name: 'push', count: 3 }]);
  });

  it('handles routes with no segment beyond the prefix', () => {
    expect(groupRoutes(routes('/api/health', '/api/me'))).toEqual([
      { name: 'health', count: 1 },
      { name: 'me', count: 1 },
    ]);
  });

  it('sorts by size, then alphabetically', () => {
    const groups = groupRoutes(
      routes('/api/b', '/api/c', '/api/c', '/api/a', '/api/a'),
    );

    expect(groups.map((group) => group.name)).toEqual(['a', 'c', 'b']);
  });
});
