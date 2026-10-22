'use client';

/**
 * Ein Geburtstag im Detail: Vorschläge, Abstimmung, Gespräch, Entscheidung.
 *
 * **Wer Geburtstag hat, sieht hier nichts** — und das ist keine ausgeblendete
 * Karte, sondern eine Antwort ohne Inhalt: Der Server schickt `ideas: null`,
 * wenn der Betrachter das Geburtstagskind ist. Deshalb steht unten kein
 * `if (!isOwn)` um jede Sektion, sondern ein früher Ausstieg mit einem netten
 * Satz. Die Kommentare hängen an den Vorschlägen und fallen damit von selbst
 * mit weg.
 *
 * **Vier Rechte, drei Personen.** Vorschlagen, zustimmen und kommentieren darf
 * jede:r außer dem Geburtstagskind; **wegnehmen** nur, wer den Vorschlag
 * gemacht hat (`canRemove`); **auswählen**, den **Preis** eintragen und die
 * anderen **erinnern** nur, wer das Geschenk besorgt. Ideen sammeln ist offen,
 * die Entscheidung gehört dem, der sie ausbaden muss.
 */
import {
  BellRing,
  Cake,
  Check,
  ExternalLink,
  Gift,
  Lock,
  MessageCircle,
  Plus,
  SendHorizontal,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/layout/back-button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { SwipeActions } from '@/components/ui/swipe-actions';
import { useToast } from '@/components/ui/toast';
import { isHttpUrl } from '@/components/domain/lyrics-link';
import {
  useBirthday,
  useCommentGiftIdea,
  useDecideGift,
  useNudgeBirthday,
  useProposeGiftIdea,
  useRemoveGiftIdea,
  useRemoveGiftIdeaComment,
  useVoteGiftIdea,
} from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/errors';
import { formatDayFull, formatTimestamp } from '@/lib/date';
import { cn } from '@/lib/cn';
import type {
  BirthdayDetail,
  GiftIdea,
  GiftIdeaComment,
} from '@/lib/api/types';
import { countdown } from './birthday-card';

/**
 * Wohin der Zurück-Pfeil führt, wenn es kein „zurück" gibt.
 *
 * Nur dann: Sonst geht es dorthin, woher man kam — aus der Terminliste, dem
 * Kalender, „Heute" oder dem Register „Geburtstage". Ein festes Ziel schickte
 * jeden, der aus der Liste kam, ins Register, in dem er nie war. Ohne
 * Vorgeschichte (eine Push-Nachricht führt direkt hierher) ist das Register der
 * Ort, an dem dieser Geburtstag sonst steht.
 */
const BIRTHDAYS = '/termine?tab=geburtstage';

const euros = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

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
        <BackButton fallback={BIRTHDAYS} />
        {data.frozen && !data.isOwn && (
          <Badge>
            <Lock size={11} />
            steht fest
          </Badge>
        )}
      </div>

      <Hero data={data} />

      {data.isOwn ? (
        <OwnBirthday />
      ) : (
        <Others occasionId={occasionId} data={data} />
      )}
    </div>
  );
}

/**
 * Der Kopf: wer, wann, wie alt — und wie lange noch.
 *
 * Eine Karte mit warmer Tönung statt einer nackten Überschrift: Es ist ein
 * Anlass, kein Datensatz. Die Tönung ist dieselbe wie an der Karte in der
 * Liste, wenn der Geburtstag heute ist — hier steht sie immer, weil man auf
 * dieser Seite nur ist, um sich um genau diesen Tag zu kümmern.
 */
function Hero({ data }: { data: BirthdayDetail }) {
  const today = data.daysUntil === 0;

  return (
    <header
      className={cn(
        'relative overflow-hidden rounded-card border border-terracotta-100 bg-gradient-to-br from-terracotta-50 via-card to-card p-5 shadow-sm',
        today && 'border-terracotta-400',
      )}
    >
      {/* Groß und blass in der Ecke: Schmuck, keine Information — deshalb
          `aria-hidden` und hinter allem. */}
      <Cake
        aria-hidden
        size={120}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -bottom-8 text-terracotta-100"
      />

      <div className="relative flex items-center gap-4">
        <Avatar
          person={data.person}
          size="lg"
          className="shrink-0 ring-4 ring-card"
        />
        <div className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
            {data.person.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {formatDayFull(data.occursOn)}
          </p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {data.daysUntil >= 0 && (
          <Badge variant="terracotta">
            <Cake size={11} />
            {countdown(data.daysUntil)}
          </Badge>
        )}
        {data.age !== null && <Badge>wird {data.age}</Badge>}
      </div>
    </header>
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
  const [proposing, setProposing] = useState(false);

  const ideas = data.ideas ?? [];
  const open = ideas.filter((idea) => idea.giftedOn === null);
  const gifted = ideas.filter((idea) => idea.giftedOn !== null);

  const card = (idea: GiftIdea) => (
    <IdeaCard
      key={idea.id}
      occasionId={occasionId}
      idea={idea}
      selected={data.gift?.id === idea.id}
      canDecide={data.canDecide}
      canComment={data.canPropose}
    />
  );

  return (
    <>
      <GiftStatusCard data={data} />

      {data.canDecide && <PriceCard occasionId={occasionId} data={data} />}

      <section>
        <SectionTitle
          action={
            open.length > 0 && (
              <span className="text-[11px] font-semibold text-stone-400 normal-case">
                {open.length === 1 ? '1 Idee' : `${open.length} Ideen`}
              </span>
            )
          }
        >
          Vorschläge
        </SectionTitle>

        <div className="space-y-3">
          {open.map(card)}

          {open.length === 0 && (
            <Card className="flex flex-col items-center gap-2 py-6 text-center">
              <Gift size={22} className="text-stone-300" />
              <p className="text-sm font-bold text-stone-700">
                Noch keine Idee
              </p>
              <p className="max-w-xs text-[11px] leading-relaxed text-stone-400">
                Was würde {data.person.name} freuen? Jede Idee hilft dem, der
                das Geschenk besorgt.
              </p>
            </Card>
          )}

          {data.canPropose && (
            <button
              type="button"
              onClick={() => setProposing(true)}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-[12px] font-semibold text-stone-500 transition-colors hover:border-terracotta-400 hover:text-terracotta-600',
                PRESSABLE,
              )}
            >
              <Plus size={14} />
              Idee vorschlagen
            </button>
          )}
        </div>
      </section>

      {gifted.length > 0 && (
        <section>
          <SectionTitle>Schon einmal geschenkt</SectionTitle>
          {/* Sie stehen hier, damit niemand dasselbe zweimal aussucht — und
              nicht, weil sie noch zur Wahl stünden. Auswählen kann man sie
              trotzdem: Ein Buch war vor drei Jahren richtig und ist es
              vielleicht wieder. */}
          <div className="space-y-3">{gifted.map(card)}</div>
        </section>
      )}

      {data.canNudge && <NudgeCard occasionId={occasionId} data={data} />}

      <ProposeSheet
        occasionId={occasionId}
        name={data.person.name}
        open={proposing}
        onClose={() => setProposing(false)}
      />
    </>
  );
}

/**
 * Wer besorgt — und was dabei herausgekommen ist.
 *
 * Das Ergebnis steht hier für **alle** außer dem Geburtstagskind —
 * „worauf lasse ich mich ein" ist gerade die Frage derer, die mitzahlen.
 */
function GiftStatusCard({ data }: { data: BirthdayDetail }) {
  return (
    <Card className="space-y-3">
      {data.responsible ? (
        <div className="flex items-center gap-3">
          <Avatar person={data.responsible} size="md" />
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
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-stone-400">
          Für das Geschenk ist niemand eingeteilt. Vorschlagen darf trotzdem
          jede:r — jemand nimmt es sicher mit.
        </p>
      )}

      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border px-3 py-2.5',
          data.gift
            ? 'border-success-line bg-success-bg'
            : 'border-dashed border-line-strong',
        )}
      >
        <Gift
          size={16}
          className={cn(
            'shrink-0',
            data.gift ? 'text-success' : 'text-stone-300',
          )}
        />
        <div className="min-w-0 flex-1">
          {data.gift ? (
            <p className="text-sm text-stone-700">
              Es wird:{' '}
              <span className="font-bold text-stone-900">{data.gift.text}</span>
            </p>
          ) : (
            <p className="text-[12px] text-stone-400">Noch nichts ausgesucht</p>
          )}
        </div>
        {data.priceCents !== null && (
          <span className="shrink-0 text-sm font-bold text-stone-700">
            {euros.format(data.priceCents / 100)}
          </span>
        )}
      </div>
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

/**
 * Ein Vorschlag — oben die Idee, unten das Gespräch darüber.
 *
 * **Wegnehmen per Wisch**, wie überall in den Listen dieser App, und nur bei
 * den eigenen (`canRemove`) — ein Papierkorb an fremden antwortete nur mit
 * einer Fehlermeldung.
 *
 * Der Wisch gilt nur dem **oberen Teil**. Die Kommentare darunter lassen sich
 * selbst wegwischen, und zwei Gesten ineinander bräuchten eine Regel, welche
 * gewinnt.
 */
function IdeaCard({
  occasionId,
  idea,
  selected,
  canDecide,
  canComment,
}: {
  occasionId: string;
  idea: GiftIdea;
  selected: boolean;
  canDecide: boolean;
  canComment: boolean;
}) {
  const vote = useVoteGiftIdea(occasionId);
  const remove = useRemoveGiftIdea(occasionId);
  const decide = useDecideGift(occasionId);
  const confirm = useConfirm();
  const toast = useToast();
  const [composing, setComposing] = useState(false);

  const removeIdea = async () => {
    const ok = await confirm({
      title: 'Vorschlag wegnehmen?',
      body: `„${idea.text}" verschwindet für alle, samt den Kommentaren darunter.`,
      confirmLabel: 'Wegnehmen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(idea.id, {
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const head = (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-bold text-stone-800">
          {idea.text}
        </p>
        {selected && (
          <Badge variant="terracotta">
            <Check size={11} />
            ausgesucht
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-[11px] text-stone-400">
          <Avatar person={idea.proposedBy} size="xs" zoomable={false} />
          {idea.proposedBy?.name ?? 'Ehemaliges Mitglied'}
          {idea.giftedOn && ' · schon geschenkt'}
        </span>
        <ShopLink url={idea.url} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={vote.isPending}
          aria-pressed={idea.votedByMe}
          aria-label={
            idea.votedByMe ? 'Zustimmung zurücknehmen' : 'Finde ich gut'
          }
          onClick={() =>
            vote.mutate({ ideaId: idea.id, approve: !idea.votedByMe })
          }
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50',
            PRESSABLE,
            idea.votedByMe
              ? 'border-terracotta-500 bg-terracotta-500 text-white'
              : 'border-line text-stone-500 hover:border-terracotta-400',
          )}
        >
          <ThumbsUp size={13} />
          {idea.votes}
        </button>

        {canComment && (
          <button
            type="button"
            onClick={() => setComposing((current) => !current)}
            aria-expanded={composing}
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-stone-500 transition-colors hover:border-terracotta-400',
              PRESSABLE,
            )}
          >
            <MessageCircle size={13} />
            {idea.comments.length > 0 ? idea.comments.length : 'Kommentieren'}
          </button>
        )}

        {canDecide && (
          <Button
            variant={selected ? 'ghost' : 'secondary'}
            size="sm"
            className="ml-auto"
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
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border bg-card shadow-sm shadow-stone-200/40',
        selected
          ? 'border-terracotta-400 ring-1 ring-terracotta-400'
          : 'border-line',
      )}
    >
      {idea.canRemove ? (
        <SwipeActions
          actions={[
            {
              icon: <Trash2 size={15} />,
              label: `${idea.text} wegnehmen`,
              tone: 'danger',
              disabled: remove.isPending,
              onClick: () => void removeIdea(),
            },
          ]}
        >
          {head}
        </SwipeActions>
      ) : (
        head
      )}

      {(idea.comments.length > 0 || composing) && (
        <Comments
          occasionId={occasionId}
          idea={idea}
          composing={composing && canComment}
          onSent={() => setComposing(false)}
        />
      )}
    </div>
  );
}

/**
 * Das Gespräch unter einem Vorschlag — „gibt's auch in Blau", „hat sie schon".
 *
 * Ein abgesetzter Streifen und kein eigener Kasten: Es gehört zu dieser einen
 * Idee und zu keiner anderen. Abgesetzt mit einer gestrichelten Linie und nicht
 * mit einer Tönung — die wischbare Zeile trägt die Fläche der Karte, und eine
 * zweite Farbe darunter schaute beim Zurückschnappen durch. Die eigenen
 * Kommentare lassen sich wegwischen.
 */
function Comments({
  occasionId,
  idea,
  composing,
  onSent,
}: {
  occasionId: string;
  idea: GiftIdea;
  composing: boolean;
  onSent: () => void;
}) {
  const comment = useCommentGiftIdea(occasionId);
  const toast = useToast();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Wer „Kommentieren" drückt, will schreiben — das Feld bekommt gleich den
  // Fokus, statt einen zweiten Tipp zu verlangen.
  useEffect(() => {
    if (composing) input.current?.focus();
  }, [composing]);

  const send = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;

    comment.mutate(
      { ideaId: idea.id, text: trimmed },
      {
        onSuccess: () => {
          setText('');
          onSent();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-2.5 border-t border-dashed border-line-strong px-4 py-3">
      {idea.comments.map((entry) => (
        <CommentRow
          key={entry.id}
          occasionId={occasionId}
          ideaId={idea.id}
          entry={entry}
        />
      ))}

      {composing && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <TextInput
            ref={input}
            value={text}
            maxLength={1000}
            placeholder="Was meinst du dazu?"
            aria-label="Kommentar"
            onChange={(event) => setText(event.target.value)}
            className="flex-1"
          />
          <IconButton
            type="submit"
            label="Senden"
            disabled={text.trim() === '' || comment.isPending}
            className="shrink-0 bg-terracotta-500 text-white hover:bg-terracotta-700 hover:text-white disabled:opacity-50"
          >
            <SendHorizontal size={16} />
          </IconButton>
        </form>
      )}
    </div>
  );
}

function CommentRow({
  occasionId,
  ideaId,
  entry,
}: {
  occasionId: string;
  ideaId: string;
  entry: GiftIdeaComment;
}) {
  const remove = useRemoveGiftIdeaComment(occasionId);
  const toast = useToast();

  const row = (
    <div className="flex items-start gap-2.5 py-1">
      <Avatar
        person={entry.author}
        size="xs"
        zoomable={false}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-stone-400">
          <span className="font-bold text-stone-700">
            {entry.author?.name ?? 'Ehemaliges Mitglied'}
          </span>{' '}
          · {formatTimestamp(entry.createdAt)}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed whitespace-pre-line text-stone-600">
          {entry.text}
        </p>
      </div>
    </div>
  );

  if (!entry.mine) return row;

  return (
    <SwipeActions
      className="-mx-2 rounded-md"
      actions={[
        {
          icon: <Trash2 size={14} />,
          label: 'Kommentar löschen',
          tone: 'danger',
          disabled: remove.isPending,
          onClick: () =>
            remove.mutate(
              { ideaId, commentId: entry.id },
              { onError: (error) => toast.error(errorMessage(error)) },
            ),
        },
      ]}
    >
      <div className="px-2">{row}</div>
    </SwipeActions>
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
      className="flex w-fit items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-terracotta-600 hover:border-terracotta-400 hover:bg-terracotta-50"
    >
      Ansehen
      <ExternalLink size={11} />
    </a>
  );
}

/**
 * Eine Idee vorschlagen — in einem Sheet, nicht in der Liste.
 *
 * Inline schob das Formular die Vorschläge weg, und auf dem Telefon lag das
 * Feld hinter der Tastatur. Dasselbe Muster wie bei den Ideen der Gruppe.
 */
function ProposeSheet({
  occasionId,
  name,
  open,
  onClose,
}: {
  occasionId: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const propose = useProposeGiftIdea(occasionId);
  const toast = useToast();
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  const close = () => {
    setText('');
    setUrl('');
    onClose();
  };

  const save = () =>
    propose.mutate(
      { text: text.trim(), url: url.trim() === '' ? null : url.trim() },
      {
        onSuccess: close,
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Idee vorschlagen"
      subtitle={`Was würde ${name} freuen? Nur ${name} selbst sieht es nicht.`}
      footer={
        <Button
          className="w-full"
          disabled={text.trim() === ''}
          loading={propose.isPending}
          onClick={save}
        >
          Vorschlagen
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Was schlägst du vor?">
          <TextInput
            value={text}
            maxLength={500}
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
      </div>
    </Sheet>
  );
}

/**
 * „Noch zu wenig Ideen?" — der Knopf für den, der das Geschenk besorgt.
 *
 * Unten, weil er die Antwort auf das ist, was man darüber gelesen hat: Erst
 * sieht man, was da ist, dann entscheidet man, ob es reicht. Höchstens einmal
 * am Tag — danach steht er ausgegraut da und sagt, warum.
 */
function NudgeCard({
  occasionId,
  data,
}: {
  occasionId: string;
  data: BirthdayDetail;
}) {
  const nudge = useNudgeBirthday(occasionId);
  const confirm = useConfirm();
  const toast = useToast();

  const send = async () => {
    const ok = await confirm({
      title: 'Alle an die Vorschläge erinnern?',
      body: `Alle außer ${data.person.name} bekommen eine Nachricht, dass du dich über Ideen freust.`,
      confirmLabel: 'Erinnern',
    });
    if (!ok) return;

    nudge.mutate(undefined, {
      onSuccess: () => toast.success('Erinnerung verschickt.'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <Card className="flex flex-col items-center gap-3 border-dashed bg-transparent py-6 text-center shadow-none">
      <span className="flex size-11 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-600">
        <BellRing size={20} />
      </span>
      <div>
        <p className="text-sm font-bold text-stone-800">Noch zu wenig Ideen?</p>
        <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-stone-400">
          Bitte die anderen um Vorschläge für {data.person.name}. Sie bekommen
          eine Nachricht — {data.person.name} nicht.
        </p>
      </div>
      <Button
        variant={data.nudgedToday ? 'ghost' : 'primary'}
        disabled={data.nudgedToday}
        loading={nudge.isPending}
        onClick={() => void send()}
      >
        {data.nudgedToday ? (
          <>
            <Check size={14} /> Heute schon erinnert
          </>
        ) : (
          <>
            <BellRing size={14} /> Alle an die Vorschläge erinnern
          </>
        )}
      </Button>
    </Card>
  );
}
