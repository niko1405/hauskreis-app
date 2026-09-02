'use client';

/**
 * Der Link der App — `next/link` plus das Wissen, ob gerade etwas ungespeichert
 * ist.
 *
 * **Warum jeder Link und nicht ausgewählte.** Alle Wege aus einem Bildschirm
 * heraus sind Links: die Tab-Leiste, die Seitenspalte, die Kopfleiste, jede
 * Zeile im Profil. Bewachte man nur die, die es heute gibt, wäre bei jedem
 * neuen Formular die Frage „ist dieser Link eigentlich bewacht?" neu zu
 * beantworten — und beim ersten Nein still eine Antwort verloren. Es gibt
 * deshalb einen Link, und er weiß es selbst.
 *
 * **Was er nicht kann.** Der Zurück-Knopf des Browsers und die Wischgeste
 * zurück lassen sich im App Router nicht abfangen; dafür gibt es keine
 * Schnittstelle, nur Eingriffe in den Verlauf, die ihn verbiegen. Abgedeckt
 * sind alle Wege *in* der App und — über `beforeunload` in `unsaved.ts` — das
 * Neuladen und Schließen. Das ist die ehrliche Reichweite.
 */
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm } from './confirm';
import { useHasUnsaved } from './unsaved';

type LinkProps = React.ComponentProps<typeof NextLink>;

export default function Link({ onNavigate, ...props }: LinkProps) {
  const blocked = useHasUnsaved();
  const confirm = useConfirm();
  const router = useRouter();

  return (
    <NextLink
      {...props}
      onNavigate={(event) => {
        // Der eigene Handler zuerst und mit eigenem Ereignis: Hat er die
        // Navigation schon abgesagt, gibt es nichts mehr zu fragen.
        let stopped = false;
        onNavigate?.({
          preventDefault: () => {
            stopped = true;
            event.preventDefault();
          },
        });
        if (stopped) return;

        // Ein Ziel als Objekt käme hier nicht wieder zusammen; im Projekt gibt
        // es keins, und ein halb bewachter Link wäre schlimmer als ein
        // unbewachter.
        if (!blocked || typeof props.href !== 'string') return;

        const href = props.href;
        event.preventDefault();

        void (async () => {
          const ok = await confirm({
            title: 'Ungespeicherte Änderungen',
            body: 'Du hast etwas geändert und noch nicht gespeichert. Wenn du weitergehst, ist es weg.',
            confirmLabel: 'Verwerfen',
            cancelLabel: 'Hierbleiben',
            tone: 'danger',
          });
          if (!ok) return;

          // Über den Router und nicht über den Link: Das läuft an `onNavigate`
          // vorbei und fragt deshalb nicht ein zweites Mal.
          if (props.replace) router.replace(href);
          else router.push(href);
        })();
      }}
    />
  );
}
