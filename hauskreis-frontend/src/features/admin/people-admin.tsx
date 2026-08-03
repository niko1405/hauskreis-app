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
import { Clock, Mail, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ConflictError, errorMessage } from '@/lib/api/errors';
import { useDeletePerson, useInvitePerson, usePeople } from '@/lib/api/hooks';

export function PeopleAdmin() {
  const people = usePeople();
  const remove = useDeletePerson();
  const toast = useToast();
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
              <IconButton
                label={
                  person.acceptedAt === null
                    ? `Einladung an ${person.name} zurückziehen`
                    : `${person.name} entfernen`
                }
                onClick={() => {
                  const pending = person.acceptedAt === null;
                  const question = pending
                    ? `Einladung an ${person.name} zurückziehen? Das Konto wird mit gelöscht, die Adresse ist danach wieder frei.`
                    : `${person.name} wirklich entfernen?`;

                  if (!window.confirm(question)) return;

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

function InviteForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');

  const invite = useInvitePerson();
  const toast = useToast();

  const submit = () => {
    invite.mutate(
      // Nur Name, Adresse, Rolle. Ob jemand ein Instrument spielt, wo er wohnt
      // und ob er gerade hosten möchte, weiß nur er selbst — das steht im
      // Profil und nicht hier.
      { name: name.trim(), email: email.trim(), role },
      {
        onSuccess: (person) => {
          toast.success(
            person.invitationEmailSent
              ? `Einladung an ${person.email} verschickt.`
              : `${person.name} angelegt — die Mail konnte nicht raus.`,
          );
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
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field
        label="E-Mail"
        hint="Darüber wird die Person beim ersten Login zugeordnet — und dorthin geht die Einladung."
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
          disabled={name.trim() === '' || email.trim() === ''}
          onClick={submit}
        >
          <Mail size={13} />
          Einladen
        </Button>
      </div>
    </div>
  );
}
