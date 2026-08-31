'use client';

/**
 * Die drei Antworten auf „bist du dabei" — wie sie heißen, aussehen und wonach
 * sie fragen.
 *
 * **Warum das eine eigene Datei ist.** Die Tabellen standen in
 * `attendance-card.tsx`, solange die eigene Antwort dort wohnte. Seit sie unten
 * am Bildschirm steht (`answer-bar.tsx`), brauchen sie zwei Stellen: Die Karte
 * malt die Zeilen der anderen (Farbe, Kurzform, Symbol des Satzes), der Balken
 * die eigene Antwort (Beschriftung, Beispiel). Eine Komponente, die eine andere
 * importiert, um an eine Konstante zu kommen, ist eine Abhängigkeit, die nichts
 * mit dem Bild zu tun hat — und zwei Kopien wären zwei Meinungen darüber, welche
 * Farbe „abgesagt" hat.
 *
 * Sie liegt neben `use-attendance-answer.ts`: Dort steht, was eine Antwort
 * *tut*, hier, wie sie *heißt*.
 */
import { Clock, HelpCircle, MessageSquare } from 'lucide-react';
import type { AttendanceStatus } from '@/lib/api/types';

/**
 * Wie die drei Antworten heißen und aussehen.
 *
 * Der aktive Knopf färbt sich **nach seiner Bedeutung** und nicht einheitlich
 * terracotta: „dabei" ist die gute Nachricht, „nicht dabei" die, die dem
 * Gastgeber etwas wegnimmt, „weiß noch nicht" die offene. Drei gleich getönte
 * Knöpfe hätten das eingeebnet.
 *
 * Die Reihenfolge ist die der Knöpfe im Balken.
 */
export const ANSWERS: {
  status: AttendanceStatus;
  label: string;
  short: string;
  active: string;
  dot: string;
  text: string;
}[] = [
  {
    status: 'ATTENDING',
    label: 'Dabei',
    short: 'Dabei',
    active: 'border-music-line bg-music-bg text-music',
    dot: 'bg-music',
    text: 'text-music',
  },
  {
    status: 'ABSENT',
    label: 'Nicht dabei',
    short: 'Abgesagt',
    active: 'border-alert-line bg-alert-bg text-alert',
    dot: 'bg-alert',
    text: 'text-alert',
  },
  {
    status: 'UNKNOWN',
    label: 'Weiß noch nicht',
    short: 'Unsicher',
    active: 'border-terracotta-100 bg-terracotta-50 text-terracotta-700',
    dot: 'bg-topic',
    text: 'text-topic',
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
 * Nur die Beschriftung wechselt.
 */
export const NOTE_FIELD: Record<
  AttendanceStatus,
  { label: string; placeholder: string; icon: typeof Clock }
> = {
  ATTENDING: {
    label: 'Verspätung oder Info (optional)',
    placeholder: 'z.B. Komme 20 Min später…',
    icon: Clock,
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
