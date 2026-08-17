'use client';

/**
 * Die App über sich selbst: was neu ist, wie sie funktioniert, und wer sie
 * gebaut hat.
 *
 * Drei Zeilen, die nirgends sonst hingehören. „Was ist neu" trägt denselben
 * Punkt wie das Profil-Symbol in der Leiste, damit der Weg dorthin nicht in der
 * Karte endet, ohne zu sagen, warum man hier ist. „Hilfe" ist der eigentliche
 * Zuwachs: Das Baukasten-System, die Vorschlagslogik und das Themen-System
 * sind ohne Erklärung nicht zu erraten, und bisher stand sie nirgends.
 *
 * Hier stand einmal auch, ob die App offline bereit ist. Der Hinweis war ein
 * Werkzeug für einen bestimmten Fehler — er hat ihn gezeigt, der Fehler ist
 * weg, und eine Zeile, die immer dasselbe sagt, liest bald niemand mehr.
 */
import { ChevronRight, HelpCircle, Mail, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Card, SectionTitle } from '@/components/ui/card';
import { useUnreadRelease } from '@/features/releases/use-unread-release';

/** Eine Zeile, die auf einen anderen Bildschirm führt. */
function LinkRow({
  href,
  icon,
  title,
  hint,
  dot = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  dot?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 transition-colors hover:text-terracotta-500"
    >
      <span className="shrink-0 text-stone-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold text-stone-800">
          {title}
          {dot && (
            <>
              <span className="size-2 shrink-0 rounded-full bg-terracotta-500" />
              <span className="sr-only">(Neues)</span>
            </>
          )}
        </p>
        <p className="text-[11px] text-stone-400">{hint}</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-stone-400" />
    </Link>
  );
}

export function AppCard() {
  const { unread, version } = useUnreadRelease();

  return (
    <section>
      <SectionTitle>Über die App</SectionTitle>
      <Card className="space-y-4">
        <LinkRow
          href="/neu"
          icon={<Sparkles size={16} />}
          title="Was ist neu"
          hint={
            version
              ? `Version ${version}${unread ? ' · noch nicht angesehen' : ''}`
              : 'Alle Änderungen'
          }
          dot={unread}
        />

        <div className="border-t border-line pt-4">
          <LinkRow
            href="/hilfe"
            icon={<HelpCircle size={16} />}
            title="Hilfe"
            hint="Du hast Fragen zur Nutzung? — hier findest du Antworten"
          />
        </div>

        <div className="space-y-1 border-t border-line pt-4">
          <p className="text-sm font-bold text-stone-800">Gebaut von Niko</p>
          <p className="text-[11px] leading-relaxed text-stone-400">
            Hey! Wenn etwas fehlt, klemmt oder anders sein sollte — schreib mir
            einfach.
          </p>
          <a
            href="mailto:niko.vix@icloud.com"
            className="inline-flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-terracotta-600 hover:text-terracotta-700"
          >
            <Mail size={12} />
            niko.vix@icloud.com
          </a>
        </div>
      </Card>
    </section>
  );
}
