import { SetMetadata } from '@nestjs/common';

/**
 * Lässt eine Route auch mit unbestätigter Adresse zu.
 *
 * `AuthGuard` weist sonst jedes Token ab, dessen Adresse Keycloak noch nicht
 * bestätigt hat — richtig so, denn Konten werden über die Adresse mit offenen
 * Einladungen verknüpft. Nur ergäbe das eine Sackgasse: Wer im Posteingang
 * nichts findet, hätte keinen Weg, sich die Mail noch einmal schicken zu
 * lassen, ohne zuvor genau das zu tun, wozu er die Mail braucht.
 *
 * Deshalb diese Ausnahme — und deshalb genau eine. Das Token ist echt geprüft
 * (Signatur, Issuer, Audience, `azp`); es fehlt allein die Bestätigung. Eine so
 * markierte Route darf davon ausgehen, dass sie jemanden vor sich hat, der
 * noch nicht hereindarf, und muss entsprechend wenig tun.
 */
export const ALLOW_UNVERIFIED_EMAIL_KEY = 'allowUnverifiedEmail';
export const AllowUnverifiedEmail = () =>
  SetMetadata(ALLOW_UNVERIFIED_EMAIL_KEY, true);
