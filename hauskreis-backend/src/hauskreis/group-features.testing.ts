import {
  GroupFeaturesService,
  type GroupFeatures,
} from './group-features.service';

/**
 * Die Bausteine einer Gruppe für Tests — voreingestellt alle an.
 *
 * Dieselbe Bauart und derselbe Grund wie bei `withClock`: Die Attrappen reichen
 * dem Konstruktor nur das herein, was der jeweilige Fall benutzt, und ein
 * Schalter, der überall an ist, ist in fast jedem Test nur Ballast. Wer das
 * Abschalten prüfen will, reicht ihn herein.
 */
export function withFeatures<T>(
  service: T,
  overrides: Partial<GroupFeatures> = {},
): T {
  return Object.assign(service as object, {
    features: testFeatures(overrides),
  }) as T;
}

export function testFeatures(
  overrides: Partial<GroupFeatures> = {},
): GroupFeaturesService {
  const features: GroupFeatures = {
    prayerBuddies: true,
    weeklyActionstep: true,
    ...overrides,
  };

  return {
    of: () => Promise.resolve(features),
    prayerBuddies: () => Promise.resolve(features.prayerBuddies),
    weeklyActionstep: () => Promise.resolve(features.weeklyActionstep),
  } as unknown as GroupFeaturesService;
}
