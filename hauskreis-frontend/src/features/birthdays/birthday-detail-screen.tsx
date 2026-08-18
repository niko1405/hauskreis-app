'use client';

/**
 * Ein Geburtstag im Detail: Vorschläge, Abstimmung, Entscheidung.
 *
 * **Wer Geburtstag hat, sieht hier nichts** — und das ist keine ausgeblendete
 * Karte, sondern eine Antwort ohne Inhalt: Der Server schickt `ideas: null`,
 * wenn der Betrachter das Geburtstagskind ist. Deshalb steht unten kein
 * `if (!isOwn)` um jede Sektion, sondern ein früher Ausstieg mit einem netten
 * Satz.
 *
 * **Drei Rechte, drei Personen.** Vorschlagen und zustimmen darf jede:r außer
 * dem Geburtstagskind; **auswählen** und den **Preis** eintragen nur, wer das
 * Geschenk besorgt. Das ist dieselbe Aufteilung wie bei den Liedern: Ideen
 * sammeln ist offen, die Entscheidung gehört dem, der sie ausbaden muss.
 */
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Gift,
  Lock,
  Plus,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextInput } from '@/components/ui/field';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { isHttpUrl } from '@/components/domain/lyrics-link';
import {
  useBirthday,
  useDecideGift,
  useProposeGiftIdea,
  useRemoveGiftIdea,
  useVoteGiftIdea,
} from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/errors';
import { formatDayFull } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { BirthdayDetail, GiftIdea } from '@/lib/api/types';

/**
 * Der Weg zurück führt dorthin, wo man hergekommen ist.
 *
 * Nicht auf die Terminliste: Ein Geburtstag steht zwar auch dort, aber gesucht
 * hat man ihn im Register „Geburtstage" — und aus einer Benachrichtigung kommt
 * man ohnehin über genau diese Adresse (`appPath.birthdays()` im Backend).
 */
const BIRTHDAYS = '/termine?tab=geburtstage';

export function BirthdayDetailScreen({ occasionId }: { occasionId: string }) {
  const birthday = useBirthday(occasionId);

  if (birthday.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-safe-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (birthday.error || !birthday.data) {
    return (
      <div className="px-5 pt-safe-6">
        <ErrorState
          error={birthday.error ?? new Error('Geburtstag nicht gefunden')}
        />
        <Link href={BIRTHDAYS}>
          <Button variant="ghost" className="mt-4">
            Zurück zu den Geburtstagen
          </Button>
        </Link>
      </div>
    );
  }

  return <Loaded occasionId={occasionId} data={birthday.data} />;
}

function Loaded({
  occasionId,
  data,
}: {
  occasionId: string;
  data: BirthdayDetail;
}) {
  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      <div className="flex items-center justify-between">
        <Link href={BIRTHDAYS}>
          <IconButton label="Zurück">
            <ArrowLeft size={18} />
          </IconButton>
        </Link>
        {data.frozen && !data.isOwn && (
          <Badge>
            <Lock size={11} />
            steht fest
          </Badge>
        )}
      </div>

      <header className="flex items-center gap-4">
        <Avatar person={data.person} size="lg" />
        <div className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
            {data.person.name}
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            {formatDayFull(data.occursOn)}
            {data.age !== null && ` · wird ${data.age}`}
          </p>
        </div>
      </header>

      {data.isOwn ? (
        <OwnBirthday />
      ) : (
        <Others occasionId={occasionId} data={data} />
      )}
    </div>
  );
}

/**
 * Die Seite für den, der Geburtstag hat.
 *
 * Kein „hier steht nichts für dich" und kein gesperrter Bereich — beides wäre
 * eine Auskunft darüber, dass es etwas zu sehen gäbe. Stattdessen der einzige
 * Satz, der hier hingehört.
 */
function OwnBirthday() {
  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <Gift size={28} className="text-terracotta-400" />
      <p className="font-serif text-lg font-bold text-stone-800">
        Alles Gute schon mal!
      </p>
      <p className="max-w-xs text-[12px] leading-relaxed text-stone-400">
        Was die anderen sich überlegen, bleibt ihre Sache — hier gibt es für
        dich nichts zu sehen. Lass dich überraschen.
      </p>
    </Card>
  );
}

function Others({
  occasionId,
  data,
}: {
  occasionId: string;
  data: BirthdayDetail;
}) {
  const ideas = data.ideas ?? [];
  const open = ideas.filter((idea) => idea.giftedOn === null);
  const gifted = ideas.filter((idea) => idea.giftedOn !== null);

  return (
    <>
      <ResponsibleCard data={data} />

      {data.canDecide && <PriceCard occasionId={occasionId} data={data} />}

      <section>
        <SectionTitle>Vorschläge</SectionTitle>
        <div className="space-y-2">
          {open.map((idea) => (
            <IdeaRow
              key={idea.id}
              occasionId={occasionId}
              idea={idea}
              selected={data.gift?.id === idea.id}
              canDecide={data.canDecide}
            />
          ))}

          {open.length === 0 && (
            <Card>
              <p className="text-[11px] leading-relaxed text-stone-400">
                Noch keine Idee. Was würde {data.person.name} freuen?
              </p>
            </Card>
          )}

          {data.canPropose && <ProposeForm occasionId={occasionId} />}
        </div>
      </section>

      {gifted.length > 0 && (
        <section>
          <SectionTitle>Schon einmal geschenkt</SectionTitle>
          {/* Sie stehen hier, damit niemand dasselbe zweimal aussucht — und
              nicht, weil sie noch zur Wahl stünden. Auswählen kann man sie
              trotzdem: Ein Buch war vor drei Jahren richtig und ist es
              vielleicht wieder. */}
          <div className="space-y-2">
            {gifted.map((idea) => (
              <IdeaRow
                key={idea.id}
                occasionId={occasionId}
                idea={idea}
                selected={data.gift?.id === idea.id}
                canDecide={data.canDecide}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ResponsibleCard({ data }: { data: BirthdayDetail }) {
  return (
    <Card className="flex items-center gap-3">
      {data.responsible ? (
        <>
          <Avatar person={data.responsible} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-stone-800">
              {data.canDecide
                ? 'Du besorgst das Geschenk'
                : `${data.responsible.name} besorgt das Geschenk`}
            </p>
            {data.frozen && (
              <p className="mt-0.5 text-[11px] text-stone-400">
                Daran ändert sich nichts mehr — der Geburtstag ist zu nah.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-stone-400">
          Für das Geschenk ist niemand eingeteilt. Vorschlagen darf trotzdem
          jede:r — jemand nimmt es sicher mit.
        </p>
      )}
    </Card>
  );
}

/** Was es gekostet hat. Nur der Zuständige trägt es ein, alle anderen lesen es. */
function PriceCard({
  occasionId,
  data,
}: {
  occasionId: string;
  data: BirthdayDetail;
}) {
  const decide = useDecideGift(occasionId);
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);

  const current =
    data.priceCents === null ? '' : (data.priceCents / 100).toFixed(2);
  const value = draft ?? current;
  const unchanged = value === current;

  return (
    <Card className="space-y-3">
      <Field
        label="Preis"
        hint="Damit die anderen wissen, worauf sie sich einlassen. Leer lassen geht auch."
      >
        <TextInput
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          placeholder="0,00"
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>

      <Button
        variant="secondary"
        disabled={unchanged}
        loading={decide.isPending}
        onClick={() =>
          decide.mutate(
            {
              // Leer heißt „doch nicht", nicht „null Euro" — deshalb `null`
              // und nicht `0`.
              priceCents: value === '' ? null : Math.round(Number(value) * 100),
            },
            {
              onSuccess: () => {
                setDraft(null);
                toast.success('Preis gespeichert.');
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }
      >
        Preis speichern
      </Button>
    </Card>
  );
}

function IdeaRow({
  occasionId,
  idea,
  selected,
  canDecide,
}: {
  occasionId: string;
  idea: GiftIdea;
  selected: boolean;
  canDecide: boolean;
}) {
  const vote = useVoteGiftIdea(occasionId);
  const remove = useRemoveGiftIdea(occasionId);
  const decide = useDecideGift(occasionId);
  const confirm = useConfirm();
  const toast = useToast();

  return (
    <Card
      className={cn(
        'space-y-2',
        selected && 'border-terracotta-400 bg-terracotta-50/50',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-800">{idea.text}</p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            {idea.proposedBy?.name ?? 'Ehemaliges Mitglied'}
            {idea.giftedOn && ` · schon geschenkt`}
          </p>
        </div>

        {selected && (
          <Badge variant="terracotta">
            <Check size={11} />
            ausgesucht
          </Badge>
        )}
      </div>

      <ShopLink url={idea.url} />

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <button
          type="button"
          disabled={vote.isPending}
          onClick={() =>
            vote.mutate({ ideaId: idea.id, approve: !idea.votedByMe })
          }
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50',
            idea.votedByMe
              ? 'border-terracotta-100 bg-terracotta-50 text-terracotta-700'
              : 'border-line text-stone-400 hover:border-terracotta-400',
          )}
        >
          <ThumbsUp size={11} />
          {idea.votes}
        </button>

        {canDecide && (
          <Button
            variant="ghost"
            className="text-[11px]"
            loading={decide.isPending}
            onClick={() =>
              decide.mutate(
                { giftIdeaId: selected ? null : idea.id },
                {
                  onSuccess: () =>
                    toast.success(
                      selected
                        ? 'Die Abstimmung ist wieder offen.'
                        : 'Ausgesucht — die anderen wissen Bescheid.',
                    ),
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          >
            {selected ? 'Doch nicht' : 'Das nehmen wir'}
          </Button>
        )}

        {/* Löschen nur den eigenen, und nur was noch nie verschenkt wurde —
            beides prüft der Server, hier ist es nur der Weg dorthin. */}
        {!idea.giftedOn && (
          <button
            type="button"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Vorschlag wegnehmen?',
                body: `„${idea.text}" verschwindet für alle.`,
                confirmLabel: 'Wegnehmen',
                tone: 'danger',
              });
              if (!ok) return;

              remove.mutate(idea.id, {
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-stone-400 transition-colors hover:text-alert disabled:opacity-50"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * Wo man es bekommt.
 *
 * Eigener Knopf statt `LyricsLink`: Der heißt „Text" und meint Liedtexte — auf
 * einem Geschenk stünde das falsche Wort. Die Adressprüfung teilen sich beide,
 * und die ist der eigentliche Inhalt: `javascript:` ist eine gültige URL und
 * wäre als `href` ein Einfallstor.
 */
function ShopLink({ url }: { url: string | null }) {
  if (!isHttpUrl(url)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex w-fit items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-[11px] font-semibold text-terracotta-600 hover:border-terracotta-400 hover:bg-terracotta-50"
    >
      Ansehen
      <ExternalLink size={11} />
    </a>
  );
}

function ProposeForm({ occasionId }: { occasionId: string }) {
  const propose = useProposeGiftIdea(occasionId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] font-semibold text-stone-400 transition-colors hover:border-terracotta-400 hover:text-terracotta-600"
      >
        <Plus size={14} />
        Idee vorschlagen
      </button>
    );
  }

  const save = () =>
    propose.mutate(
      { text: text.trim(), url: url.trim() === '' ? null : url.trim() },
      {
        onSuccess: () => {
          setText('');
          setUrl('');
          setOpen(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <Card className="space-y-3">
      <Field label="Was schlägst du vor?">
        <TextInput
          value={text}
          placeholder="Ein gutes Buch, eine Pflanze, …"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>

      <Field label="Link" hint="Optional — wo man es bekommt.">
        <TextInput
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(event) => setUrl(event.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setText('');
            setUrl('');
          }}
        >
          Abbrechen
        </Button>
        <Button
          className="flex-1"
          disabled={text.trim() === ''}
          loading={propose.isPending}
          onClick={save}
        >
          Vorschlagen
        </Button>
      </div>
    </Card>
  );
}
