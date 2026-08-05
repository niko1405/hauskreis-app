'use client';

/**
 * Personen verwalten: einladen (legt Person **und** Keycloak-Konto an und
 * verschickt die Mail), Einladungen zurückziehen, Leute entfernen.
 *
 * „Eingeladen" ist ein eigener Zustand, kein halb fertiger: `acceptedAt`
 * bleibt `null`, bis sich jemand zum ersten Mal anmeldet. Solange lässt sich
 * die Einladung samt Konto zurückziehen — danach nicht mehr, denn dann gehört
 * das Konto einem Menschen und nicht mehr dieser Gruppe.
 */
import {
  Clock,
  Mail,
  Send,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ConflictError, errorMessage } from '@/lib/api/errors';
import {
  useDeletePerson,
  useInvitePerson,
  usePeople,
  useResendInvitation,
  useSetPersonRole,
} from '@/lib/api/hooks';
import type { PersonListEntry } from '@/lib/api/types';

export function PeopleAdmin() {
  const people = usePeople();
  const remove = useDeletePerson();
  const resend = useResendInvitation();
  const toast = useToast();
  const confirm = useConfirm();
  const [inviting, setInviting] = useState(false);

  return (
    <section>
      <SectionTitle>Personen</SectionTitle>
      <Card className="space-y-4">
        {people.isLoading && <Skeleton className="h-24 w-full" />}

        <ul className="space-y-2">
          {(people.data ?? []).map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-md border border-line p-3"
            >
              <Avatar person={person} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-stone-800">
                  {person.name}
                </p>
                <p className="truncate text-[11px] text-stone-400">
                  {person.email}
                </p>
              </div>
              {person.acceptedAt === null && (
                <Badge variant="info">
                  <Clock size={11} />
                  eingeladen
                </Badge>
              )}
              {!person.active && <Badge>inaktiv</Badge>}
              {person.role === 'ADMIN' && (
                <Badge variant="info">
                  <Shield size={11} />
                  Admin
                </Badge>
              )}

              {person.acceptedAt === null && (
                <IconButton
                  label={`Einladung an ${person.email} erneut senden`}
                  onClick={() =>
                    resend.mutate(person.id, {
                      onSuccess: (result) =>
                        result.invitationEmailSent
                          ? toast.success(
                              `Einladung an ${person.email} unterwegs.`,
                            )
                          : toast.error(
                              'Die Mail ging wieder nicht raus — läuft der Mailserver?',
                            ),
                    })
                  }
                >
                  <Send size={15} />
                </IconButton>
              )}

              {person.active && <RoleToggle person={person} />}

              <IconButton
                label={
                  person.acceptedAt === null
                    ? `Einladung an ${person.name} zurückziehen`
                    : `${person.name} entfernen`
                }
                onClick={async () => {
                  const pending = person.acceptedAt === null;

                  const ok = await confirm(
                    pending
                      ? {
                          title: `Einladung an ${person.name} zurückziehen?`,
                          body: 'Das Konto wird mit gelöscht, die Adresse ist danach wieder frei.',
                          confirmLabel: 'Zurückziehen',
                          tone: 'danger',
                        }
                      : {
                          title: `${person.name} entfernen?`,
                          body: 'Vergangene Abende zeigen weiter, wer gehostet hat — die Person kommt aber aus allen kommenden Planungen heraus.',
                          confirmLabel: 'Entfernen',
                          tone: 'danger',
                        },
                  );
                  if (!ok) return;

                  remove.mutate(person.id, {
                    onSuccess: () =>
                      toast.success(
                        pending
                          ? `Einladung an ${person.name} zurückgezogen.`
                          : `${person.name} entfernt.`,
                      ),
                  });
                }}
              >
                {person.acceptedAt === null ? (
                  <X size={15} />
                ) : (
                  <Trash2 size={15} />
                )}
              </IconButton>
            </li>
          ))}
        </ul>

        {inviting ? (
          <InviteForm onDone={() => setInviting(false)} />
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setInviting(true)}
          >
            <UserPlus size={14} />
            Jemanden einladen
          </Button>
        )}
      </Card>
    </section>
  );
}

/**
 * Rechte geben und nehmen, eine Zeile weit.
 *
 * Die letzte Admin-Person kann sich die Rechte nicht selbst nehmen. Die Regel
 * steht im Server, nicht hier: sie hängt daran, wie viele Admins es *gerade*
 * gibt, und eine zweite Fassung im Frontend wäre eine zweite Wahrheit, die
 * gelegentlich falsch liegt. Der Knopf bleibt deshalb bedienbar und die
 * Ablehnung kommt als Meldung — mit demselben Satz, den auch das Verlassen
 * benutzt.
 */
function RoleToggle({ person }: { person: PersonListEntry }) {
  const setRole = useSetPersonRole();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = person.role === 'ADMIN';

  const submit = async () => {
    const ok = await confirm({
      title: isAdmin
        ? `${person.name} die Admin-Rechte nehmen?`
        : `${person.name} zum Admin machen?`,
      body: isAdmin
        ? 'Einladen, entfernen und die Wartungsläufe sind danach nicht mehr möglich.'
        : 'Damit darf die Person einladen, entfernen und die Wartungsläufe starten.',
      confirmLabel: isAdmin ? 'Rechte nehmen' : 'Zum Admin machen',
      tone: isAdmin ? 'danger' : 'neutral',
    });
    if (!ok) return;

    setRole.mutate(
      { personId: person.id, role: isAdmin ? 'MEMBER' : 'ADMIN' },
      {
        onSuccess: () =>
          toast.success(
            isAdmin
              ? `${person.name} ist wieder Mitglied.`
              : `${person.name} ist jetzt Admin.`,
          ),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <IconButton
      label={
        isAdmin
          ? `${person.name} die Admin-Rechte nehmen`
          : `${person.name} zum Admin machen`
      }
      onClick={() => void submit()}
    >
      {isAdmin ? <ShieldOff size={15} /> : <Shield size={15} />}
    </IconButton>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');

  const invite = useInvitePerson();
  const toast = useToast();

  const submit = () => {
    invite.mutate(
      // Nur Adresse und Rolle. Wie die Person heißt, entscheidet sie beim
      // Aktivieren ihres Kontos selbst; alles Weitere steht im Profil.
      { email: email.trim(), role },
      {
        onSuccess: (person) => {
          if (person.invitationEmailSent) {
            toast.success(`Einladung an ${person.email} verschickt.`);
          } else {
            // Kein grüner Haken für etwas, das nicht passiert ist. Das Konto
            // steht, die Person ist angelegt — nur die Mail ging nicht raus,
            // und ohne sie kommt niemand herein.
            toast.error(
              `${person.email} angelegt, aber die Einladungsmail ging nicht raus. Schick sie über den Knopf in der Zeile erneut.`,
            );
          }
          onDone();
        },
        onError: (error) =>
          toast.error(
            error instanceof ConflictError
              ? 'Diese E-Mail-Adresse gibt es in Keycloak schon.'
              : errorMessage(error),
          ),
      },
    );
  };

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <Field
        label="E-Mail"
        hint="Mehr braucht es nicht: Name und Nutzername wählt die Person beim Aktivieren ihres Kontos selbst."
      >
        <TextInput
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Rolle">
        <Select
          value={role}
          onChange={(event) =>
            setRole(event.target.value as 'member' | 'admin')
          }
        >
          <option value="member">Mitglied</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={onDone}>
          Abbrechen
        </Button>
        <Button
          size="sm"
          className="flex-1"
          loading={invite.isPending}
          disabled={email.trim() === ''}
          onClick={submit}
        >
          <Mail size={13} />
          Einladen
        </Button>
      </div>
    </div>
  );
}
