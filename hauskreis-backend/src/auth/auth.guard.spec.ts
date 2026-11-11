/**
 * Die zwei Türen, die uns gehören: eine bestätigte Adresse und die
 * Einwilligung.
 *
 * Mit echten, signierten Tokens und einem JWKS-Endpunkt auf einem lokalen
 * Port — der Guard holt seine Schlüssel selbst, und genau dieser Weg soll mit
 * geprüft sein, nicht eine Attrappe davor.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { AuthGuard, TERMS_NOT_ACCEPTED } from './auth.guard';
import type { AppConfigService } from '../config/config.service';

const REALM = 'hauskreis';

let server: Server;
let baseUrl: string;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };

  server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function guardWith(requireTerms: boolean): AuthGuard {
  const values: Record<string, unknown> = {
    KEYCLOAK_REALM: REALM,
    KEYCLOAK_URL: baseUrl,
    KEYCLOAK_INTERNAL_URL: undefined,
    KEYCLOAK_AUDIENCE: 'hauskreis-backend',
    KEYCLOAK_ALLOWED_AZP: ['hauskreis-app'],
    KEYCLOAK_REQUIRE_TERMS: requireTerms,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as AppConfigService;
  // Keine Ausnahmen an der Route: weder öffentlich noch für unbestätigte
  // Adressen geöffnet.
  const reflector = {
    getAllAndOverride: () => undefined,
  } as unknown as Reflector;

  return new AuthGuard(config, reflector);
}

async function tokenWith(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT({
    azp: 'hauskreis-app',
    email: 'anna@example.com',
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`${baseUrl}/realms/${REALM}`)
    .setAudience('hauskreis-backend')
    .setSubject('kc-anna')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

function contextFor(token: string): {
  context: ExecutionContext;
  request: Request;
} {
  const request = {
    headers: { authorization: `Bearer ${token}` },
  } as unknown as Request;

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthGuard und die Einwilligung', () => {
  it('lässt herein, wer zugestimmt hat', async () => {
    const { context, request } = contextFor(
      await tokenWith({ terms_accepted: '1792190145' }),
    );

    await expect(guardWith(true).canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({
        keycloakUserId: 'kc-anna',
        termsAccepted: true,
      }),
    );
  });

  /**
   * 403 und nicht 401: Ein neues Token änderte nichts, denn ein Refresh führt
   * keine Required Actions aus. Erst eine echte Anmeldung zeigt den Haken.
   */
  it('weist ab, wer noch nicht zugestimmt hat', async () => {
    const { context } = contextFor(await tokenWith({}));

    const error = await guardWith(true)
      .canActivate(context)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual(
      expect.objectContaining({ code: TERMS_NOT_ACCEPTED }),
    );
  });

  /**
   * Der Claim entsteht erst mit dem Mapper aus `setup-keycloak.sh`. Ein Server,
   * der vor dem Skript ausgerollt wird, soll niemanden aussperren.
   */
  it('prüft nicht, solange der Schalter aus ist', async () => {
    const { context } = contextFor(await tokenWith({}));

    await expect(guardWith(false).canActivate(context)).resolves.toBe(true);
  });

  it('fragt die Adresse vor der Einwilligung', async () => {
    const { context } = contextFor(await tokenWith({ email_verified: false }));

    const error = await guardWith(true)
      .canActivate(context)
      .catch((caught: unknown) => caught);

    expect((error as ForbiddenException).getResponse()).toEqual(
      expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }),
    );
  });
});
