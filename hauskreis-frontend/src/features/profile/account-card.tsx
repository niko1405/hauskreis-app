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
 *
 * Ganz unten steht das Löschen. Es teilt sich das Sheet mit „Hauskreis
 * verlassen", weil es dieselbe Nachfolgefrage stellt — und weil es der
 * Austritt *ist*, nur mit dem Konto obendrauf.
 */
import { KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useChangeEmail } from '@/lib/api/hooks';
import { accountActionArgs } from '@/lib/auth/oidc-config';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { LeaveSheet } from './hauskreis-card';

export function AccountCard({
  /**
   * `null` heißt „anonymisiert" und kann hier nicht vorkommen: wer sein Konto
   * gelöscht hat, kommt nicht mehr an diesen Bildschirm. Der Typ trägt die
   * Möglichkeit trotzdem, weil das Feld sie trägt.
   */
  email,
}: {
  email: string | null;
}) {
  const [value, setValue] = useState(email ?? '');
  const [deleting, setDeleting] = useState(false);
  const change = useChangeEmail();
  const toast = useToast();
  const auth = useAuth();
  const { hauskreis, hauskreisId } = useHauskreis();

  const trimmed = value.trim();

  return (
    <section>
      <SectionTitle>Konto</SectionTitle>
      <Card className="space-y-4">
        <Field
          label="E-Mail"
          hint="Nach einer Änderung bekommst du eine Email-Bestätigung an die neue Adresse — anmelden kannst du dich sofort."
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
                setValue(result.email ?? '');
                toast.success(
                  result.verificationEmailSent
                    ? 'Geändert — die Bestätigung ist unterwegs.'
                    : 'Geändert. (Keine Bestätigungsmail: dieser Keycloak kennt keinen Mailserver.)',
                );
              },
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

        {/* Ganz unten und in Grau: das ist nichts, was man aus Versehen
            trifft, und nichts, wozu die Seite einlädt. Der Satz darüber
            benennt beides — was verschwindet und was bleibt —, damit die
            Entscheidung im Sheet keine Überraschung mehr ist. */}
        {hauskreisId && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-[11px] leading-relaxed text-stone-400">
              Konto löschen entfernt Name, Adresse und Anmeldung. Die
              vergangenen Abende bleiben stehen — dort stehst du danach als
              „Ehemaliges Mitglied".
            </p>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="text-xs font-semibold text-alert underline-offset-2 hover:underline"
            >
              Konto löschen
            </button>
          </div>
        )}
      </Card>

      {deleting && hauskreisId && (
        <LeaveSheet
          hauskreisId={hauskreisId}
          name={hauskreis?.name ?? 'diesen Hauskreis'}
          mode="delete"
          onClose={() => setDeleting(false)}
        />
      )}
    </section>
  );
}
