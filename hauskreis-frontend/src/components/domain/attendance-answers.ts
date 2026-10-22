'use client';

/**
 * Die drei Antworten auf „bist du dabei" — wie sie heißen, aussehen und wonach
 * sie fragen.
 *
 * **Warum das eine eigene Datei ist.** Drei Stellen brauchen die Tabellen: Die Karte am Termin malt die Zeilen der
 * anderen (Farbe, Kurzform, Symbol des Satzes), Balken und Terminkarte die
 * eigene Antwort (Beschriftung, Symbol, Beispiel). Eine Komponente, die eine
 * andere importiert, um an eine Konstante zu kommen, ist eine Abhängigkeit, die
 * nichts mit dem Bild zu tun hat — und drei Kopien wären drei Meinungen darüber,
 * welche Farbe „abgesagt" hat.
 *
 * Sie liegt neben `use-attendance-answer.ts`: Dort steht, was eine Antwort
 * *tut*, hier, wie sie *heißt*.
 */
import { Check, Clock, HelpCircle, MessageSquare, X } from 'lucide-react';
import type { AttendanceStatus } from '@/lib/api/types';

/**
 * Wie die drei Antworten heißen und aussehen.
 *
 * **`label` ist ein Verb, `short` ein Zustand** — und das ist kein Versehen,
 * sondern die ganze Unterscheidung: `label` steht auf einem Knopf, den man
 * drückt („Zusagen"), `short` in einer Zeile über jemand anderen, die etwas
 * feststellt („Dabei"). „Dabei" als Aufforderung zu lesen müsste man erst
 * lernen.
 *
 * Der aktive Knopf färbt sich **nach seiner Bedeutung** und nicht einheitlich
 * terracotta: zusagen ist die gute Nachricht, absagen die, die dem Gastgeber
 * etwas wegnimmt, „weiß nicht" die offene. Drei gleich getönte Knöpfe hätten
 * das eingeebnet.
 *
 * **Die Reihenfolge stellt die zustimmende Antwort nach rechts** — wie in jeder
 * Rückfrage der App, wo links „Abbrechen" steht und rechts das Verb
 * (`confirm.tsx`). Sie gilt für Balken und Terminkarte gemeinsam: Es ist eine
 * Liste, keine zwei.
 */
export const ANSWERS: {
  status: AttendanceStatus;
  label: string;
  short: string;
  icon: typeof Check;
  active: string;
  dot: string;
  text: string;
}[] = [
  {
    status: 'ABSENT',
    label: 'Absagen',
    short: 'Abgesagt',
    icon: X,
    active: 'border-alert-line bg-alert-bg text-alert',
    dot: 'bg-alert',
    text: 'text-alert',
  },
  {
    status: 'UNKNOWN',
    label: 'Weiß nicht',
    short: 'Unsicher',
    icon: HelpCircle,
    active: 'border-terracotta-100 bg-terracotta-50 text-terracotta-700',
    dot: 'bg-warn',
    text: 'text-warn',
  },
  {
    status: 'ATTENDING',
    label: 'Zusagen',
    short: 'Dabei',
    icon: Check,
    active: 'border-success-line bg-success-bg text-success',
    dot: 'bg-success',
    text: 'text-success',
  },
];

/** Dieselben drei, nachschlagbar. */
export const ANSWER = Object.fromEntries(
  ANSWERS.map((answer) => [answer.status, answer]),
) as Record<AttendanceStatus, (typeof ANSWERS)[number]>;

/**
 * Beschriftung und Beispiel je Status — dieselbe Spalte, andere Frage.
 *
 * Eine Spalte für alle drei (`meeting_attendance.note`) und nicht drei: Es ist
 * immer dieselbe Sache, was jemand den anderen zu diesem Abend noch sagen will.
 * Nur die Beschriftung wechselt. Eine **Verspätung** steht daneben in Minuten
 * (`lateMinutes`), damit die Liste sie von einer bloßen Info unterscheiden
 * kann.
 */
export const NOTE_FIELD: Record<
  AttendanceStatus,
  { label: string; placeholder: string; icon: typeof Clock }
> = {
  ATTENDING: {
    label: 'Info (optional)',
    placeholder: 'z.B. Bringe noch jemanden mit…',
    icon: MessageSquare,
  },
  UNKNOWN: {
    label: "Woran liegt's? (hilft bei der Planung)",
    placeholder: 'z.B. Muss schauen, wann Feierabend ist…',
    icon: HelpCircle,
  },
  ABSENT: {
    label: 'Grund (optional)',
    placeholder: 'z.B. Bin im Urlaub, euch viel Spaß!',
    icon: MessageSquare,
  },
};

/** Wie viel später man kommen kann — die Chips unter „Verspätung". */
export const LATE_OPTIONS = [15, 30, 45, 60] as const;

/** Das Symbol einer Verspätung, in der Liste wie im Formular. */
export const LATE_ICON = Clock;

/** „ca. 15 Min später", „ca. 1 Std später". */
export function lateLabel(minutes: number): string {
  if (minutes % 60 === 0) return `ca. ${minutes / 60} Std später`;
  return `ca. ${minutes} Min später`;
}

/**
 * Die eigene Antwort in einer Zeile — Verspätung und Satz, wie sie auf der
 * Terminkarte, im Kalender und im eingeklappten Antwort-Balken stehen.
 * `null`, wenn nichts dazugesagt ist.
 */
export function ownAnswerLine(
  row:
    | {
        note: string | null;
        lateMinutes: number | null;
      }
    | null
    | undefined,
): string | null {
  if (!row) return null;
  const parts = [
    row.lateMinutes !== null ? lateLabel(row.lateMinutes) : null,
    row.note ? `„${row.note}"` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}
