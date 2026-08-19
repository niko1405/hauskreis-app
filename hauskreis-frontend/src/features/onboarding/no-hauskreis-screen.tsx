'use client';

/**
 * Der Einstieg, wenn zu diesem Konto (noch) kein Hauskreis gehört.
 *
 * Vorher endete dieser Fall in einer roten Fehlermeldung — „Zu deinem Konto
 * gehört noch kein Hauskreis." Das stimmt und hilft niemandem: es ist kein
 * Fehler, sondern der normale Anfang, und es gibt zwei Wege heraus.
 *
 * Erreicht wird der Bildschirm auf drei Wegen: beim allerersten Öffnen ohne
 * Einladung, nach dem Verlassen, und wenn mehrere Einladungen offen sind — dann
 * entscheidet ein Mensch, welche gilt.
 */
import { useState } from 'react';
import { HousePlus, LogOut, Mail, Trash2 } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/states';
import {
  useAcceptInvitation,
  useCreateHauskreis,
  useDeleteOrphanedAccount,
  useInvitations,
} from '@/lib/api/hooks';
import type { Invitation } from '@/lib/api/types';
import { LegalFooter } from '@/components/layout/legal-footer';

export function NoHauskreisScreen({ email }: { email?: string }) {
  const auth = useAuth();
  const invitations = useInvitations();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell p-6">
      <div className="w-full max-w-sm space-y-4">
        <header className="text-center">
          <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
            Willkommen
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            Ein Hauskreis fehlt noch. Gründe einen eigenen — oder lass dich von
            einem einladen.
          </p>
        </header>

        {invitations.isLoading && <Skeleton className="h-24 w-full" />}

        {(invitations.data ?? []).map((invitation) => (
          <InvitationCard key={invitation.personId} invitation={invitation} />
        ))}

        <CreateHauskreisCard />

        <Card className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold text-stone-800">
            <Mail size={15} className="text-stone-400" />
            Eingeladen werden
          </p>
          <p className="text-xs leading-relaxed text-stone-500">
            Wer schon in einem Hauskreis ist, kann dich einladen. Gib dafür
            diese Adresse weiter:
          </p>
          <p className="rounded-md bg-canvas px-3 py-2 text-center font-mono text-xs break-all text-stone-700">
            {email ?? 'die Adresse deines Kontos'}
          </p>
        </Card>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => void auth.signoutRedirect()}
        >
          <LogOut size={14} />
          Abmelden
        </Button>

        <DeleteAccountButton />

        {/* Auch hier, aus demselben Grund wie auf der Anmeldeseite: Wer noch in
            keinem Hauskreis steht, sieht das Profil nicht. */}
        <LegalFooter className="pt-2" />
      </div>
    </div>
  );
}

/**
 * Der Ausgang für alle, die gar nicht erst ankommen wollen.
 *
 * „Konto löschen" hing bisher im Profil und damit an einer Mitgliedschaft —
 * wer sich registrierte und nirgends landete, saß auf einem Konto, das er
 * selbst nicht mehr loswurde. Ausgerechnet die, die am wenigsten von der App
 * haben, hatten also keine Tür.
 *
 * Steht unter dem Abmelden und in Grau: Es ist der seltenere und der
 * endgültige Weg, und keiner von beiden gehört nach oben.
 */
function DeleteAccountButton() {
  const auth = useAuth();
  const remove = useDeleteOrphanedAccount();
  const confirm = useConfirm();
  const toast = useToast();

  return (
    <Button
      variant="ghost"
      className="w-full text-stone-400"
      loading={remove.isPending}
      onClick={async () => {
        const ok = await confirm({
          title: 'Konto löschen?',
          body: 'Weg sind dein Name, deine E-Mail-Adresse, dein Geburtstag und deine Anmeldung — danach kommst du hier nicht mehr herein. Warst du früher schon einmal in einem Hauskreis, bleiben die vergangenen Abende so stehen, wie sie waren; du stehst dort dann als „Ehemaliges Mitglied".',
          confirmLabel: 'Endgültig löschen',
          tone: 'danger',
        });
        if (!ok) return;

        remove.mutate(undefined, {
          onSuccess: () => {
            toast.success('Dein Konto ist gelöscht.');
            // Kein `signoutRedirect`: Das Konto gibt es nicht mehr, und
            // Keycloak hat mit ihm die Sitzung weggeräumt. Ein Abmeldeversuch
            // liefe auf eine Fehlerseite zu. Das Token hier wegzuwerfen und
            // neu zu laden führt auf dem kürzesten Weg zur Anmeldung.
            void auth.removeUser().finally(() => window.location.assign('/'));
          },
        });
      }}
    >
      <Trash2 size={14} />
      Konto löschen
    </Button>
  );
}

function CreateHauskreisCard() {
  const [name, setName] = useState('');
  const create = useCreateHauskreis();
  const toast = useToast();

  const trimmed = name.trim();

  return (
    <Card className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-bold text-stone-800">
        <HousePlus size={15} className="text-terracotta-500" />
        Eigenen Hauskreis gründen
      </p>
      <Field label="Name">
        <TextInput
          value={name}
          placeholder="Mein Hauskreis"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) =>
            event.key === 'Enter' && trimmed !== '' && submit()
          }
        />
      </Field>
      <p className="text-[11px] leading-relaxed text-stone-400">
        Du bist danach Admin und kannst die anderen einladen.
      </p>
      <Button
        className="w-full"
        disabled={trimmed === ''}
        loading={create.isPending}
        onClick={submit}
      >
        Gründen
      </Button>
    </Card>
  );

  function submit() {
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (hauskreis) => toast.success(`„${hauskreis.name}" steht.`),
      },
    );
  }
}

/**
 * Hier gibt es keine Rückfrage: wer diesen Bildschirm sieht, hat nichts zu
 * verlieren. Die Rückfrage steht im Profil, wo man noch in einem Hauskreis ist.
 */
function InvitationCard({ invitation }: { invitation: Invitation }) {
  const accept = useAcceptInvitation();
  const toast = useToast();

  return (
    <Card className="space-y-3 border-terracotta-400">
      <div>
        <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
          Einladung
        </p>
        <p className="mt-0.5 font-serif text-xl font-bold text-stone-900">
          {invitation.hauskreis.name}
        </p>
      </div>
      <Button
        className="w-full"
        loading={accept.isPending}
        onClick={() =>
          accept.mutate(
            { personId: invitation.personId },
            {
              onSuccess: () =>
                toast.success(`Du bist bei „${invitation.hauskreis.name}".`),
            },
          )
        }
      >
        Annehmen
      </Button>
    </Card>
  );
}
