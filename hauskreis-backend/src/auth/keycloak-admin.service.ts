import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

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
    this.baseUrl = this.config.get('KEYCLOAK_URL').replace(/\/+$/, '');
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
   */
  private async sendInvitationEmail(keycloakUserId: string): Promise<boolean> {
    try {
      await this.request(
        `/users/${keycloakUserId}/execute-actions-email?lifespan=604800`,
        {
          method: 'PUT',
          body: JSON.stringify(['UPDATE_PASSWORD', 'VERIFY_EMAIL']),
        },
      );
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
