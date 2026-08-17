'use client';

/**
 * Das Konto: Anmeldename und E-Mail hier, Passwort dort.
 *
 * **Der Anmeldename stand einmal unter „Deine Angaben"**, zwischen Anzeigename
 * und Geburtstag — also zwischen zwei Dingen, die nur innerhalb der App etwas
 * bedeuten. Er ist aber das Gegenstück zur Adresse: mit beiden meldet man sich
 * an, beide leben bei Keycloak, und beide ändert man aus demselben Anlass.
 * Deshalb stehen sie jetzt untereinander, jeder mit seinem eigenen Knopf.
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
import { AtSign, KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import { useChangeEmail, useUpdatePerson } from '@/lib/api/hooks';
import { accountActionArgs } from '@/lib/auth/oidc-config';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import type { Person } from '@/lib/api/types';
import { LeaveSheet, useDissolvesOnLeave } from './hauskreis-card';

export function AccountCard({
  /**
   * Die ganze Person und nicht drei einzelne Angaben: die Karte fragt inzwischen
   * Adresse, Anmeldename und Id ab, und eine Prop-Liste, die mit jedem Feld
   * wächst, ist der Anfang vom Ende.
   *
   * `email` darf darin `null` sein — das hieße „anonymisiert" und kann hier
   * nicht vorkommen: wer sein Konto gelöscht hat, kommt nicht mehr an diesen
   * Bildschirm. Der Typ trägt die Möglichkeit trotzdem, weil das Feld sie trägt.
   */
  person,
}: {
  person: Person;
}) {
  const dissolves = useDissolvesOnLeave();
  const [value, setValue] = useState(person.email ?? '');
  const [username, setUsername] = useState(person.username ?? '');
  const [deleting, setDeleting] = useState(false);
  const change = useChangeEmail();
  const update = useUpdatePerson(person.id);
  const toast = useToast();
  const auth = useAuth();
  const { hauskreis, hauskreisId } = useHauskreis();

  const email = person.email;
  const trimmed = value.trim();
  const trimmedUsername = username.trim();

  return (
    <section>
      <SectionTitle>Konto</SectionTitle>
      <Card className="space-y-4">
        {/* Zuerst der Anmeldename, dann die Adresse: In dieser Reihenfolge
            stehen sie auch auf der Anmeldeseite, und man kann sich mit beidem
            anmelden. */}
        <Field
          label="Anmeldename"
          hint="Damit meldest du dich in der App an, du kannst auch die E-Mail Adresse verwenden."
        >
          <TextInput
            value={username}
            placeholder={
              person.username === null
                ? 'Wird bei der ersten Anmeldung gesetzt'
                : undefined
            }
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>

        <Button
          variant="secondary"
          className="w-full"
          // Leer heißt „unverändert": wer noch nie angemeldet war, hat keinen,
          // und ein leerer String wäre für den Server ein ungültiger Name.
          disabled={
            trimmedUsername === '' || trimmedUsername === person.username
          }
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { username: trimmedUsername },
              {
                onSuccess: () => toast.success('Anmeldename geändert.'),
                // Der Server sagt genau, was an einem Namen nicht geht („3–30
                // Zeichen: Buchstaben, Ziffern, Punkt, Strich oder
                // Unterstrich") — dieser Satz ist besser als jeder, den wir
                // hier zweitverwerten könnten.
                onError: (error) => toast.error(errorMessage(error)),
              },
            )
          }
        >
          <AtSign size={14} />
          Anmeldename ändern
        </Button>

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
                    : 'Geändert. (Keine Bestätigungsmail: Es ist ein Fehler aufgetreten.)',
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
              {dissolves === true && (
                <>
                  {' '}
                  <strong className="font-bold text-alert">
                    Du bist die letzte Person hier — der Hauskreis wird damit
                    aufgelöst.
                  </strong>
                </>
              )}
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
