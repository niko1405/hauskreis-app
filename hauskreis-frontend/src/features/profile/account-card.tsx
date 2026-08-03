'use client';

/**
 * Das Konto: E-Mail hier, Passwort dort.
 *
 * Die Adresse ändern wir selbst, weil sie zwei Dinge gleichzeitig ist — die
 * Anmeldung bei Keycloak *und* das Feld, an dem eine Einladung hängt. Beides
 * muss zusammen umziehen, sonst zeigt die Anmeldung auf die eine und die App
 * auf die andere.
 *
 * Das Passwort dagegen bleibt bei Keycloak. Es durch dieses Backend zu
 * schicken hieße, Passwortregeln, Wiederherstellung und Zweitfaktor
 * nachzubauen — für einen Bildschirm, den man zweimal im Jahr öffnet.
 *
 * Der Weg dorthin führt aber nicht mehr in die Keycloak-Account-Konsole,
 * sondern über `kc_action=UPDATE_PASSWORD`: dieselbe Seite, die man beim
 * Einstieg schon gesehen hat, im Theme der App, und danach wieder hier.
 */
import { KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import { useChangeEmail } from '@/lib/api/hooks';
import { accountActionArgs } from '@/lib/auth/oidc-config';

export function AccountCard({ email }: { email: string }) {
  const [value, setValue] = useState(email);
  const change = useChangeEmail();
  const toast = useToast();
  const auth = useAuth();

  const trimmed = value.trim();

  return (
    <section>
      <SectionTitle>Konto</SectionTitle>
      <Card className="space-y-4">
        <Field
          label="E-Mail"
          hint="Damit meldest du dich an. Nach einer Änderung schickt Keycloak eine Bestätigung an die neue Adresse — anmelden kannst du dich sofort."
        >
          <TextInput
            type="email"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>

        <Button
          variant="secondary"
          className="w-full"
          disabled={trimmed === '' || trimmed === email}
          loading={change.isPending}
          onClick={() =>
            change.mutate(trimmed, {
              onSuccess: (result) => {
                setValue(result.email);
                toast.success(
                  result.verificationEmailSent
                    ? 'Geändert — die Bestätigung ist unterwegs.'
                    : 'Geändert. (Keine Bestätigungsmail: dieser Keycloak kennt keinen Mailserver.)',
                );
              },
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <Mail size={14} />
          E-Mail ändern
        </Button>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() =>
            void auth.signinRedirect(
              accountActionArgs('UPDATE_PASSWORD', '/profil'),
            )
          }
        >
          <KeyRound size={14} />
          Passwort ändern
        </Button>
      </Card>
    </section>
  );
}
