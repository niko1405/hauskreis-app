'use client';

/**
 * Die eigene Antwort — unten am Bildschirm statt mitten auf der Seite.
 *
 * **Warum sie umgezogen ist.** „Deine Antwort" war eine Karte zwischen der
 * Anwesenheitsliste und den Gebetsanliegen, gut zwei Bildschirmhöhen unter dem
 * Kopf. Sie ist aber das Einzige auf dieser Seite, das jede:r bei jedem Besuch
 * tut: Alles andere liest man, das hier beantwortet man. Wer den Termin
 * öffnete, um zuzusagen, scrollte erst an Uhrzeit, Ort, vier Rollen, Liedern
 * und neun Namen vorbei.
 *
 * Unten war dafür Platz, der auf dieser Seite nichts sagte: Die Tab-Leiste
 * führt zu fünf Zielen, von denen man gerade keins meint — man ist *in* einem
 * Termin, und der Weg heraus ist der Zurück-Pfeil oben links. Sie tritt
 * deshalb hier zurück (`bottom-slot.tsx`), und zwar **nur hier**: An einem
 * vergangenen oder abgesagten Abend gibt es nichts mehr zu antworten, dort
 * bleibt die Navigation stehen.
 *
 * **Zwei Zustände.** Eingeklappt die drei Antworten und der eigene Satz, falls
 * einer dasteht — ein Streifen wie die Leiste, die er vertritt, ohne Schleier
 * und ohne Sperre, damit die Seite weiterscrollt. Ausgeklappt dazu das
 * Notizfeld. Ein Druck auf eine Antwort klappt auf: Der Status ist damit
 * gesetzt, und die nächste Frage — „willst du noch etwas dazusagen?" — steht
 * gleich offen, statt hinter einem zweiten Griff.
 *
 * **Ausgeklappt ist es ein Sheet.** Schleier, gesperrter Hintergrund, Escape,
 * ein Tipp daneben — dieselbe Overlay-Grammatik wie überall sonst in der App.
 * Zwei Sorten Overlay wären eine zu viel.
 *
 * **Der Status schreibt sofort, die Notiz auf Knopfdruck.** Unverändert: Ein
 * Tipp auf „Dabei" ist überall in der App sofort verbindlich; erst nach einem
 * zweiten Knopf zu speichern hieße, man könnte antippen, weggehen und nichts
 * gesagt haben. Die Notiz braucht den Knopf dagegen, sonst ginge bei jedem
 * Buchstaben eine Anfrage raus.
 */
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BottomSlot } from '@/components/layout/bottom-slot';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { lockOverlay } from '@/components/ui/overlay-lock';
import { dismissed, raised } from '@/components/ui/swipe';
import { ANSWERS, NOTE_FIELD } from '@/components/domain/attendance-answers';
import { useAttendanceAnswer } from '@/components/domain/use-attendance-answer';
import { useMe, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting } from '@/lib/api/types';

export function AnswerBar({ meeting }: { meeting: Meeting }) {
  const me = useMe();
  const myId = me.me?.id;

  if (!myId) return null;

  const row = meeting.attendances.find((entry) => entry.personId === myId);

  return (
    <BottomSlot>
      <Bar
        meeting={meeting}
        personId={myId}
        status={row?.status ?? 'UNKNOWN'}
        note={row?.note ?? null}
      />
    </BottomSlot>
  );
}

function Bar({
  meeting,
  personId,
  status,
  note,
}: {
  meeting: Meeting;
  personId: string;
  status: AttendanceStatus;
  note: string | null;
}) {
  // Der Status läuft über den gemeinsamen Hook: Auf „Weiß noch nicht" zu gehen
  // gibt die eigenen Rollen dieses Abends frei, und danach wird gefragt. Die
  // **Notiz** geht direkt raus — sie ändert am Status nichts und braucht
  // deshalb auch keine Rückfrage.
  const { answer } = useAttendanceAnswer(meeting);
  const setAttendance = useSetAttendance(meeting.id);
  const drag = useDragControls();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  // Der Entwurf folgt dem Server, solange niemand tippt — sonst stünde nach
  // einem Statuswechsel (der die Notiz löscht) der alte Satz noch im Feld.
  const [touched, setTouched] = useState(false);
  const shown = touched ? draft : (note ?? '');

  const field = NOTE_FIELD[status];
  const FieldIcon = field.icon;
  const trimmed = shown.trim();
  const changed = (trimmed === '' ? null : trimmed) !== note;

  const head = useRef<HTMLDivElement>(null);
  const reserve = useMeasuredHeight(head);

  // Ausgeklappt ist der Balken ein Overlay wie jedes andere: Der Hintergrund
  // scrollt nicht, „Ziehen zum Aktualisieren" hört nicht zu, Escape schließt.
  // Eingeklappt ist er ein Streifen und meldet nichts an — sonst stünde die
  // Terminseite dauerhaft still.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const release = lockOverlay();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      release();
    };
  }, [open]);

  const choose = async (next: AttendanceStatus) => {
    setTouched(false);
    // Nur wenn wirklich geantwortet wurde. Wer die Rollen-Rückfrage abbricht,
    // soll nicht in einem Feld für eine Notiz landen, die zu nichts gehört.
    if (await answer(next)) setOpen(true);
  };

  return (
    // Der Wirt hält den Platz im Fluss — in Höhe des **eingeklappten** Balkens,
    // damit der Seiteninhalt genau so weit freibleibt wie unter der Tab-Leiste,
    // die er vertritt. `sticky` und nicht `fixed`, aus demselben Grund wie bei
    // der Kopfleiste: Die App ist ab `md` eine zentrierte Spalte, und `fixed`
    // müsste diese Geometrie ein zweites Mal nachbauen.
    <div
      className="sticky bottom-0 z-30"
      // Der sichere Rand steckt im Panel (`pb-safe`), die Höhe hier muss ihn
      // also mitzählen. Getrennt und nicht als Polsterung an diesem Kasten:
      // `box-sizing: border-box` zöge sie sonst von der Höhe ab, und der Balken
      // deckte auf einem Gerät mit Home-Indikator genau diesen Streifen des
      // Seiteninhalts zu.
      style={{
        height: `calc(${reserve}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            // **Geschwister des Panels, nicht darin.** Das Panel trägt beim
            // Ziehen ein `transform`, und ein transformiertes Element wird zum
            // Bezugsrahmen für jedes `position: fixed` darin — der Schleier
            // säße dann im Balken statt über der Seite.
            className="fixed inset-0 -z-10 bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <motion.div
        drag="y"
        dragListener={false}
        dragControls={drag}
        // In **beide** Richtungen, anders als beim Sheet: hoch klappt auf,
        // runter klappt ein. Die Strecke selbst sagt nichts — sie zeigt nur,
        // dass der Balken am Finger hängt.
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.25}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (dismissed(info)) setOpen(false);
          else if (raised(info)) setOpen(true);
        }}
        // Wächst nach oben statt in den Fluss hinein: Die Unterkante steht
        // fest, also schiebt das Ausklappen nichts weg, was man gerade liest —
        // und am unteren Ende der Seite rutscht es nicht aus dem Bild.
        className="pb-safe absolute inset-x-0 bottom-0 rounded-t-sheet border-t border-line bg-canvas shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)]"
      >
        {/* Der Ziehbereich, und zugleich das, was im Fluss Platz beansprucht.
            Eingeklappt ist der ganze Balken Kopf — die Antwort-Knöpfe darin
            fangen ihre Drucke selbst ab. */}
        <div
          ref={head}
          onPointerDown={(event) => drag.start(event)}
          className="cursor-grab touch-none px-5 pt-2.5 pb-2 active:cursor-grabbing"
        >
          {/* Der Griff hält den Zeiger **nicht** an: Er ist die Fläche, an der
              man zieht, und ein sauberer Tipp darauf kommt trotzdem als Klick
              an — eine Geste ohne Weg unterdrückt ihn nicht. Bei den drei
              Antworten darunter ist es umgekehrt entschieden. */}
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Antwort einklappen' : 'Antwort ausklappen'}
            onClick={() => setOpen((current) => !current)}
            // Der Strich ist sechs Pixel hoch; der Knopf darum ist es nicht.
            // Ein Ziel dieser Größe trifft niemand mit dem Daumen — die
            // Fläche geht deshalb über die ganze Breite und ein Stück nach
            // oben und unten, sichtbar bleibt der Strich.
            className="flex w-full justify-center py-1.5"
          >
            <span className="h-1.5 w-12 rounded-full bg-line-strong" />
          </button>

          <div className="mt-3 flex gap-2">
            {ANSWERS.map((option) => (
              <button
                key={option.status}
                type="button"
                aria-pressed={status === option.status}
                // Hier schon: Ein verschluckter Tipp auf „Dabei" wiegt
                // schwerer als eine Wischgeste, die an dieser einen Stelle
                // nicht beginnt — daneben ist überall Platz dafür.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => void choose(option.status)}
                className={cn(
                  'flex-1 rounded-md border px-2 py-2.5 text-xs font-bold transition-colors',
                  status === option.status
                    ? option.active
                    : 'border-line bg-card text-stone-500 hover:border-line-strong',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Eingeklappt steht der eigene Satz einzeilig da: Er ist der Grund,
              aus dem man den Balken sonst aufklappen müsste, und zugleich der
              Hinweis, dass überhaupt einer dasteht. Ausgeklappt steht er im
              Feld darunter — zweimal wäre er eine Behauptung zu viel. */}
          {!open && note && (
            <p className="mt-2 truncate text-[11px] text-stone-400">„{note}"</p>
          )}
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 px-5 pt-1 pb-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
                  <FieldIcon size={13} className="text-stone-400" />
                  {field.label}
                </p>
                <TextArea
                  value={shown}
                  placeholder={field.placeholder}
                  aria-label={field.label}
                  className="min-h-16"
                  onChange={(event) => {
                    setTouched(true);
                    setDraft(event.target.value);
                  }}
                />
                <div className="flex justify-end">
                  {/* Immer da, aber nur bedienbar, wenn es etwas zu speichern
                      gibt. Ihn verschwinden zu lassen hieße, den Balken
                      springen zu lassen, sobald jemand den ersten Buchstaben
                      tippt. */}
                  <Button
                    size="sm"
                    disabled={!changed}
                    loading={setAttendance.isPending}
                    onClick={() => {
                      setTouched(false);
                      setAttendance.mutate({
                        personId,
                        status,
                        note: trimmed === '' ? null : trimmed,
                      });
                    }}
                  >
                    Antwort speichern
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * Wie hoch der eingeklappte Balken gerade ist.
 *
 * Gemessen und nicht als Zahl hingeschrieben: Die Höhe hängt an der Schriftart,
 * am Vorhandensein der Notizzeile und daran, ob eine Beschriftung umbricht. Ein
 * ausgerechneter Wert wäre beim ersten längeren Wort falsch — und zwar so, dass
 * der letzte Absatz der Seite unter dem Balken verschwindet.
 */
function useMeasuredHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    setHeight(element.offsetHeight);

    return () => observer.disconnect();
  }, [ref]);

  return height;
}
