'use client';

/**
 * „Profil" — die eigenen Angaben, Abwesenheiten, Benachrichtigungen, Abmelden.
 *
 * `canHost` ist die wichtigste Einstellung hier: sie steuert, ob man in den
 * Host-Vorschlägen überhaupt auftaucht (CLAUDE.md §5).
 */
import {
  Ban,
  CalendarCheck,
  Guitar,
  Home,
  LogOut,
  Mic,
  Shield,
  Users,
} from 'lucide-react';
import { HauskreisCard } from './hauskreis-card';
import Link from '@/components/ui/link';
import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/switch';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useUnsavedGuard } from '@/components/ui/unsaved';
import { useMe, usePerson, useUpdatePerson } from '@/lib/api/hooks';
import { useHeaderPreference } from '@/lib/header-preference';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { AbsencesCard } from './absences-card';
import { AppCard } from './app-card';
import { AppearanceCard } from './appearance-card';
import { HomeCard } from './home-card';
import { PhotoPicker } from './photo-picker';
import { NotificationsCard } from './notifications-card';
import { useUnreadAdmin } from '@/features/admin/use-unread-admin';
import type { UpdatePersonInput } from '@/lib/api/types';

/** Die vier Angaben, die als Schalter im Profil stehen und sofort gelten. */
type Flag =
  'playsInstrument' | 'canHost' | 'autoAttend' | 'testimonyToldBefore';

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
  const header = useHeaderPreference();
  const { unread: adminUnread } = useUnreadAdmin();

  const current = person.data?.data;

  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');

  // Den Serverstand übernehmen, sobald er da ist — und nach jedem Speichern.
  // **Je Feld** und nicht am ganzen Datensatz: Die Schalter darunter
  // schreiben sofort, und jede ihrer Antworten ist ein neuer Datensatz. Hinge
  // das hier daran, löschte das Umlegen eines Schalters einen halb getippten
  // Namen.
  const serverName = current?.name;
  const serverBirthdate = current?.birthdate;
  useEffect(() => {
    if (serverName !== undefined) setName(serverName);
  }, [serverName]);
  useEffect(() => {
    if (serverBirthdate !== undefined) setBirthdate(serverBirthdate ?? '');
  }, [serverBirthdate]);

  // Steht vor dem vorzeitigen Aussteigen, weil `useUnsavedGuard` ein Hook ist
  // und Hooks nicht hinter einem `return` stehen dürfen. Ohne Serverstand gibt
  // es ohnehin nichts, wovon etwas abweichen könnte. Die Schalter zählen nicht:
  // An ihnen gibt es nichts Ungespeichertes.
  const dirty =
    current !== undefined &&
    (name !== current.name || birthdate !== (current.birthdate ?? ''));

  // Solange das gilt, fragt jeder Link nach, bevor er von hier wegführt.
  useUnsavedGuard(dirty);

  if (person.isLoading || !current) {
    return (
      <div className="px-5 pt-6">
        <CardSkeleton />
      </div>
    );
  }

  const save = () => {
    update.mutate(
      {
        name,
        ...(birthdate === '' ? {} : { birthdate }),
      },
      {
        onSuccess: () => toast.success('Gespeichert.'),
      },
    );
  };

  /**
   * Was ein Schalter gerade zeigt: während er schreibt den neuen Stand, sonst
   * den des Servers. Ohne das bliebe er bis zur Antwort in der alten Lage
   * stehen und spränge erst dann um — bei schlechtem Netz eine Sekunde, in
   * der er kaputt aussieht.
   */
  const flag = (key: Flag): boolean => {
    const pending = update.isPending ? update.variables?.[key] : undefined;
    return pending ?? current[key];
  };

  // Einer nach dem anderen: Jeder Schreibvorgang trägt den ETag des vorigen,
  // und ein zweiter, der vor der Antwort losgeht, wäre ein Konflikt mit sich
  // selbst. Abgeblendet wird dabei nichts — der Moment ist zu kurz, als dass
  // ein grauer Schalter etwas anderes wäre als ein Flackern.
  const toggle = (key: Flag) => (next: boolean) => {
    if (update.isPending) return;
    const input: UpdatePersonInput = {};
    input[key] = next;
    update.mutate(input);
  };

  return (
    <div>
      <ScreenHeader
        screen="profile"
        title="Profil"
        subtitle={hauskreis.hauskreis?.name}
      />

      <div className="space-y-6 px-5">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
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
                  <Badge variant="success">
                    <Guitar size={11} />
                    Instrument
                  </Badge>
                )}
                {!current.canHost && (
                  <Badge>
                    <Ban size={11} />
                    hostet nicht
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Nur ohne Kopfleiste. Ist sie an, führt der hervorgehobene Knopf
            dort zur Gruppe, und zwei Wege zum selben Ziel auf einem Bildschirm
            sind einer zu viel. */}
        {!header.shown && (
          <section>
            <SectionTitle>Euer Hauskreis</SectionTitle>
            <Link href="/hauskreis">
              <Button variant="secondary" className="w-full">
                <Users size={14} />
                Zur Gruppe
              </Button>
            </Link>
          </section>
        )}

        {me.isAdmin && (
          <section>
            <SectionTitle>Verwaltung</SectionTitle>
            <Link href="/admin">
              <Button variant="secondary" className="w-full">
                <Shield size={14} />
                Admin-Bereich
                {/* Bis man einmal drin war. Wer gerade ernannt wurde, sieht
                    hier einen Knopf mehr und sonst nichts, das ihm sagt, was
                    dahinter steht. */}
                {adminUnread && (
                  <span className="size-1.5 rounded-full bg-terracotta-500" />
                )}
              </Button>
            </Link>
          </section>
        )}

        {/* „Deine Angaben" waren eine Karte: zwei Felder, vier Haken und ein
            Speichern-Knopf für alles. Es sind aber zwei Sorten — wer du bist,
            und wofür die App dich vorschlägt. Die erste tippt man und
            speichert sie, die zweite legt man um, und sie gilt. */}
        <section>
          <SectionTitle>Über dich</SectionTitle>
          <Card className="space-y-4">
            <Field label="Anzeigename">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            {/* Der Anmeldename stand einmal hier. Er gehört aber zur Anmeldung
                und nicht zu den Angaben über einen selbst — jetzt liegt er in
                der Konto-Karte, direkt über der E-Mail. */}

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

            {/* Nur, wenn es etwas zu speichern gibt. Ein Knopf, der dauerhaft
                ausgegraut dasteht, fragt nach einer Erklärung. */}
            {dirty && (
              <Button
                className="w-full"
                loading={update.isPending}
                onClick={save}
              >
                Speichern
              </Button>
            )}
          </Card>
        </section>

        {/* Unter jedem Schalter steht, was er **gerade** bewirkt — nicht eine
            Erklärung beider Fälle. Das waren einmal vier Absätze, dann vier
            Info-Symbole, hinter denen man sie suchen musste. Ein Satz, der
            mit dem Schalter wechselt, ist kürzer als beides und beantwortet
            die Frage, mit der man herkommt: „Was passiert, wenn ich das
            umlege?" */}
        <section>
          <SectionTitle>Was du übernimmst</SectionTitle>
          <Card className="divide-y divide-line py-1">
            <SwitchRow
              className="py-3.5"
              icon={<Guitar size={17} />}
              label="Ich spiele ein Instrument"
              description={
                flag('playsInstrument')
                  ? 'Du stehst bei der Musik zur Wahl.'
                  : 'Bei der Musik schlägt dich die App nicht vor.'
              }
              checked={flag('playsInstrument')}
              onChange={toggle('playsInstrument')}
            />

            {/* Die Warnung vor der Verwechslung mit einer Abwesenheit steht
                nur im ausgeschalteten Fall — dann, wenn sie gilt. */}
            <SwitchRow
              className="py-3.5"
              icon={<Home size={17} />}
              label="Ich kann gerade hosten"
              description={
                flag('canHost')
                  ? 'Du stehst bei den Gastgebern zur Wahl.'
                  : 'Bei den Gastgebern schlägt dich die App nicht vor. Für einzelne Abende reicht eine Abwesenheit.'
              }
              checked={flag('canHost')}
              onChange={toggle('canHost')}
            />

            <SwitchRow
              className="py-3.5"
              icon={<CalendarCheck size={17} />}
              label="Ich bin grundsätzlich dabei"
              description={
                flag('autoAttend')
                  ? 'Neue Abende sagst du gleich zu — Abwesenheiten und Absagen gelten trotzdem.'
                  : 'Neue Abende stehen bei dir auf „weiß noch nicht“.'
              }
              checked={flag('autoAttend')}
              onChange={toggle('autoAttend')}
            />

            {/* Steht als Letztes, weil man es genau einmal anfasst: Ein
                Testimony erzählt man einmal, und wer es hier erzählt hat, ist
                ohnehin raus — dieser Schalter ist für alles davor. */}
            <SwitchRow
              className="py-3.5"
              icon={<Mic size={17} />}
              label="Mein Testimony habe ich schon erzählt"
              description={
                flag('testimonyToldBefore')
                  ? 'Die App schlägt dich fürs Testimony nicht mehr vor.'
                  : 'Die App schlägt dich fürs Testimony vor — Abende hier kennt sie selbst.'
              }
              checked={flag('testimonyToldBefore')}
              onChange={toggle('testimonyToldBefore')}
            />
          </Card>
        </section>

        <HomeCard personId={personId} locationId={current.locationId} />

        <AbsencesCard personId={personId} />

        <NotificationsCard />

        <AppearanceCard />

        <AppCard />

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
