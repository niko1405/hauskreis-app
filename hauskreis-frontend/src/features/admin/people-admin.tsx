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
  History,
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
  useFormerMembers,
  useInvitePerson,
  useMe,
  usePeople,
  useResendInvitation,
  useSetPersonRole,
} from '@/lib/api/hooks';
import type { FormerMember, PersonListEntry } from '@/lib/api/types';

export function PeopleAdmin() {
  const people = usePeople();
  const me = useMe();
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
            /* Dieselbe Form wie in der Mitgliederliste im Profil, nur mit
               Knöpfen: Auf dem Telefon rutschen Abzeichen und Knöpfe unter den
               Namen, ab `sm` stehen sie wieder daneben. Hier war es schlimmer
               als dort — Abzeichen **und** bis zu drei Knöpfe hingen als
               direkte Kinder ohne Umbruch in der Zeile, und bei einer offenen
               Einladung quetschten sechs Elemente den Namen zu einem Buchstaben
               zusammen. */
            <li
              key={person.id}
              className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                <Avatar person={person} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-stone-800">
                    {person.name}
                  </p>
                  <p className="truncate text-[11px] text-stone-400">
                    {person.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex flex-wrap items-center gap-1">
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
                </div>

                {/* `shrink-0`: Die Knöpfe sind das Bedienbare der Zeile und
                    bleiben in jeder Breite vollständig erreichbar. */}
                <div className="ml-auto flex shrink-0 items-center gap-1">
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

                  {/* Die eigene Zeile trägt keinen Papierkorb.

                  Anders als bei der Rolle ist das keine Regel über den
                  Augenblick, sondern über die Person: Sie kann nie zutreffen,
                  und ein Knopf, der ausnahmslos in einer Fehlermeldung endet,
                  ist eine Einladung ins Leere. Der Server lehnt es trotzdem ab
                  — er ist die verbindliche Stelle, das hier ist die höfliche.

                  Wer gehen will, nimmt „Hauskreis verlassen" im Profil — dort
                  wird auch die Nachfolge geklärt. */}
                  {person.id !== me.me?.id && (
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
                                body: `Vergangene Abende zeigen weiter, wer gehostet hat — ${person.name} kommt aber aus allen kommenden Planungen heraus. Eine neue Einladung an dieselbe Adresse holt alles wieder zurück.`,
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
                  )}
                </div>
              </div>
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

  /**
   * Ob der Teil „war schon einmal dabei" offen ist, und wenn ja, welche Zeile
   * gewählt wurde. Beides getrennt, damit das Zuklappen die Wahl aufhebt —
   * eine unsichtbare Zuordnung mitzuschicken wäre die unangenehmste Art, sie
   * zu vergessen.
   */
  const [merging, setMerging] = useState(false);
  const [formerPersonId, setFormerPersonId] = useState('');

  const invite = useInvitePerson();
  const toast = useToast();

  const submit = () => {
    invite.mutate(
      // Nur Adresse und Rolle. Wie die Person heißt, entscheidet sie beim
      // Aktivieren ihres Kontos selbst; alles Weitere steht im Profil.
      {
        email: email.trim(),
        role,
        ...(merging && formerPersonId !== '' ? { formerPersonId } : {}),
      },
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
      <FormerMemberPicker
        open={merging}
        onToggle={() => {
          setMerging((was) => !was);
          setFormerPersonId('');
        }}
        chosen={formerPersonId}
        onChoose={setFormerPersonId}
      />

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

/**
 * „War schon einmal dabei?" — der Weg zurück für ein gelöschtes Konto.
 *
 * Er wird nur für einen einzigen Fall gebraucht. Wer den Hauskreis bloß
 * **verlässt**, behält Name und Adresse in seiner Zeile; eine Einladung an
 * dieselbe Adresse findet sie von selbst wieder, und alles im Archiv hängt
 * weiter an ihr. Wer sein **Konto löscht**, gibt beides ab — danach gibt es
 * nichts mehr, woran der Server die Zeile erkennen könnte, und ohne diesen
 * Knopf stünde die Person nach ihrer Rückkehr neben ihrer eigenen
 * Vergangenheit.
 *
 * Standardmäßig zu, und das ist keine Sparsamkeit: Der Normalfall ist eine
 * neue Person, und eine Auswahlliste ehemaliger Mitglieder über jedem
 * Einladen-Formular wäre eine Frage, die sich fast nie stellt.
 *
 * Die Einträge heißen alle gleich, deshalb steht neben jedem, was er getan
 * hat. In einer Gruppe von neun ist „hat 14 Abende gehostet, zuletzt im
 * Februar" eine Beschreibung, bei der jede:r sofort weiß, wer gemeint ist.
 */
function FormerMemberPicker({
  open,
  onToggle,
  chosen,
  onChoose,
}: {
  open: boolean;
  onToggle: () => void;
  chosen: string;
  onChoose: (id: string) => void;
}) {
  const former = useFormerMembers(open);
  const entries = former.data ?? [];

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 hover:text-stone-600"
      >
        <History size={12} />
        War schon einmal dabei?
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-line bg-canvas p-3">
          {former.isLoading && <Skeleton className="h-8 w-full" />}

          {!former.isLoading && entries.length === 0 && (
            <p className="text-[11px] leading-relaxed text-stone-400">
              Hier steht niemand. Wer den Hauskreis nur verlassen hat, wird über
              seine E-Mail-Adresse ohnehin wiedererkannt — dafür brauchst du
              nichts weiter zu tun.
            </p>
          )}

          {entries.length > 0 && (
            <>
              <p className="text-[11px] leading-relaxed text-stone-400">
                Wähle die Zeile, zu der die eingeladene Person gehört. Ihre
                vergangenen Abende stehen danach wieder unter ihrem Namen statt
                unter „Ehemaliges Mitglied".
              </p>
              <Select
                value={chosen}
                aria-label="Ehemaliges Mitglied"
                onChange={(event) => onChoose(event.target.value)}
              >
                <option value="">Niemand — neue Person</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {describeFormerMember(entry)}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Woran man eine Zeile ohne Namen wiedererkennt. */
function describeFormerMember(entry: FormerMember): string {
  const parts = [
    entry.hostedCount > 0 ? `${entry.hostedCount}× gehostet` : null,
    entry.sessionCount > 0 ? `${entry.sessionCount}× Thema` : null,
    entry.attendedCount > 0 ? `${entry.attendedCount} Abende dabei` : null,
  ].filter(Boolean);

  const since = `dabei seit ${formatMonth(entry.joinedAt)}`;
  const until = `weg seit ${formatMonth(entry.anonymizedAt)}`;

  return [since, until, ...parts].join(' · ');
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    month: 'short',
    year: 'numeric',
  });
}
