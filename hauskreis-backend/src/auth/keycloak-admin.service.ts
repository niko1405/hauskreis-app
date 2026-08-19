import {
  ConflictException,
  HttpException,
  HttpStatus,
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
  /**
   * Ob für diese Einladung ein Konto entstanden ist. `false` heißt: es gab
   * schon eines — dann darf ein Rückzieher es auch nicht löschen.
   */
  created: boolean;
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

  /**
   * Legt das Konto an — oder benutzt das, das schon da ist.
   *
   * Vorher warf diese Stelle einen `409`, sobald es ein Konto mit dieser
   * Adresse gab. Damit war jede Einladung an jemanden, der die App bereits
   * benutzt, eine Sackgasse: genau der Fall „wechsel doch in unseren
   * Hauskreis". Ein bestehendes Konto wird deshalb wiederverwendet.
   *
   * **Es bekommt trotzdem eine Mail.** Hier stand einmal, das sei unnötig,
   * „Passwort und Adresse stehen schon" — nur erfuhr die eingeladene Person
   * damit gar nichts. Sie wartete auf eine Einladung, die nie kam, während in
   * der Verwaltung „eingeladen" stand. Was ihr fehlt, ist nicht ein Passwort,
   * sondern der Hinweis und ein Weg hinein; den Rest erledigt das Anmelden,
   * weil `resolveForUser` die offene Zeile über die Adresse findet.
   *
   * Eine Rolle wird hier nicht mehr vergeben. „Admin" gilt pro Hauskreis und
   * steht an der `Person`, nicht am Konto.
   */
  async inviteUser(params: { email: string }): Promise<InviteResult> {
    const existing = await this.findUserByEmail(params.email);
    if (existing) {
      return {
        created: false,
        invitationEmailSent: await this.sendInvitationEmail(existing.id),
      };
    }

    // Ein Konto braucht beim Anlegen einen Nutzernamen, und der einzige, den
    // wir hier kennen, ist die Adresse. Bleiben muss er nicht: die Einladung
    // schickt `UPDATE_PROFILE` mit, und dort trägt sich jede:r selbst ein.
    //
    // Vor- und Nachname werden nicht mehr geraten. Sie wurden aus dem
    // eingetippten Namen zerlegt („Anna Maria" → Vorname „Anna", Nachname
    // „Maria"), gebraucht wurden sie nie, und falsch waren sie oft.
    await this.request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: params.email,
        email: params.email,
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
      const invitationEmailSent = await this.sendInvitationEmail(created.id);

      return { created: true, invitationEmailSent };
    } catch (error) {
      await this.deleteUser(created.id).catch(() =>
        this.logger.error(
          `Failed to roll back Keycloak user ${created.id} after a failed invite`,
        ),
      );
      throw error;
    }
  }

  /**
   * Schickt die Einrichtungsmail noch einmal — an ein Konto, das schon steht.
   *
   * Genau derselbe Weg wie beim Einladen, und deshalb auch dieselbe Frage, was
   * überhaupt zu erledigen ist (`setupActions`). Hier stand einmal, ein zweites
   * Mal nach dem Passwort zu fragen sei „harmlos gegenüber der Alternative, gar
   * nicht hereinzukommen". Das war eine falsche Alternative: Wer sein Passwort
   * hat, kommt herein — er weiß nur nicht, dass er eingeladen ist.
   */
  async resendInvitation(email: string): Promise<boolean> {
    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new InternalServerErrorException(
        `Zu ${email} gibt es kein Keycloak-Konto mehr`,
      );
    }

    return this.sendInvitationEmail(user.id);
  }

  /** Räumt ein Konto weg, von dem nur die Adresse bekannt ist. */
  async deleteUserByEmail(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (user) await this.deleteUser(user.id);
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

  /**
   * Schreibt einen geänderten Nutzernamen nach Keycloak zurück.
   *
   * Sonst hießen dieselben Menschen an zwei Stellen verschieden: wer sich in
   * der App umbenennt, könnte sich mit dem neuen Namen nicht anmelden. Damit
   * wäre das Feld eine Anzeige und keine Einstellung.
   *
   * Keycloaks `409` wird hier zu derselben Meldung, die auch die lokale
   * `@unique`-Verletzung erzeugt — für die Person ist es dasselbe Ereignis, und
   * zwei Formulierungen für einen Sachverhalt sind eine zu viel.
   *
   * Setzt `editUsernameAllowed` am Realm voraus (siehe
   * `scripts/setup-keycloak.sh`); ohne das lehnt Keycloak den Schreibvorgang ab.
   */
  async changeUsername(
    keycloakUserId: string,
    username: string,
  ): Promise<void> {
    try {
      await this.request(`/users/${keycloakUserId}`, {
        method: 'PUT',
        body: JSON.stringify({ username }),
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.CONFLICT
      ) {
        throw new ConflictException('Dieser Nutzername ist schon vergeben');
      }

      throw error;
    }
  }

  /**
   * Schickt die Bestätigungsmail noch einmal — für jemanden, der schon da ist.
   *
   * Der einzige Weg heraus, wenn die erste Mail nicht ankam: ohne Bestätigung
   * lehnt der Guard alles ab, und ohne Mail gibt es nichts zu bestätigen.
   */
  async resendVerification(keycloakUserId: string): Promise<boolean> {
    return this.sendVerificationEmail(keycloakUserId);
  }

  /**
   * Die Bestätigungsmail — über den eigenen Weg, nicht über `execute-actions`.
   *
   * Vorher stand hier `execute-actions-email` mit `['VERIFY_EMAIL']`. Das
   * funktionierte, verschickte aber den falschen Text: Keycloak wählt die
   * Vorlage nach dem **Endpunkt**, nicht nach der Liste der Aktionen, und für
   * `execute-actions-email` ist das immer `executeActions` — bei uns die
   * Einladung („Du bist im Hauskreis dabei"). Wer seine Adresse änderte, wurde
   * also in einen Hauskreis eingeladen, in dem er längst war.
   *
   * `send-verify-email` rendert `emailVerification`, und dieser Text steht seit
   * jeher richtig im Theme (`email/messages/messages_de.properties`). Die
   * Query-Parameter sind dieselben, deshalb bleibt `actionsEmailQuery` geteilt.
   */
  private async sendVerificationEmail(
    keycloakUserId: string,
  ): Promise<boolean> {
    try {
      await this.request(
        `/users/${keycloakUserId}/send-verify-email?${this.actionsEmailQuery()}`,
        { method: 'PUT' },
      );
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
    return `/users/${keycloakUserId}/execute-actions-email?${this.actionsEmailQuery()}`;
  }

  /** Dieselben Parameter für beide Mail-Endpunkte — siehe oben. */
  private actionsEmailQuery(): string {
    const params = new URLSearchParams({ lifespan: '604800' });
    const appUrl = this.config.get('APP_URL');

    if (appUrl) {
      params.set('client_id', this.config.get('KEYCLOAK_FRONTEND_CLIENT_ID'));
      params.set('redirect_uri', appUrl);
    }

    return params.toString();
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
  /**
   * Was beim Klick auf den Einladungslink zu erledigen ist.
   *
   * **Ein Passwort verlangt nur, wer keines hat.** Die Liste stand hier fest
   * auf allen dreien, und das traf jede:n, der schon ein Konto besaß: Wer
   * eingeladen wurde, weil er in einen anderen Hauskreis wechselt — oder wer
   * eine zweite Einladung bekam, weil die erste nicht ankam — musste sein
   * Passwort neu setzen, um irgendwo hinzukommen, wo er längst hineinkam. Das
   * ist nicht bloß lästig, es sieht aus wie ein Angriff.
   *
   * Gefragt wird **Keycloak**, nicht `person.acceptedAt`. Der naheliegende
   * Schluss „noch nie angemeldet, also kein Passwort" ist genau dort falsch,
   * wo es darauf ankommt: Bei der Einladung, die ihre Zeile nicht wiederfand,
   * stand `acceptedAt` auf `null`, obwohl das Konto vollständig eingerichtet
   * war. Die Zugangsdaten weiß nur der, der sie hält.
   *
   * `VERIFY_EMAIL` bleibt in jedem Fall drin: Bestätigt Keycloak die Adresse
   * schon, ist die Aktion beim Öffnen des Links sofort erledigt und niemand
   * sieht sie. Fehlt sie dagegen, kommt niemand herein — das Backend weist
   * jedes Token ohne `email_verified` ab.
   *
   * **`TERMS_AND_CONDITIONS` steht hier und nicht nur am Realm.** Die
   * Realm-Vorgabe (`defaultAction`) greift bei der Selbstregistrierung; ein
   * eingeladenes Konto entsteht dagegen über `POST /users`, und dort trägt
   * Keycloak keine Vorgaben nach. Ohne diese Zeile käme also ausgerechnet der
   * häufigste Weg in den Hauskreis an der Einwilligung vorbei. Wer sie schon
   * angenommen hat, sieht sie beim Öffnen des Links nicht — erledigte Aktionen
   * fallen weg wie `VERIFY_EMAIL`.
   */
  private async setupActions(keycloakUserId: string): Promise<string[]> {
    // Lässt sich das nicht klären, wird nach dem Passwort gefragt. Einmal zu
    // viel gefragt ist ärgerlich; gar nicht gefragt sperrt jemanden aus, der
    // noch keines hat.
    //
    // `Array.isArray` und nicht `?.length`: `request` gibt bei leerem Rumpf
    // `undefined` zurück, und ein `catch` allein fängt das nicht — es ist kein
    // abgelehntes Versprechen, sondern ein Wert, über den man stolpert.
    const credentials = await this.request<unknown[]>(
      `/users/${keycloakUserId}/credentials`,
    ).catch((error: unknown) => {
      this.logger.warn(
        `Zugangsdaten von ${keycloakUserId} nicht lesbar (${
          error instanceof Error ? error.message : String(error)
        }) — die Einladung fragt sicherheitshalber nach einem Passwort`,
      );
      return undefined;
    });

    const hasPassword = Array.isArray(credentials) && credentials.length > 0;

    return hasPassword
      ? ['UPDATE_PROFILE', 'VERIFY_EMAIL', 'TERMS_AND_CONDITIONS']
      : [
          'UPDATE_PROFILE',
          'UPDATE_PASSWORD',
          'VERIFY_EMAIL',
          'TERMS_AND_CONDITIONS',
        ];
  }

  private async sendInvitationEmail(keycloakUserId: string): Promise<boolean> {
    try {
      await this.request(this.actionsEmailPath(keycloakUserId), {
        method: 'PUT',
        body: JSON.stringify(await this.setupActions(keycloakUserId)),
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
      // Den Status **durchreichen** statt alles auf 500 abzubilden. Vorher sah
      // ein belegter Nutzername (409) genauso aus wie ein Serverfehler, und der
      // echte Grund eines Mailfehlers — etwa eine ungültige `redirect_uri`
      // (400) — verschwand in der SMTP-Warnung. Wer den Aufruf macht, kann so
      // unterscheiden, ob es an ihm lag.
      throw new HttpException(
        `Keycloak admin request failed (HTTP ${response.status}): ${detail}`,
        response.status,
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
