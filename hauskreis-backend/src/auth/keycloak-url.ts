import type { AppConfigService } from '../config/config.service';

/** Trailing slashes would turn every joined path into a `//`. */
export function trimSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Die Adresse, über die dieser Prozess Keycloak erreicht.
 *
 * Nicht dieselbe wie die im Issuer: der Issuer ist die öffentliche Adresse, die
 * im Token steht, diese hier ist der Weg dorthin. Lokal fallen beide zusammen,
 * im Container nicht — dort ist `localhost` der Container selbst.
 */
export function internalKeycloakUrl(config: AppConfigService): string {
  return trimSlashes(
    config.get('KEYCLOAK_INTERNAL_URL') ?? config.get('KEYCLOAK_URL'),
  );
}
