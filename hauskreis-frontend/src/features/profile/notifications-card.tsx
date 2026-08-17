'use client';

/**
 * Benachrichtigungen: erst das Gerät anmelden, dann je Art einstellen, ob und
 * wie früh erinnert wird.
 *
 * Die Zeitplanung ist je Art anders aufgebaut (`schedule.kind`) — Vorlauftage,
 * fester Wochentag oder gar nichts, weil sie an ein Ereignis hängt. Die Spec
 * hat dafür zwar eine Union, aber keinen `discriminator`; unterschieden wird
 * hier von Hand.
 */
import { BellOff, BellRing, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useNotificationSettings,
  useSendTestNotification,
  useUpdateNotificationSetting,
} from '@/lib/api/hooks';
import { usePushSetup } from '@/lib/push/use-push-setup';
import { cn } from '@/lib/cn';
import type { NotificationSetting } from '@/lib/api/types';

const WEEKDAYS = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

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

  return (
    <section>
      <SectionTitle>Benachrichtigungen</SectionTitle>
      <Card className="space-y-5">
        {push.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : push.blocker ? (
          <p className="rounded-md bg-topic-bg p-3 text-xs leading-relaxed text-topic">
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

        {settings.isLoading && <Skeleton className="h-24 w-full" />}

        <ul className="space-y-4">
          {(settings.data ?? []).map((setting) => (
            <li key={setting.type}>
              <SettingRow setting={setting} />
            </li>
          ))}
        </ul>

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

function SettingRow({ setting }: { setting: NotificationSetting }) {
  const update = useUpdateNotificationSetting();

  const change = (input: Parameters<typeof update.mutate>[0]['input']) =>
    update.mutate({ type: setting.type, input });

  return (
    <div className="space-y-2">
      <label className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-stone-800">
            {setting.label}
          </span>
          <span className="block text-[11px] leading-relaxed text-stone-400">
            {setting.description}
          </span>
        </span>
        <input
          type="checkbox"
          aria-label={setting.label}
          checked={setting.enabled}
          onChange={(event) => change({ enabled: event.target.checked })}
          className="mt-1 h-5 w-5 shrink-0 rounded border-line-strong text-terracotta-500 focus:ring-terracotta-500"
        />
      </label>

      {setting.enabled && setting.schedule.kind === 'LEAD_TIME' && (
        <Select
          aria-label={`Vorlauf für ${setting.label}`}
          value={String(setting.leadDays ?? setting.schedule.defaultLeadDays)}
          onChange={(event) => change({ leadDays: Number(event.target.value) })}
          className="text-xs"
        >
          {leadDayOptions(
            setting.schedule.minLeadDays,
            setting.schedule.maxLeadDays,
          ).map((days) => (
            <option key={days} value={days}>
              {days === 0
                ? 'am selben Tag'
                : days === 1
                  ? '1 Tag vorher'
                  : `${days} Tage vorher`}
            </option>
          ))}
        </Select>
      )}

      {setting.enabled && setting.schedule.kind === 'WEEKLY' && (
        <WeekdayPicker
          label={setting.label}
          chosen={setting.weekdays}
          onChange={(weekdays) => change({ weekdays })}
        />
      )}
      {/* `kind === 'EVENT'` hat nichts einzustellen — sie kommt, wenn sie kommt. */}
    </div>
  );
}

/**
 * Mehrere Tage statt einem.
 *
 * Ein Actionstep verträgt mehr als eine Nachfrage pro Woche — einmal zur
 * Wochenmitte und einmal kurz vor dem nächsten Abend sind zwei verschiedene
 * Erinnerungen, nicht dieselbe zweimal. Deshalb Schalter statt Auswahlliste:
 * bei sieben kurzen Möglichkeiten sieht man so auf einen Blick, was gilt.
 *
 * Den letzten Tag abzuwählen ist erlaubt und heißt „wieder wie voreingestellt";
 * wer gar nichts hören will, schaltet die Art selbst aus.
 */
function WeekdayPicker({
  label,
  chosen,
  onChange,
}: {
  label: string;
  chosen: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const toggle = (day: number) => {
    const next = chosen.includes(day)
      ? chosen.filter((entry) => entry !== day)
      : [...chosen, day];

    onChange(next.toSorted((a, b) => a - b));
  };

  return (
    <div>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={`Wochentage für ${label}`}
      >
        {WEEKDAYS.map((day, index) => {
          const active = chosen.includes(index);

          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(index)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
                active
                  ? 'border-terracotta-500 bg-terracotta-500 text-white'
                  : 'border-line bg-card text-stone-500 hover:border-line-strong',
              )}
            >
              {day.slice(0, 2)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-stone-400">
        {chosen.length === 0
          ? 'Kein Tag gewählt — es gilt die Voreinstellung.'
          : `Jeden ${chosen.map((day) => WEEKDAYS[day]).join(' und ')}`}
      </p>
    </div>
  );
}

function leadDayOptions(min: number, max: number): number[] {
  const options: number[] = [];
  for (let day = min; day <= max; day += 1) options.push(day);
  return options;
}
