import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { internalKeycloakUrl } from './keycloak-url';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface InviteResult {
  keycloakUserId: string;
  /** False when Keycloak has no SMTP configured (common in local dev). */
  invitationEmailSent: boolean;
}

/**
 * Thin wrapper around the Keycloak Admin REST API, authenticated with the
 * backend client's service account.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly baseUrl: string;
  private readonly realm: string;
  private cachedToken?: { value: string; expiresAt: number };

  constructor(private readonly config: AppConfigService) {
    // Server-zu-Server, also die interne Adresse — die öffentliche ist aus dem
    // Container heraus im Zweifel gar nicht auflösbar.
    this.baseUrl = internalKeycloakUrl(this.config);
    this.realm = this.config.get('KEYCLOAK_REALM');
  }

  async inviteUser(params: {
    email: string;
    name: string;
    role: string;
  }): Promise<InviteResult> {
    const existing = await this.findUserByEmail(params.email);
    if (existing) {
      throw new ConflictException(
        `A Keycloak user with email ${params.email} already exists`,
      );
    }

    const [firstName, ...rest] = params.name.trim().split(/\s+/);
    // Ein Konto braucht beim Anlegen einen Nutzernamen, und der einzige, den
    // wir hier kennen, ist die Adresse. Bleiben muss er nicht: die Einladung
    // schickt `UPDATE_PROFILE` mit, und dort trägt sich jede:r selbst ein.
    await this.request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: params.email,
        email: params.email,
        firstName,
        lastName: rest.join(' ') || firstName,
        enabled: true,
        emailVerified: false,
      }),
    });

    const created = await this.findUserByEmail(params.email);
    if (!created) {
      throw new InternalServerErrorException(
        'Keycloak user was created but could not be read back',
      );
    }

    // Anything past this point must clean up the account it just created,
    // otherwise a partial failure leaves an orphan that blocks re-inviting.
    try {
      await this.assignRealmRole(created.id, params.role);
      const invitationEmailSent = await this.sendInvitationEmail(created.id);

      return { keycloakUserId: created.id, invitationEmailSent };
    } catch (error) {
      await this.deleteUser(created.id).catch(() =>
        this.logger.error(
          `Failed to roll back Keycloak user ${created.id} after a failed invite`,
        ),
      );
      throw error;
    }
  }

  async deleteUser(keycloakUserId: string): Promise<void> {
    await this.request(`/users/${keycloakUserId}`, { method: 'DELETE' });
  }

  /**
   * Ändert die Adresse eines Kontos — nur die Adresse.
   *
   * Der Nutzername bleibt bewusst stehen. Er gehört seit der Einladung den
   * Menschen selbst (`UPDATE_PROFILE`), und ihn beim Adresswechsel
   * mitzuschreiben hieße, eine selbst getroffene Wahl still zu überschreiben.
   *
   * `emailVerified` fällt zurück auf `false`, und die Bestätigungsmail geht
   * neu raus: dass jemand die alte Adresse nachgewiesen hat, sagt nichts über
   * die neue.
   */
  async changeEmail(keycloakUserId: string, email: string): Promise<boolean> {
    const inUse = await this.findUserByEmail(email);

    if (inUse && inUse.id !== keycloakUserId) {
      throw new ConflictException(
        `Ein Konto mit der Adresse ${email} gibt es schon`,
      );
    }

    // Ein PUT mit Teilmenge: was hier nicht steht, lässt Keycloak in Ruhe.
    await this.request(`/users/${keycloakUserId}`, {
      method: 'PUT',
      body: JSON.stringify({ email, emailVerified: false }),
    });

    return this.sendVerificationEmail(keycloakUserId);
  }

  /** Wie die Einladungsmail, aber ohne Passwort-Schritt. */
  private async sendVerificationEmail(
    keycloakUserId: string,
  ): Promise<boolean> {
    try {
      await this.request(this.actionsEmailPath(keycloakUserId), {
        method: 'PUT',
        body: JSON.stringify(['VERIFY_EMAIL']),
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not send Keycloak verification email (is SMTP configured?): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Der Aufruf, aus dem eine Aktions-Mail entsteht — samt Rückweg.
   *
   * `client_id` und `redirect_uri` sind der Unterschied zwischen „am Ende
   * steht man auf einer Keycloak-Seite" und „am Ende ist man in der App".
   * Keycloak prüft die Adresse gegen die Redirect-URIs des Clients; steht dort
   * etwas anderes, verweigert es den Link. Ohne `APP_URL` bleiben beide weg
   * und der alte Ablauf gilt weiter.
   *
   * Eine Woche Gültigkeit, weil eine Einladung auch mal einen Urlaub
   * überdauern muss.
   */
  private actionsEmailPath(keycloakUserId: string): string {
    const params = new URLSearchParams({ lifespan: '604800' });
    const appUrl = this.config.get('APP_URL');

    if (appUrl) {
      params.set('client_id', this.config.get('KEYCLOAK_FRONTEND_CLIENT_ID'));
      params.set('redirect_uri', appUrl);
    }

    return `/users/${keycloakUserId}/execute-actions-email?${params.toString()}`;
  }

  private async findUserByEmail(
    email: string,
  ): Promise<{ id: string } | undefined> {
    const users = await this.request<{ id: string }[]>(
      `/users?email=${encodeURIComponent(email)}&exact=true`,
    );
    return users[0];
  }

  private async assignRealmRole(
    keycloakUserId: string,
    role: string,
  ): Promise<void> {
    const roleRepresentation = await this.request<{ id: string; name: string }>(
      `/roles/${encodeURIComponent(role)}`,
    );

    await this.request(`/users/${keycloakUserId}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([
        { id: roleRepresentation.id, name: roleRepresentation.name },
      ]),
    });
  }

  /**
   * Asks Keycloak to email the invitee a link to set their password. Requires
   * SMTP to be configured on the realm, so a failure here is logged rather
   * than fatal — the account still exists and an admin can resend later.
   *
   * Die Reihenfolge ist die, in der Keycloak die Schritte zeigt:
   * erst der Nutzername (`UPDATE_PROFILE`), dann das Passwort, dann die
   * Bestätigung der Adresse. `UPDATE_PROFILE` wirkt nur, wenn am Realm
   * `editUsernameAllowed` steht — sonst ist das Feld gesperrt und der Schritt
   * zeigt nur Vor- und Nachnamen (siehe scripts/setup-keycloak.sh).
   */
  private async sendInvitationEmail(keycloakUserId: string): Promise<boolean> {
    try {
      await this.request(this.actionsEmailPath(keycloakUserId), {
        method: 'PUT',
        body: JSON.stringify([
          'UPDATE_PROFILE',
          'UPDATE_PASSWORD',
          'VERIFY_EMAIL',
        ]),
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not send Keycloak invitation email (is SMTP configured?): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    const response = await fetch(
      `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.get('KEYCLOAK_CLIENT_ID'),
          client_secret: this.config.get('KEYCLOAK_CLIENT_SECRET'),
        }),
      },
    );

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Could not obtain Keycloak service account token (HTTP ${response.status})`,
      );
    }

    const token = (await response.json()) as TokenResponse;
    this.cachedToken = {
      value: token.access_token,
      // Refresh slightly early so a request never races the expiry.
      expiresAt: Date.now() + (token.expires_in - 30) * 1000,
    };

    return token.access_token;
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(
      `${this.baseUrl}/admin/realms/${this.realm}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new InternalServerErrorException(
        `Keycloak admin request failed (HTTP ${response.status}): ${detail}`,
      );
    }

    if (
      response.status === 204 ||
      response.headers.get('content-length') === '0'
    ) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
