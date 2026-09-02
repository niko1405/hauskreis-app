'use client';

/**
 * Die eigenen Aufgaben — **zwei Register**, nicht eine Liste mit Aufklapper.
 *
 * „Nächstes" sind die Rollen an genau dem Abend, der als Nächstes ansteht —
 * nicht die der laufenden Kalenderwoche. Der Hauskreis ist dienstags: ab
 * Mittwoch wäre eine Kalenderwoche fast immer leer, und der Abend, um den es
 * tatsächlich geht, stünde hinten. Der Bezugspunkt ist der Termin, nicht der
 * Wochenwechsel.
 *
 * „Zukünftige" ist bewusst kein vollständiger Kalender, sondern je Kategorie
 * die *nächste* danach. Wer dreimal in acht Wochen hostet, muss das hier nicht
 * dreimal lesen — die zweite und dritte Zeile ändern nichts an dem, was man
 * heute tun kann. Der ganze Vorlauf steht in der Planungstabelle.
 *
 * **Warum Register und kein Aufklapper.** Vorher lag das Spätere unter einem
 * „Weitere (2)"-Balken am Fuß der Karte. Das stellte die beiden Hälften
 * untereinander, als wäre die zweite ein Anhang der ersten — es sind aber zwei
 * gleichrangige Fragen: „Was ist am Dienstag?" und „Was kommt danach?". Als
 * Register stehen sie nebeneinander, und die Zahl daneben beantwortet die
 * zweite schon halb, ohne dass man umschaltet.
 */
import { CalendarOff, Coffee } from 'lucide-react';
import Link from '@/components/ui/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { PRESSABLE } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROLE_ICON, ROLE_STYLE } from '@/components/domain/role-badge';
import { formatDay, formatRelativeDay } from '@/lib/date';
import { ROLE_LABEL } from '@/lib/meeting';
import { cn } from '@/lib/cn';
import type { Assignment, AssignmentRole } from '@/lib/api/types';

/**
 * Was unter „Zukünftige" auftauchen kann — je Sorte die nächste.
 *
 * Die Gebetsbuddys lässt schon der Server weg (mit jemandem gepaart zu sein ist
 * keine Aufgabe). Der **Geschenk-Termin** steht dagegen bewusst dabei: Er hängt
 * an keinem Abend, kann also nie im vorderen Register landen, und ohne diesen
 * Eintrag wäre er auf dem Startbildschirm gar nicht zu sehen — obwohl er die
 * Rolle mit der längsten Vorlaufzeit ist.
 */
const CATEGORIES: Exclude<AssignmentRole, 'PRAYER_BUDDY'>[] = [
  'HOST',
  'TOPIC',
  'SONG',
  // Fehlte hier einmal, und damit stand ein Testimony an einem *späteren*
  // Abend nirgends auf dem Startbildschirm — ausgerechnet die Rolle, für die
  // man am meisten Vorlauf braucht. Der Typ deckt das nicht auf: `Exclude`
  // verlangt nicht, dass die Liste vollständig ist.
  'TESTIMONY',
  'BIRTHDAY_GIFT',
];

type Tab = 'next' | 'later';

export function MyRoles({
  roles,
  nextMeetingId,
}: {
  roles: Assignment[];
  nextMeetingId: string | null;
}) {
  const [tab, setTab] = useState<Tab>('next');

  // Der Vergleich nur mit gesetztem `nextMeetingId`: sonst würde `null === null`
  // eine terminlose Rolle zur Rolle „am nächsten Treffen" machen.
  const atNextMeeting = nextMeetingId
    ? roles.filter((role) => role.meetingId === nextMeetingId)
    : [];
  // `roles` kommt chronologisch — das erste Vorkommen *ist* das nächste.
  //
  // Die Klammer um `nextMeetingId` ist keine Förmlichkeit: Stand hier nur
  // `role.meetingId !== nextMeetingId`, dann fiel ohne geplanten Termin
  // (`null`) ausgerechnet der **Geschenk-Termin** heraus — der hängt an keinem
  // Abend und trägt selbst `null`, `null !== null` ist falsch. Er verschwand
  // damit aus beiden Registern, obwohl er die Rolle mit der längsten
  // Vorlaufzeit ist. Ohne nächsten Abend ist schlicht alles „danach".
  const later = CATEGORIES.map((kind) =>
    roles.find(
      (role) =>
        (nextMeetingId === null || role.meetingId !== nextMeetingId) &&
        role.role === kind,
    ),
  ).filter((role) => role !== undefined);

  const shown = tab === 'next' ? atNextMeeting : later;

  return (
    <>
      <div
        role="tablist"
        aria-label="Zeitraum"
        className="mb-3 flex gap-1 rounded-md border border-line bg-canvas p-1"
      >
        <Segment
          active={tab === 'next'}
          onSelect={() => setTab('next')}
          label="Nächstes"
        />
        <Segment
          active={tab === 'later'}
          onSelect={() => setTab('later')}
          label="Zukünftige"
          // Nur wenn es etwas zu zählen gibt: „Zukünftige (0)" wäre eine Zahl,
          // die nichts zu sagen hat.
          count={later.length > 0 ? later.length : undefined}
        />
      </div>

      <div
        role="tabpanel"
        aria-label={tab === 'next' ? 'Nächstes' : 'Zukünftige'}
      >
        {shown.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line">
              {shown.map((role) => (
                <li key={roleKey(role)}>
                  <RoleRow role={role} urgent={tab === 'next'} />
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Empty tab={tab} noMeeting={nextMeetingId === null} />
        )}
      </div>
    </>
  );
}

function Segment({
  active,
  onSelect,
  label,
  count,
}: {
  active: boolean;
  onSelect: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-sm border py-1.5 text-xs font-bold transition-colors',
        active
          ? 'border-line-strong bg-card text-stone-800 shadow-sm'
          : 'border-transparent text-stone-400 hover:text-stone-600',
      )}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1 opacity-60">({count})</span>
      )}
    </button>
  );
}

/**
 * Nichts eingeteilt — und das ist eine gute Nachricht, also klingt es auch so.
 *
 * Gestrichelt und ohne Schatten wie der leere Actionstep: Was noch nicht da
 * ist, soll nicht aussehen wie etwas, das da ist.
 *
 * Der dritte Fall ist der, den man leicht übersieht: Ohne geplanten Termin
 * wäre „Du hast frei" eine Aussage über einen Abend, den es gar nicht gibt.
 */
function Empty({ tab, noMeeting }: { tab: Tab; noMeeting: boolean }) {
  const {
    icon: Icon,
    title,
    hint,
  } = tab === 'later'
    ? {
        icon: Coffee,
        title: 'Nichts in Sicht',
        hint: 'Weiter vorn bist du noch nirgends eingeteilt.',
      }
    : noMeeting
      ? {
          icon: CalendarOff,
          title: 'Kein Termin geplant',
          hint: 'Sobald der nächste Abend steht, siehst du hier deine Rollen.',
        }
      : {
          icon: Coffee,
          title: 'Du hast frei!',
          hint: 'Lehn dich zurück und genieß das Treffen.',
        };

  return (
    <Card className="border-dashed bg-transparent shadow-none">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-stone-300">
          <Icon size={22} />
        </span>
        <p className="text-sm font-bold text-stone-700">{title}</p>
        <p className="text-xs text-stone-400">{hint}</p>
      </div>
    </Card>
  );
}

/** Rolle *und* Abend: dieselbe Rolle kann an mehreren Terminen dranstehen. */
function roleKey(role: Assignment): string {
  return `${role.role}-${role.date}-${role.meetingId ?? role.occasionId}`;
}

function RoleRow({ role, urgent }: { role: Assignment; urgent: boolean }) {
  const Icon = ROLE_ICON[role.role];
  const Style = ROLE_STYLE[role.role];

  const content = (
    <span className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            Style,
          )}
        >
          <Icon size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-stone-800">
            {/* Die Rolle zuerst: „Bei Chris" allein sagt nicht, dass *du*
                hostest. Das Label ist der Zusatz, nicht der Ersatz. */}
            {ROLE_LABEL[role.role]}
            {role.label && (
              <span className="font-medium text-stone-500">
                {' '}
                · {role.label}
              </span>
            )}
          </span>
          <span className="block text-[11px] text-stone-500">
            {formatDay(role.date)}
          </span>
        </span>
      </span>
      <Badge variant={urgent ? 'terracotta' : 'neutral'}>
        {formatRelativeDay(role.date)}
      </Badge>
    </span>
  );

  // Die Zeile trägt ihren eigenen Rand nicht mehr — sie liegt jetzt *in* einer
  // Karte, und ein Rahmen im Rahmen war genau das Unruhige daran.
  // Zwei Sorten Ziel: Termin-Rollen führen zum Abend, der Geschenk-Termin zu
  // seinem Geburtstag. Ohne Ziel bleibt es eine Zeile — ein Link ins Nichts
  // wäre schlechter als keiner.
  const href = role.meetingId
    ? `/termin?id=${role.meetingId}`
    : role.occasionId
      ? `/geburtstag?id=${role.occasionId}`
      : null;

  if (!href) {
    return <div className="px-4 py-3.5">{content}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        'block px-4 py-3.5 transition-colors hover:bg-canvas active:bg-canvas',
        PRESSABLE,
      )}
    >
      {content}
    </Link>
  );
}
