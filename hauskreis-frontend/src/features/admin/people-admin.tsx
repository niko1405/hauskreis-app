'use client';

/**
 * Personen verwalten: einladen (legt Person **und** Keycloak-Konto an und
 * verschickt die Mail), Einladungen zurückziehen, Leute entfernen.
 *
 * „Eingeladen" ist ein eigener Zustand, kein halb fertiger: `acceptedAt`
 * bleibt `null`, bis sich jemand zum ersten Mal anmeldet. Solange lässt sich
 * die Einladung samt Konto zurückziehen — danach nicht mehr, denn dann gehört
 * das Konto einem Menschen und nicht mehr dieser Gruppe.
 *
 * Alles hier sind **Aktionen** und kein Entwurf: Sie wirken sofort, und wo es
 * nötig ist, fragen sie vorher nach. Der Speichern-Balken der Verwaltung
 * (`admin-draft.tsx`) hat mit ihnen nichts zu tun.
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
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextInput } from '@/components/ui/field';
import { InfoTip } from '@/components/ui/info-tip';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
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
  /**
   * Zählt die Öffnungen. Als Schlüssel am Sheet setzt er das Formular bei
   * jedem Öffnen zurück — und nicht beim Schließen, sonst leerte es sich
   * sichtbar, während es noch hinausfährt.
   */
  const [opened, setOpened] = useState(0);

  return (
    <section>
      <SectionTitle
        info={
          <>
            <strong className="font-semibold">Eingeladen</strong> heißt: Die
            Person hat sich noch nie angemeldet. Solange lässt sich die
            Einladung samt Konto zurückziehen.{' '}
            <strong className="font-semibold">Entfernen</strong> nimmt jemanden
            aus allen kommenden Planungen; vergangene Abende zeigen weiter, wer
            dabei war, und eine neue Einladung an dieselbe Adresse holt alles
            zurück.
          </>
        }
      >
        Mitglieder
      </SectionTitle>
      <Card className="space-y-4">
        {/* Oben und gefüllt: Einladen ist das, wofür die meisten hierher
            kommen. Unter einer Liste von neun Leuten stand der Knopf eine
            Bildschirmhöhe weit weg und sah aus wie eine Nebensache. */}
        <Button
          className="w-full"
          onClick={() => {
            setOpened((count) => count + 1);
            setInviting(true);
          }}
        >
          <UserPlus size={15} />
          Jemanden einladen
        </Button>

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
                                body: `Vergangene Termine zeigen weiter, wer gehostet hat — ${person.name} kommt aber aus allen kommenden Planungen heraus. Du kannst die Person jederzeit wieder einladen.`,
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
      </Card>

      <InviteSheet
        key={opened}
        open={inviting}
        onClose={() => setInviting(false)}
      />
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

/**
 * Einladen, in einem Sheet.
 *
 * Inline in der Karte schob das Formular die Mitgliederliste weg, und auf dem
 * Telefon lag das Adressfeld hinter der Tastatur — dieselbe Überlegung wie bei
 * den Ideen der Gruppe.
 */
function InviteSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');

  /**
   * Wer das ist — und, bei „war schon einmal dabei", welche Zeile. Beides
   * getrennt, damit der Wechsel zurück auf „neu" die Wahl aufhebt: Eine
   * unsichtbare Zuordnung mitzuschicken wäre die unangenehmste Art, sie zu
   * vergessen.
   */
  const [returning, setReturning] = useState(false);
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
        ...(returning && formerPersonId !== '' ? { formerPersonId } : {}),
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
          onClose();
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
    <Sheet
      open={open}
      onClose={onClose}
      title="Jemanden einladen"
      subtitle="Die Person bekommt eine Mail mit einem Link zum Anmelden."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={invite.isPending}
            disabled={
              email.trim() === '' || (returning && formerPersonId === '')
            }
            onClick={submit}
          >
            <Mail size={15} />
            Einladen
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field
          label="E-Mail"
          info="Mehr braucht es nicht: Name und Nutzername wählt die Person beim Aktivieren ihres Kontos selbst."
        >
          <TextInput
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            Rolle
            <InfoTip label="Rolle">
              Admins dürfen einladen, entfernen, Rechte vergeben und alles hier
              in der Verwaltung einstellen. Ändern lässt es sich jederzeit.
            </InfoTip>
          </p>
          <Segmented
            fill
            size="sm"
            label="Rolle"
            value={role}
            onChange={setRole}
            options={[
              { value: 'member', label: 'Mitglied' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        </div>

        <FormerMemberPicker
          returning={returning}
          onReturning={(next) => {
            setReturning(next);
            setFormerPersonId('');
          }}
          chosen={formerPersonId}
          onChoose={setFormerPersonId}
        />
      </div>
    </Sheet>
  );
}

/** Eine Antwort zum Antippen — Kreis, Titel, ein Satz darunter. */
function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
        selected
          ? 'border-terracotta-500 bg-terracotta-50/60'
          : 'border-line bg-card hover:border-line-strong',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-terracotta-500' : 'border-line-strong',
        )}
      >
        {selected && <span className="size-2 rounded-full bg-terracotta-500" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
          {icon}
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-400">
            {description}
          </span>
        )}
      </span>
    </button>
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
 * **Eine Frage mit zwei Antworten, nicht ein Link.** Der Weg stand als graue
 * Zeile „War schon einmal dabei?" unter dem Formular und wurde übersehen —
 * oder für etwas gehalten, das jede Rückkehr betrifft. Jetzt fragt das Sheet
 * ausdrücklich, wer das ist; „Jemand Neues" ist vorgewählt, weil es der
 * Normalfall ist, und die zweite Antwort sagt in ihrer Unterzeile, für wen sie
 * gedacht ist.
 *
 * Die Einträge heißen alle gleich, deshalb steht bei jedem, was er getan hat.
 * In einer Gruppe von neun ist „14× gehostet, dabei bis Januar" eine
 * Beschreibung, bei der jede:r sofort weiß, wer gemeint ist.
 */
function FormerMemberPicker({
  returning,
  onReturning,
  chosen,
  onChoose,
}: {
  returning: boolean;
  onReturning: (returning: boolean) => void;
  chosen: string;
  onChoose: (id: string) => void;
}) {
  const former = useFormerMembers(returning);
  const entries = former.data ?? [];

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
        Wer ist das?
        <InfoTip label="Wer ist das?">
          „War schon einmal dabei“ brauchst du nur für jemanden, der sein Konto
          gelöscht hat. Dann stehen seine vergangenen Abende unter „Ehemaliges
          Mitglied“, und hier holst du sie zurück unter seinen Namen. Wer den
          Hauskreis bloß verlassen hat, wird über seine E-Mail-Adresse von
          selbst wiedererkannt.
        </InfoTip>
      </p>

      <div role="radiogroup" aria-label="Wer ist das?" className="space-y-2">
        <ChoiceCard
          selected={!returning}
          onSelect={() => onReturning(false)}
          icon={<UserRound size={14} className="text-stone-400" />}
          title="Jemand Neues"
        />
        <ChoiceCard
          selected={returning}
          onSelect={() => onReturning(true)}
          icon={<History size={14} className="text-stone-400" />}
          title="War schon einmal dabei"
          description="Hat das Konto gelöscht und kommt zurück."
        />
      </div>

      {returning && (
        <div className="mt-3 space-y-2 border-l-2 border-terracotta-100 pl-3">
          {former.isLoading && <Skeleton className="h-12 w-full" />}

          {!former.isLoading && entries.length === 0 && (
            <p className="text-[11px] leading-relaxed text-stone-400">
              Hier steht niemand — es hat noch niemand sein Konto gelöscht. Wer
              den Hauskreis nur verlassen hat, wird über seine E-Mail-Adresse
              von selbst wiedererkannt.
            </p>
          )}

          {entries.length > 0 && (
            <>
              <p className="text-[11px] text-stone-400">Wer davon ist es?</p>
              <div
                role="radiogroup"
                aria-label="Ehemaliges Mitglied"
                className="space-y-2"
              >
                {entries.map((entry) => (
                  <ChoiceCard
                    key={entry.id}
                    selected={chosen === entry.id}
                    onSelect={() => onChoose(entry.id)}
                    title={`Dabei ${formatMonth(entry.joinedAt)} – ${formatMonth(entry.anonymizedAt)}`}
                    description={describeFormerMember(entry)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Woran man eine Zeile ohne Namen wiedererkennt — was jemand getan hat. */
function describeFormerMember(entry: FormerMember): string {
  const parts = [
    entry.hostedCount > 0 ? `${entry.hostedCount}× gehostet` : null,
    entry.sessionCount > 0 ? `${entry.sessionCount}× Thema` : null,
    entry.attendedCount > 0 ? `${entry.attendedCount} Abende dabei` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'Keine Abende in der App';
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    month: 'short',
    year: 'numeric',
  });
}
