'use client';

/**
 * Die Anleitung zum Weiterschicken.
 *
 * **Warum es sie gibt.** Wer einen Hauskreis gründet, steht vor einer leeren
 * App und acht Leuten, denen er erklären soll, was sie damit sollen. Der Satz
 * „lies mal die Hilfe" ist keine Erklärung; ein Blatt, das man in die
 * WhatsApp-Gruppe schicken kann, schon.
 *
 * **Aus den vorhandenen Texten und nicht aus neuen.** Der Inhalt sind die
 * „Erste Schritte"-Einträge aus `faq-content.ts` — dieselben, die in der Hilfe
 * stehen. Ein zweiter Text, der dasselbe erklärt, liegt beim nächsten Umbau
 * daneben, und dann widersprechen sich Anleitung und App.
 *
 * **Gedruckt statt heruntergeladen.** Eine feste PDF-Datei müsste jemand von
 * Hand nachziehen, sobald sich etwas ändert. Der Druckdialog erzeugt sie aus
 * dieser Seite; iOS wie Android bieten darin „In Dateien sichern" an, und was
 * dabei herauskommt, ist immer der aktuelle Stand. Die Regeln dafür stehen im
 * `@media print`-Block in `globals.css`.
 */
import { Printer } from 'lucide-react';
import { BackButton } from '@/components/layout/back-button';
import { Button } from '@/components/ui/button';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { FAQ_ENTRIES } from './faq-content';
import { FaqAnswer } from './faq-answer';

export function GuideScreen() {
  const { hauskreis } = useHauskreis();

  // Die Reihenfolge der Datei ist die gedachte Reihenfolge — erst „was ist
  // das", dann anmelden, installieren, Profil, zurechtfinden.
  const steps = FAQ_ENTRIES.filter(
    (entry) => entry.category === 'start' && !entry.adminOnly,
  );

  const name = hauskreis?.name ?? 'euren Hauskreis';

  return (
    <div className="px-5 pt-safe-4 pb-10">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <BackButton fallback="/admin" />

        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} />
          Als PDF speichern
        </Button>
      </div>

      <article className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-stone-900">
            Acts2 — kurz erklärt
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            Diese Seite erklärt in fünf Schritten, wie {name} die App benutzt:
            anmelden, auf den Startbildschirm legen, das eigene Profil füllen —
            und was wo steht. Du kannst sie ausdrucken oder als PDF speichern
            und weiterschicken.
          </p>
        </header>

        <div className="space-y-8">
          {steps.map((entry, index) => (
            // Nummeriert, weil es eine Reihenfolge ist und keine Sammlung: Wer
            // das Blatt bekommt, arbeitet es von oben nach unten ab.
            <section key={entry.id} className="break-inside-avoid">
              <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold text-stone-800">
                <span className="text-terracotta-500">{index + 1}.</span>
                {entry.question}
              </h2>
              <FaqAnswer
                text={entry.answer}
                className="text-sm leading-relaxed text-stone-500"
              />
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-line pt-4 text-[11px] leading-relaxed text-stone-400">
          Alles Weitere steht in der App unter Profil → Hilfe. Dort sind auch
          die Antworten zu Themen, Liedern, Gebetsbuddys und Geburtstagen.
        </footer>
      </article>
    </div>
  );
}
