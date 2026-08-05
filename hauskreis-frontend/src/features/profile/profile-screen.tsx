'use client';

/**
 * „Profil" — die eigenen Angaben, Abwesenheiten, Benachrichtigungen, Abmelden.
 *
 * `canHost` ist die wichtigste Einstellung hier: sie steuert, ob man in den
 * Host-Vorschlägen überhaupt auftaucht (CLAUDE.md §5).
 */
import { LogOut, Shield } from 'lucide-react';
import { HauskreisCard } from './hauskreis-card';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Checkbox, Field, TextInput } from '@/components/ui/field';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useMe, usePerson, useUpdatePerson } from '@/lib/api/hooks';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { AbsencesCard } from './absences-card';
import { AccountCard } from './account-card';
import { HomeCard } from './home-card';
import { PhotoPicker } from './photo-picker';
import { MembersCard } from './members-card';
import { NotificationsCard } from './notifications-card';

export function ProfileScreen() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <div className="px-5 pt-6">
        <CardSkeleton />
      </div>
    );
  }
  if (!me.me) {
    return (
      <div className="px-5 pt-6">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }

  return <Loaded personId={me.me.id} />;
}

function Loaded({ personId }: { personId: string }) {
  const me = useMe();
  const auth = useAuth();
  const hauskreis = useHauskreis();
  const person = usePerson(personId);
  const update = useUpdatePerson(personId);
  const toast = useToast();

  const current = person.data?.data;

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [playsInstrument, setPlaysInstrument] = useState(false);
  const [canHost, setCanHost] = useState(true);
  const [autoAttend, setAutoAttend] = useState(false);
  const [birthdate, setBirthdate] = useState('');

  // Den Serverstand übernehmen, sobald er da ist — und nach jedem Speichern.
  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setUsername(current.username ?? '');
    setPlaysInstrument(current.playsInstrument);
    setCanHost(current.canHost);
    setAutoAttend(current.autoAttend);
    setBirthdate(current.birthdate ?? '');
  }, [current]);

  if (person.isLoading || !current) {
    return (
      <div className="px-5 pt-6">
        <CardSkeleton />
      </div>
    );
  }

  const dirty =
    name !== current.name ||
    username !== (current.username ?? '') ||
    playsInstrument !== current.playsInstrument ||
    canHost !== current.canHost ||
    autoAttend !== current.autoAttend ||
    birthdate !== (current.birthdate ?? '');

  const save = () => {
    update.mutate(
      {
        name,
        // Zod-Defaults machen diese drei auch beim PATCH zu Pflichtfeldern.
        playsInstrument,
        canHost,
        autoAttend,
        ...(birthdate === '' ? {} : { birthdate }),
        // Leer heißt „unverändert": wer noch nie angemeldet war, hat keinen —
        // und ein leerer String wäre für den Server ein ungültiger Name.
        ...(username === '' || username === current.username
          ? {}
          : { username }),
      },
      {
        onSuccess: () => toast.success('Gespeichert.'),
      },
    );
  };

  return (
    <div>
      <PageHeader title="Profil" subtitle={hauskreis.hauskreis?.name} />

      <div className="space-y-6 px-5">
        {update.conflict && (
          <ConflictBanner
            onReload={() => void person.refetch()}
            onDismiss={update.dismissConflict}
          />
        )}

        <Card>
          <div className="flex items-center gap-4">
            <PhotoPicker person={current} />
            <div className="min-w-0">
              <p className="truncate font-serif text-xl font-bold text-stone-900">
                {current.name}
              </p>
              <p className="truncate text-xs text-stone-400">{current.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {me.isAdmin && (
                  <Badge variant="terracotta">
                    <Shield size={11} />
                    Admin
                  </Badge>
                )}
                {current.playsInstrument && (
                  <Badge variant="music">Instrument</Badge>
                )}
                {!current.canHost && <Badge>hostet gerade nicht</Badge>}
              </div>
            </div>
          </div>
        </Card>

        <section>
          <SectionTitle>Deine Angaben</SectionTitle>
          <Card className="space-y-4">
            <Field label="Name">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <Field
              label="Nutzername"
              hint="Damit meldest du dich an — die Änderung gilt sofort auch dort. Kleinbuchstaben, Ziffern, Punkt, Strich oder Unterstrich."
            >
              <TextInput
                value={username}
                placeholder={
                  current.username === null
                    ? 'Wird bei der ersten Anmeldung gesetzt'
                    : undefined
                }
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>

            <Field
              label="Geburtstag"
              hint="Optional — nützlich für die Geschenke-Planung."
            >
              <TextInput
                type="date"
                value={birthdate}
                onChange={(event) => setBirthdate(event.target.value)}
              />
            </Field>

            <Checkbox
              label="Ich kann ein Instrument spielen"
              description="Dann tauchst du bei den Musik-Vorschlägen auf."
              checked={playsInstrument}
              onChange={(event) => setPlaysInstrument(event.target.checked)}
            />

            <Checkbox
              label="Ich kann gerade hosten"
              description="Nimm den Haken raus, wenn du für eine Weile nicht dran sein möchtest — dann schlägt dich die App nicht als Host vor."
              checked={canHost}
              onChange={(event) => setCanHost(event.target.checked)}
            />

            <Checkbox
              label="Ich bin grundsätzlich dabei"
              description={
                'Sagt kommende Abende gleich für dich zu, statt sie auf „weiß noch nicht“ ' +
                'zu lassen. Ein Abwesenheitszeitraum sticht weiterhin, und absagen ' +
                'kannst du jederzeit einzeln.'
              }
              checked={autoAttend}
              onChange={(event) => setAutoAttend(event.target.checked)}
            />

            <Button
              className="w-full"
              disabled={!dirty}
              loading={update.isPending}
              onClick={save}
            >
              Speichern
            </Button>
          </Card>
        </section>

        <MembersCard />

        <HomeCard personId={personId} locationId={current.locationId} />

        <AccountCard email={current.email} />

        <AbsencesCard personId={personId} />

        <NotificationsCard />

        {me.isAdmin && (
          <section>
            <SectionTitle>Verwaltung</SectionTitle>
            <Link href="/admin">
              <Button variant="secondary" className="w-full">
                <Shield size={14} />
                Admin-Bereich
              </Button>
            </Link>
          </section>
        )}

        <HauskreisCard />

        {/* Abmelden beendet eine Sitzung, „Hauskreis verlassen" eine
            Mitgliedschaft. Deshalb steht das eine unter dem anderen und nicht
            daneben. */}
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => void auth.signoutRedirect()}
        >
          <LogOut size={14} />
          Abmelden
        </Button>
      </div>
    </div>
  );
}
