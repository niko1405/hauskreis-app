import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AppConfigService } from '../config/config.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_UNVERIFIED_EMAIL_KEY } from './allow-unverified-email.decorator';
import { internalKeycloakUrl, trimSlashes } from './keycloak-url';
import type { AuthenticatedUser } from './auth.types';

/**
 * Der Fall, auf den die App eigens reagiert — siehe `errorSchema`.
 *
 * Er steht hier und nicht im Frontend, weil beide Seiten dieselbe Zeichenkette
 * meinen müssen; die deutsche Meldung daneben darf sich ändern, dieser Wert
 * nicht.
 */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

interface KeycloakClaims extends JWTPayload {
  email?: string;
  /// Ob Keycloak die Adresse als bestätigt führt. Siehe `AuthenticatedUser`.
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  /// The "authorized party" — the client the token was issued to.
  azp?: string;
  realm_access?: { roles?: string[] };
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly allowedAzp: readonly string[];

  constructor(
    private readonly config: AppConfigService,
    private readonly reflector: Reflector,
  ) {
    const realm = this.config.get('KEYCLOAK_REALM');
    // Zwei Adressen, zwei Aufgaben. Der Issuer wird gegen den `iss` im Token
    // geprüft und muss deshalb die öffentliche Adresse sein. Die Schlüssel holt
    // dieser Prozess selbst — hinter Docker über den Compose-Namen, weil
    // `localhost` dort auf den eigenen Container zeigt. Ohne die Trennung hat
    // man die Wahl zwischen "Issuer passt nicht" und "JWKS nicht erreichbar",
    // und beides endet in 401 auf jedem einzelnen Request.
    this.issuer = `${trimSlashes(this.config.get('KEYCLOAK_URL'))}/realms/${realm}`;
    const internalBase = internalKeycloakUrl(this.config);
    this.audience = this.config.get('KEYCLOAK_AUDIENCE');
    this.allowedAzp = this.config.get('KEYCLOAK_ALLOWED_AZP');
    this.jwks = createRemoteJWKSet(
      new URL(`${internalBase}/realms/${realm}/protocol/openid-connect/certs`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims: KeycloakClaims;
    try {
      const { payload } = await jwtVerify<KeycloakClaims>(token, this.jwks, {
        issuer: this.issuer,
        // Without an audience check, *any* token from this realm opens the
        // API — including one a different application obtained for itself.
        audience: this.audience,
        // `jose` already limits itself to the algorithms in the JWKS, so this
        // is belt and braces; it costs nothing and states the intent.
        algorithms: ['RS256'],
      });
      claims = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!claims.sub) {
      throw new UnauthorizedException('Token is missing a subject claim');
    }

    // `aud` says who the token is *for*, `azp` who asked for it. Checking both
    // is what keeps a token minted for some other client out, even once that
    // client has been given this API's audience.
    if (
      this.allowedAzp.length > 0 &&
      (!claims.azp || !this.allowedAzp.includes(claims.azp))
    ) {
      throw new UnauthorizedException(
        'Token was issued for a client that may not use this API',
      );
    }

    // Die Tür, die uns gehört. Seit man sich selbst registrieren kann, ist eine
    // unbestätigte Adresse eine Behauptung — und `resolveForUser` verknüpft
    // Konten über genau diese Adresse mit offenen Einladungen. Der Realm
    // verlangt die Bestätigung ohnehin (`verifyEmail`); dass wir sie hier noch
    // einmal prüfen, macht die Regel unabhängig von einer Realm-Einstellung,
    // die jemand versehentlich zurückdreht.
    //
    // **403 und nicht 401**, und das ist der Kern: ein 401 heißt für jeden
    // Client „dein Token ist alt, hol ein neues". Genau das tat die App auch —
    // nur führt Keycloaks Refresh keine Required Actions aus, das neue Token
    // trug dieselbe unbestätigte Adresse, und aus Antwort und Erneuerung wurde
    // eine Schleife ohne Ende. 403 sagt, was gemeint ist: das Token ist in
    // Ordnung, dieser Mensch darf trotzdem nicht herein. Ein neues zu holen
    // ändert daran nichts.
    if (
      claims.email &&
      claims.email_verified !== true &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_EMAIL_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new ForbiddenException({
        message: 'Bitte bestätige zuerst deine E-Mail-Adresse',
        code: EMAIL_NOT_VERIFIED,
      });
    }

    const user: AuthenticatedUser = {
      keycloakUserId: claims.sub,
      email: claims.email,
      username: claims.preferred_username,
      name: claims.name ?? claims.preferred_username,
      emailVerified: claims.email_verified === true,
      roles: claims.realm_access?.roles ?? [],
    };

    request.user = user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
