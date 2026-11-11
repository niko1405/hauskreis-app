'use client';

/**
 * Der Einladungslink — die zweite Art, jemanden einzuladen.
 *
 * Die E-Mail-Einladung verknüpft über eine Adresse, der Link über ein
 * Geheimnis: Wer ihn hat, tritt bei, mit welchem Konto auch immer. Dafür ist er
 * da — einmal in die WhatsApp-Gruppe, und jede:r kommt herein.
 *
 * Deshalb läuft er ab, und deshalb gibt es „Erneuern": Ein Link in einem
 * Chatverlauf bleibt dort für immer, und hinter ihm stehen Gebetsanliegen.
 * Über ihn kommt man nur als Mitglied herein; Admin-Rechte vergibt man danach
 * in der Liste.
 *
 * Aktionen wie alles in der Mitgliederverwaltung: Sie wirken sofort.
 */
import { Copy, Link2Off, RefreshCw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Segmented } from '@/components/ui/segmented';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useInviteLink,
  useRemoveInviteLink,
  useReplaceInviteLink,
} from '@/lib/api/hooks';
import type { InviteLink, InviteLinkValidDays } from '@/lib/api/types';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { formatTimestamp } from '@/lib/date';

const VALIDITY = [
  { value: '1', label: '1 Tag' },
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
] as const;

type Validity = (typeof VALIDITY)[number]['value'];

export function InviteLinkPanel() {
  const state = useInviteLink();
  const replace = useReplaceInviteLink();
  const remove = useRemoveInviteLink();
  const confirm = useConfirm();
  const toast = useToast();
  const [validity, setValidity] = useState<Validity>('7');

  if (state.isLoading) return <Skeleton className="h-32 w-full" />;
  if (state.error) {
    return (
      <ErrorState error={state.error} onRetry={() => void state.refetch()} />
    );
  }

  const link = state.data?.link ?? null;
  const active = link !== null && new Date(link.expiresAt) > new Date();

  const create = async () => {
    // Erneuern macht den alten Link wertlos — wer ihn schon hat, steht danach
    // vor „gilt nicht mehr". Das soll niemand aus Versehen auslösen.
    if (active) {
      const ok = await confirm({
        title: 'Link erneuern?',
        body: 'Der bisherige Link geht danach nicht mehr. Wer ihn schon bekommen, aber noch nicht benutzt hat, braucht den neuen.',
        confirmLabel: 'Erneuern',
      });
      if (!ok) return;
    }

    replace.mutate(Number(validity) as InviteLinkValidDays, {
      onSuccess: () =>
        toast.success(active ? 'Neuer Link steht.' : 'Link steht.'),
    });
  };

  return (
    <div className="space-y-5">
      {active ? (
        <ActiveLink link={link} />
      ) : (
        <p className="text-sm leading-relaxed text-stone-500">
          {link
            ? `Der letzte Link ist am ${formatTimestamp(link.expiresAt)} abgelaufen.`
            : 'Es gibt gerade keinen Link.'}{' '}
          Erstell einen und teil ihn, wo eure Gruppe schreibt — wer ihn öffnet,
          kann mit einem bestehenden oder einem neuen Konto beitreten.
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-stone-500">
          {active ? 'Ein neuer Link gilt' : 'Gilt'}
        </p>
        <Segmented
          fill
          size="sm"
          label="Gültigkeit"
          value={validity}
          onChange={setValidity}
          options={[...VALIDITY]}
        />
      </div>

      <div className="flex gap-2">
        {active && (
          <Button
            variant="ghost"
            className="flex-1 text-alert"
            loading={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Link abschalten?',
                body: 'Danach führt er nirgends mehr hin. Wer schon beigetreten ist, bleibt dabei.',
                confirmLabel: 'Abschalten',
                tone: 'danger',
              });
              if (!ok) return;
              remove.mutate(undefined, {
                onSuccess: () => toast.success('Link abgeschaltet.'),
              });
            }}
          >
            <Link2Off size={14} />
            Abschalten
          </Button>
        )}
        <Button
          variant={active ? 'secondary' : 'primary'}
          className="flex-1"
          loading={replace.isPending}
          onClick={() => void create()}
        >
          <RefreshCw size={14} />
          {active ? 'Erneuern' : 'Link erstellen'}
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-stone-400">
        Über den Link kommt man als Mitglied herein; Admin-Rechte vergibst du
        danach in der Liste. Wer beitritt, steht sofort darin, und alle anderen
        bekommen Bescheid.
      </p>
    </div>
  );
}

/**
 * Der Link selbst, und wie er weiterkommt.
 *
 * „Teilen" öffnet auf dem Telefon das Menü des Systems — WhatsApp, Signal,
 * Nachrichten —, und dort will der Link hin. Wo es das nicht gibt (am
 * Rechner), bleibt „Kopieren".
 */
function ActiveLink({ link }: { link: InviteLink }) {
  const { hauskreis } = useHauskreis();
  const toast = useToast();

  // Die Adresse baut das Frontend: Unter welcher es gerade läuft, weiß nur es.
  const url = `${window.location.origin}/beitreten#${link.code}`;
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link kopiert.');
    } catch {
      toast.error(
        'Kopieren ging nicht — markier den Link und kopier ihn selbst.',
      );
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: hauskreis ? `Einladung zu „${hauskreis.name}"` : 'Einladung',
        text: hauskreis
          ? `Komm zu „${hauskreis.name}" in Acts2:`
          : 'Komm in unseren Hauskreis in Acts2:',
        url,
      });
    } catch (error) {
      // Wer das Menü wieder schließt, hat nichts falsch gemacht.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await copy();
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-canvas px-3 py-2 font-mono text-xs break-all text-stone-700 select-all">
        {url}
      </p>
      <p className="text-[11px] text-stone-400">
        Gilt bis {formatTimestamp(link.expiresAt)}
        {link.joinCount > 0 &&
          ` · ${link.joinCount === 1 ? 'einmal' : `${link.joinCount}-mal`} benutzt`}
        {link.createdBy && ` · erstellt von ${link.createdBy.name}`}
      </p>
      <div className="flex gap-2">
        {canShare && (
          <Button className="flex-1" onClick={() => void share()}>
            <Share2 size={14} />
            Teilen
          </Button>
        )}
        <Button
          variant={canShare ? 'secondary' : 'primary'}
          className="flex-1"
          onClick={() => void copy()}
        >
          <Copy size={14} />
          Kopieren
        </Button>
      </div>
    </div>
  );
}
