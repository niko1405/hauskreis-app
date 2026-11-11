'use client';

/**
 * „Weiter mit Google" — und was sonst in Keycloak als Anbieter eingerichtet ist.
 *
 * Ein Knopf je Anbieter aus `NEXT_PUBLIC_OIDC_IDPS`; ohne Eintrag steht hier
 * nichts. Er führt über `kc_idp_hint` gleich zum Anbieter, an Keycloaks
 * Anmeldeseite vorbei — ob dabei ein Konto entsteht oder ein bestehendes
 * benutzt wird, entscheidet Keycloak. Deshalb heißt er „Weiter mit", nicht
 * „Anmelden" oder „Registrieren": Für den, der drückt, ist es dasselbe.
 *
 * Steht an zwei Stellen, auf dem Anmeldebildschirm und beim Beitreten über
 * einen Link, und deshalb hier und nicht in einer der beiden.
 */
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { IDENTITY_PROVIDERS, idpHintArgs } from '@/lib/auth/oidc-config';

const LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  google: { label: 'Weiter mit Google', icon: <GoogleMark /> },
};

export function IdpButtons({
  returnTo,
  className,
}: {
  /** Wohin es nach der Anmeldung geht — sonst auf die Startseite. */
  returnTo?: string;
  className?: string;
}) {
  const auth = useAuth();
  const providers = IDENTITY_PROVIDERS.filter((alias) => alias in LABELS);

  if (providers.length === 0) return null;

  return (
    <div className={className}>
      {providers.map((alias) => (
        <Button
          key={alias}
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => void auth.signinRedirect(idpHintArgs(alias, returnTo))}
        >
          {LABELS[alias]!.icon}
          {LABELS[alias]!.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Das „G" in Googles eigenen Farben, wie es die Branding-Richtlinien für
 * Anmeldeknöpfe verlangen — nicht eingefärbt, nicht als Umriss. Als SVG im
 * Bundle statt von Googles Servern: Ein Knopf auf dem ersten Bildschirm soll
 * nicht schon beim Anzeigen eine Anfrage nach draußen schicken.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-[18px]">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
