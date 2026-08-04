'use client';

/**
 * „Bist du dabei?" — direkt in der Terminkarte.
 *
 * Bisher stand die Frage nur auf der Detailseite. Wer die Liste durchgeht, um
 * für die nächsten Wochen zu antworten, musste jeden Abend einzeln öffnen und
 * wieder zurück — sechsmal hin und her für sechs Antworten.
 *
 * Zwei Knöpfe statt eines durchwechselnden: der Zustand ist ohne Erklärung
 * ablesbar, und Absagen kostet einen Tipp und nicht zwei. Ein zweiter Tipp auf
 * den gewählten nimmt die Antwort zurück — „weiß noch nicht" ist ein gültiger
 * Zwischenstand und braucht keinen dritten Knopf.
 *
 * An dem Platz, wo vorher der Gastgeber-Avatar stand. Der ist nicht
 * verschwunden: er steht als Rollen-Chip in der Fußzeile derselben Karte, und
 * dort steht er ohnehin doppelt genauer.
 */
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AttendanceStatus } from '@/lib/api/types';

export function AttendanceToggle({
  status,
  onAnswer,
}: {
  status: AttendanceStatus;
  onAnswer: (next: AttendanceStatus) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Answer
        answer="ATTENDING"
        current={status}
        label="Ich bin dabei"
        onAnswer={onAnswer}
      >
        <Check size={16} />
      </Answer>
      <Answer
        answer="ABSENT"
        current={status}
        label="Ich kann nicht"
        onAnswer={onAnswer}
      >
        <X size={16} />
      </Answer>
    </div>
  );
}

const TONES = {
  ATTENDING: 'border-music-line bg-music-bg text-music',
  ABSENT: 'border-alert-line bg-alert-bg text-alert',
} as const;

function Answer({
  answer,
  current,
  label,
  onAnswer,
  children,
}: {
  answer: 'ATTENDING' | 'ABSENT';
  current: AttendanceStatus;
  label: string;
  onAnswer: (next: AttendanceStatus) => void;
  children: React.ReactNode;
}) {
  const chosen = current === answer;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={chosen}
      onClick={(event) => {
        // Der Knopf sitzt in einem Link. Ohne das führt jeder Tipp zusätzlich
        // auf die Detailseite — und die Antwort wäre nicht mehr zu sehen.
        event.preventDefault();
        event.stopPropagation();
        // Nochmal auf den gewählten Knopf heißt: doch noch nicht entschieden.
        onAnswer(chosen ? 'UNKNOWN' : answer);
      }}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
        chosen
          ? TONES[answer]
          : 'border-line bg-card text-stone-300 hover:border-stone-300 hover:text-stone-500',
      )}
    >
      {children}
    </button>
  );
}
