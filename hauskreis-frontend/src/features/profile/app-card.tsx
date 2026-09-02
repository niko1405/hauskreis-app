'use client';

/**
 * Die App über sich selbst: was neu ist, wie sie funktioniert, und wer sie
 * gebaut hat.
 *
 * Vier Zeilen, die nirgends sonst hingehören — dazu das **Konto**, das hier
 * ganz oben steht, seit es einen eigenen Bildschirm hat. „Was ist neu" trägt denselben
 * Punkt wie das Profil-Symbol in der Leiste, damit der Weg dorthin nicht in der
 * Karte endet, ohne zu sagen, warum man hier ist. „Hilfe" ist der eigentliche
 * Zuwachs: Das Baukasten-System, die Vorschlagslogik und das Themen-System
 * sind ohne Erklärung nicht zu erraten, und bisher stand sie nirgends.
 *
 * **„Hilfe" trägt beim allerersten Start einen eigenen Punkt** — nicht weil
 * dort etwas neu wäre, sondern weil dort steht, was jetzt zu tun ist
 * ([[use-unread-help]]). Deshalb sagt in dem Fall auch der Untertitel etwas
 * anderes: Ein Punkt ohne Grund ist eine Frage, keine Antwort.
 *
 * Hier stand einmal auch, ob die App offline bereit ist. Der Hinweis war ein
 * Werkzeug für einen bestimmten Fehler — er hat ihn gezeigt, der Fehler ist
 * weg, und eine Zeile, die immer dasselbe sagt, liest bald niemand mehr.
 *
 * **Ganz unten steht „Unterstützen"**, unter „Gebaut von Niko" und nicht davor:
 * Das ist die Reihenfolge, in der man es liest — erst wer, dann warum. Dass
 * hinter der App ein Server, eine Datenbank und ein Keycloak laufen, die
 * monatlich etwas kosten, stand bisher nirgends.
 */
import {
  ChevronRight,
  FileText,
  Heart,
  HelpCircle,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useUnreadFirstSteps } from '@/features/help/use-unread-help';
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
  const firstSteps = useUnreadFirstSteps();

  return (
    <section>
      <SectionTitle>Rechtliches &amp; Über die App</SectionTitle>
      <Card className="space-y-4">
        {/* Das Konto steht als **erste** Zeile: Von allem hier ist es die
            einzige, hinter der etwas zu tun ist — Datenschutz, Impressum und
            „Was ist neu" liest man. Es stand einmal als eigene Karte im Profil,
            zwischen lauter Einstellungen zum Anhaken; Kontosachen fasst man
            aber zweimal im Jahr an. */}
        <LinkRow
          href="/konto"
          icon={<UserCog size={16} />}
          title="Konto"
          hint="Anmeldename, E-Mail, Passwort und Konto löschen"
        />

        {/* Rechtliches steht **oben** und nicht als Nachtrag unter „Gebaut von
            Niko". Wer es sucht, sucht es zuerst — und wer es nicht sucht,
            überliest zwei Zeilen. */}
        <div className="border-t border-line pt-4">
          <LinkRow
            href="/datenschutz"
            icon={<ShieldCheck size={16} />}
            title="Datenschutzerklärung"
            hint="Alles über die Datenverarbeitung in der App"
          />
        </div>

        <div className="border-t border-line pt-4">
          <LinkRow
            href="/impressum"
            icon={<FileText size={16} />}
            title="Impressum"
            hint="Wer diese App betreibt"
          />
        </div>

        <div className="border-t border-line pt-4">
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
        </div>

        <div className="border-t border-line pt-4">
          <LinkRow
            href="/hilfe"
            icon={<HelpCircle size={16} />}
            title="Hilfe"
            hint={
              firstSteps.unread
                ? 'Neu hier? Fang mit „Was sind erste Schritte?“ an'
                : 'Du hast Fragen zur Nutzung? — hier findest du Antworten'
            }
            dot={firstSteps.unread}
          />
        </div>

        <div className="space-y-1 border-t border-line pt-4">
          <p className="text-sm font-bold text-stone-800">Gebaut von Niko</p>
          <p className="text-[11px] leading-relaxed text-stone-400">
            Hey! Wenn etwas fehlt oder anders sein sollte — schreib mir einfach.
          </p>
          <a
            href="mailto:niko.vix@icloud.com"
            className="inline-flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-terracotta-600 hover:text-terracotta-700"
          >
            <Mail size={12} />
            niko.vix@icloud.com
          </a>
        </div>

        <Support />
      </Card>
    </section>
  );
}

/**
 * Freiwillig etwas beitragen.
 *
 * **Der Knopf hängt an einer Konstante, nicht an einem `disabled`-Attribut.**
 * Solange hier `null` steht, gibt es nichts zu drücken; steht eine Adresse da,
 * wird derselbe Knopf ein Link. So ist das Freischalten später eine Zeile und
 * kein Umbau — und es gibt keinen Zwischenzustand, in dem ein Link ins Leere
 * zeigt.
 *
 * `Button` rendert immer ein `<button>`; für den Link steht deshalb dieselbe
 * Klassenzeile an einem `<a>`, so wie es „In Maps öffnen" am Termin schon tut.
 *
 * **Und der graue Knopf sagt, warum er grau ist.** Wortlos ausgegraut wäre er
 * das, was an den Lied-Haken einmal falsch war: kein Hinweis, sondern ein
 * Fehler.
 */
const PAYPAL_URL: string | null = null;

const SUPPORT_BUTTON =
  'inline-flex w-full items-center justify-center gap-2 rounded-full bg-terracotta-500 ' +
  'px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta-700';

function Support() {
  return (
    <div className="border-t border-line pt-4">
      {/* Ein getönter Kasten statt einer weiteren nackten Zeile: Die Zeilen
          darüber führen woandershin, dieser hier fragt etwas. */}
      <div className="space-y-2.5 rounded-md border border-terracotta-100 bg-terracotta-50 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-terracotta-700">
          <Heart size={15} />
          Unterstützen
        </p>
        <p className="text-[11px] leading-relaxed text-stone-500">
          Wenn dir die App gefällt, kannst du freiwillig dazu beitragen, die
          laufenden Betriebskosten zu decken.
        </p>

        {PAYPAL_URL === null ? (
          <>
            <Button className="w-full" disabled>
              Unterstützen
            </Button>
            <p className="text-center text-[11px] text-stone-400">
              Ist noch nicht eingerichtet.
            </p>
          </>
        ) : (
          <a
            href={PAYPAL_URL}
            target="_blank"
            rel="noreferrer"
            className={SUPPORT_BUTTON}
          >
            Unterstützen
          </a>
        )}
      </div>
    </div>
  );
}
