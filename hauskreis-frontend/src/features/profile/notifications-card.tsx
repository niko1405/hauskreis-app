'use client';

/**
 * Benachrichtigungen im Profil — das Gerät und der Weg zu den Präferenzen.
 *
 * **Was hier steht, stellt man einmal ein.** Ob dieses Gerät überhaupt
 * Nachrichten bekommt, und ob die Zustellung funktioniert. Beides ist eine
 * Frage an das Telefon in der Hand und nicht an den Hauskreis — und beides
 * beantwortet man einmal und danach nie wieder.
 *
 * **Was man nachschlägt, steht auf einem eigenen Bildschirm.** Die zwanzig
 * Arten standen hier als eine ungegliederte Liste, mitten zwischen
 * Abwesenheiten und Konto. Zwanzig Schalter untereinander sind keine Liste
 * mehr, sondern eine Wand: Man findet den einen nicht, den man sucht, und
 * scrollt an allem anderen vorbei. Sie liegen jetzt unter
 * `/benachrichtigungen`, nach Bereichen sortiert und durchsuchbar.
 */
import { Bell, BellOff, BellRing, ChevronRight, Send } from 'lucide-react';
import Link from '@/components/ui/link';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useNotificationSettings,
  useSendTestNotification,
} from '@/lib/api/hooks';
import { usePushSetup } from '@/lib/push/use-push-setup';

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

  const alle = settings.data ?? [];
  const an = alle.filter((setting) => setting.enabled).length;

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
        ) : push.subscribedHere ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              Dieses Gerät bekommt Benachrichtigungen
              {push.deviceCount > 1 &&
                ` (insgesamt ${push.deviceCount} Geräte)`}
              .
            </p>
            <Button
              variant="ghost"
              size="sm"
              loading={push.unsubscribe.isPending}
              onClick={() => push.unsubscribe.mutate(undefined)}
            >
              <BellOff size={14} />
              Aus
            </Button>
          </div>
        ) : (
          <Button
            className="w-full"
            loading={push.subscribe.isPending}
            onClick={() => push.subscribe.mutate(undefined)}
          >
            <BellRing size={15} />
            Auf diesem Gerät einschalten
          </Button>
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

        {push.subscribedHere && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={test.isPending}
            onClick={() =>
              test.mutate(undefined, {
                onSuccess: (result) =>
                  toast.success(
                    result.delivered > 0
                      ? 'Test verschickt — sie sollte gleich da sein.'
                      : 'Nichts zugestellt. Ist das Abo noch gültig?',
                  ),
              })
            }
          >
            <Send size={13} />
            Test-Benachrichtigung
          </Button>
        )}
      </Card>
    </section>
  );
}
