'use client';

/**
 * Der Einladungslink — der übliche Weg, jemanden einzuladen.
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
 * **Knapp gehalten.** Ohne Link steht da nur, wie lange er gelten soll, und ein
 * Knopf; mit Link der Link und wie er weiterkommt. Was er bewirkt, steht hinter
 * dem (i) — wer zum zweiten Mal einlädt, liest es nicht mehr.
 *
 * Aktionen wie alles in der Mitgliederverwaltung: Sie wirken sofort.
 */
import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { InfoTip } from '@/components/ui/info-tip';
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wie lange ein bestehender Link gelten sollte — fürs Erneuern.
 *
 * Erneuern fragt nicht noch einmal nach der Laufzeit: Wer einen Link für einen
 * Tag gemacht hat, will den neuen auch für einen Tag. Gespeichert ist sie
 * nicht, nur Anfang und Ende; daraus gerechnet und auf die nächste der drei
 * Stufen gelegt.
 */
function validityOf(link: InviteLink): InviteLinkValidDays {
  const days =
    (new Date(link.expiresAt).getTime() - new Date(link.createdAt).getTime()) /
    DAY_MS;
  const options: InviteLinkValidDays[] = [1, 7, 30];

  return options.reduce((best, option) =>
    Math.abs(option - days) < Math.abs(best - days) ? option : best,
  );
}

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

  if (!active) {
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            Gültig für
            <InfoTip label="Einladungslink">
              Wer den Link öffnet, tritt mit einem bestehenden oder neuen Konto
              bei — immer als Mitglied. Admin-Rechte vergibst du danach in der
              Liste.
            </InfoTip>
          </p>
          <Segmented
            fill
            size="sm"
            label="Gültig für"
            value={validity}
            onChange={setValidity}
            options={[...VALIDITY]}
          />
        </div>

        <Button
          className="w-full"
          loading={replace.isPending}
          onClick={() =>
            replace.mutate(Number(validity) as InviteLinkValidDays, {
              onSuccess: () => toast.success('Link steht.'),
            })
          }
        >
          Link erstellen
        </Button>
      </div>
    );
  }

  const renew = async () => {
    // Erneuern macht den alten Link wertlos — wer ihn schon hat, steht danach
    // vor „gilt nicht mehr". Das soll niemand aus Versehen auslösen.
    const ok = await confirm({
      title: 'Link erneuern?',
      body: 'Der bisherige Link geht danach nicht mehr. Wer ihn schon bekommen, aber noch nicht benutzt hat, braucht den neuen.',
      confirmLabel: 'Erneuern',
    });
    if (!ok) return;

    replace.mutate(validityOf(link), {
      onSuccess: () => toast.success('Neuer Link steht.'),
    });
  };

  const switchOff = async () => {
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
  };

  return (
    <div className="space-y-4">
      <ActiveLink link={link} />

      {/* Klein und für sich: Beides braucht man selten, und keins davon soll
          neben „Teilen" stehen, wo der Daumen gerade ist. */}
      <div className="flex justify-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          loading={replace.isPending}
          onClick={() => void renew()}
        >
          Erneuern
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-alert"
          loading={remove.isPending}
          onClick={() => void switchOff()}
        >
          Abschalten
        </Button>
      </div>
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
      <div>
        <p className="rounded-md bg-canvas px-3 py-2 font-mono text-xs break-all text-stone-700 select-all">
          {url}
        </p>
        <p className="mt-1.5 text-[11px] text-stone-400">
          Gilt bis {formatTimestamp(link.expiresAt)}
          {link.joinCount > 0 && ` · ${link.joinCount}× benutzt`}
        </p>
      </div>
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
