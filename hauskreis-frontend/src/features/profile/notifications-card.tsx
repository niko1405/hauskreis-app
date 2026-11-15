'use client';

/**
 * Benachrichtigungen im Profil — das Gerät und der Weg zu den Präferenzen.
 *
 * **Was hier steht, stellt man einmal ein.** Ob dieses Gerät überhaupt
 * Nachrichten bekommt, und ob die Zustellung funktioniert. Beides ist eine
 * Frage an das Telefon in der Hand und nicht an den Hauskreis — und beides
 * beantwortet man einmal und danach nie wieder.
 *
 * **Was man nachschlägt, steht auf einem eigenen Bildschirm**: die zwanzig
 * Arten unter `/benachrichtigungen`, nach Bereichen sortiert und durchsuchbar.
 *
 * **An oder aus ist ein Schalter, und der Zustand steht groß daneben.** Ein
 * kleiner „Aus"-Knopf neben einem Satz in Grau ließ offen, ob gerade etwas an
 * ist. Und den Test braucht man genau einmal, nämlich gleich nach dem
 * Einschalten — deshalb fragt die App dann danach, statt dauerhaft einen Knopf
 * dafür stehen zu lassen.
 */
import { Bell, BellOff, BellRing, ChevronRight } from 'lucide-react';
import Link from '@/components/ui/link';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useNotificationSettings,
  useSendTestNotification,
} from '@/lib/api/hooks';
import { usePushSetup } from '@/lib/push/use-push-setup';
import { cn } from '@/lib/cn';

const BLOCKER_TEXT: Record<string, string> = {
  'ios-not-installed':
    'Auf dem iPhone gehen Benachrichtigungen erst, wenn die App über „Teilen → Zum Home-Bildschirm“ installiert ist.',
  unsupported: 'Dieser Browser kann keine Push-Benachrichtigungen.',
  denied:
    'Du hast Benachrichtigungen für diese Seite abgelehnt. Das lässt sich nur in den Browser-Einstellungen wieder ändern.',
  'server-disabled':
    'Im Backend ist kein VAPID-Schlüssel hinterlegt — bis dahin verschickt der Server nichts.',
};

export function NotificationsCard() {
  const push = usePushSetup();
  const settings = useNotificationSettings();
  const test = useSendTestNotification();
  const toast = useToast();
  const confirm = useConfirm();

  const alle = settings.data ?? [];
  const an = alle.filter((setting) => setting.enabled).length;

  const on = push.subscribedHere === true;
  const pending = push.subscribe.isPending || push.unsubscribe.isPending;

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(
          result.delivered > 0
            ? 'Test verschickt — sie sollte gleich da sein.'
            : 'Nichts zugestellt. Ist das Abo noch gültig?',
        ),
    });

  // Einschalten, und dann gleich fragen, ob es ankommt — das ist der Moment,
  // in dem man es wissen will.
  const turnOn = () =>
    push.subscribe.mutate(undefined, {
      onSuccess: async () => {
        const ok = await confirm({
          title: 'Benachrichtigungen sind an',
          body: 'Willst du gleich eine Test-Benachrichtigung schicken? Dann siehst du, ob sie auf diesem Gerät ankommt.',
          confirmLabel: 'Test schicken',
          cancelLabel: 'Nicht nötig',
        });
        if (ok) sendTest();
      },
    });

  return (
    <section>
      <SectionTitle>Benachrichtigungen</SectionTitle>
      <Card className="space-y-5">
        {push.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : push.blocker ? (
          <p className="rounded-md bg-warn-bg p-3 text-xs leading-relaxed text-warn">
            {BLOCKER_TEXT[push.blocker]}
          </p>
        ) : (
          // Eine Zeile, deren Schalter man sofort sieht: grün getönt mit
          // klingelnder Glocke, wenn an — gedämpft und durchgestrichen, wenn
          // aus. Die ganze Zeile ist das Label, ein Tipp auf den Text legt um.
          <label className="flex cursor-pointer items-center gap-4">
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                on
                  ? 'border-success-line bg-success-bg text-success'
                  : 'border-line bg-canvas text-stone-400',
              )}
            >
              {on ? <BellRing size={20} /> : <BellOff size={20} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-stone-900">
                {on ? 'Benachrichtigungen an' : 'Benachrichtigungen aus'}
              </span>
              <span className="mt-0.5 block text-xs text-stone-400">
                {on
                  ? `Dieses Gerät bekommt sie${
                      push.deviceCount > 1
                        ? ` (insgesamt ${push.deviceCount} Geräte)`
                        : ''
                    }.`
                  : 'Auf diesem Gerät kommt nichts an.'}
              </span>
            </span>
            <Switch
              checked={on}
              disabled={pending}
              onChange={(next) =>
                next ? turnOn() : push.unsubscribe.mutate(undefined)
              }
            />
          </label>
        )}

        {/* Der Weg zur Liste, nicht die Liste. Die Zahl darunter ist der Grund,
            warum man überhaupt hinsieht: Sie beantwortet „habe ich eigentlich
            etwas abgeschaltet?", ohne dass man dafür scrollen muss. */}
        <Link
          href="/benachrichtigungen"
          className="flex items-center justify-between gap-3 border-t border-line pt-4 transition-colors hover:text-terracotta-500"
        >
          <span className="shrink-0 text-stone-400">
            <Bell size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-stone-800">Präferenzen</p>
            <p className="text-[11px] text-stone-400">
              {settings.isLoading || alle.length === 0
                ? 'Welche Nachrichten du bekommst — nach Bereichen sortiert'
                : `${an} von ${alle.length} Arten sind an`}
            </p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-stone-400" />
        </Link>
      </Card>
    </section>
  );
}
