'use client';

/**
 * Personen verwalten: einladen (legt Person **und** Keycloak-Konto an und
 * verschickt die Mail) und deaktivieren.
 */
import { Mail, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field';
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
              {!person.active && <Badge>inaktiv</Badge>}
              <IconButton
                label={`${person.name} entfernen`}
                onClick={() => {
                  if (!window.confirm(`${person.name} wirklich entfernen?`))
                    return;
                  remove.mutate(person.id, {
                    onSuccess: () => toast.success(`${person.name} entfernt.`),
                    onError: (error) => toast.error(errorMessage(error)),
                  });
                }}
              >
                <Trash2 size={15} />
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
  const [playsInstrument, setPlaysInstrument] = useState(false);

  const invite = useInvitePerson();
  const toast = useToast();

  const submit = () => {
    invite.mutate(
      {
        name: name.trim(),
        email: email.trim(),
        role,
        playsInstrument,
        canHost: true,
      },
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
        hint="Darüber wird die Person beim ersten Login zugeordnet."
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
      <Checkbox
        label="Spielt ein Instrument"
        checked={playsInstrument}
        onChange={(event) => setPlaysInstrument(event.target.checked)}
      />
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
