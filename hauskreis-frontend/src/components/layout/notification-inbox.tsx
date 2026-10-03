'use client';

/**
 * Die Box hinter der Glocke.
 *
 * **Was hier steht, ist nicht dasselbe wie eine Push-Nachricht.** Ein Eintrag
 * entsteht auch dann, wenn die Art in den Einstellungen abgeschaltet ist: In
 * der Box zu stehen stört niemanden, und wer das Klingeln für „Du hostest"
 * abgestellt hat, will trotzdem nachlesen können, dass er dran ist. Deshalb
 * liegt die Route unter `/api/notifications` und nicht unter `/api/push`.
 *
 * **Gelesen heißt weg — aber nicht aus der Welt.** Antippen navigiert zum Ort
 * der Sache und schiebt den Eintrag nach „Früher". Dort stehen die letzten
 * dreißig; wer weiter zurück will, sucht am Ort selbst. Die Box ist kein
 * zweites Archiv.
 *
 * **Und wer nur wegräumen will, wischt nach links.** „Alle gelesen" war bisher
 * das einzige Werkzeug dafür, und es ist ein grobes: Wer sieben Nachrichten hat
 * und sechs davon erledigt, musste die siebte entweder stehen lassen oder alles
 * auf einmal wegräumen. Ein Wisch macht dasselbe für eine Zeile — dieselbe
 * Geste, mit der in dieser App überall in Listen aufgeräumt wird, nur ohne den
 * Knopf dahinter: Es gibt hier nur eine Sache zu tun, und ein Knopf, der sie
 * erst noch anbietet, wäre ein Schritt zu viel.
 *
 * **Eine Sprechblase und kein Sheet.** Sie fuhr einmal von unten herein, und
 * das war die falsche Bauform: Ein Bottom-Sheet beantwortet „wähle etwas aus",
 * nicht „was ist neu" — und es kam aus der Ecke gegenüber dem Knopf, den man
 * gerade gedrückt hatte. Jetzt klappt sie unter der Glocke auf, mit einem Pfeil
 * darauf.
 *
 * **Ohne Positionierungs-Bibliothek, und ohne dass eine fehlt.** Die App kennt
 * weder Portale noch `getBoundingClientRect`. Sie braucht hier auch beides
 * nicht: Die Glocke sitzt in einer Leiste über die volle Breite, ihr
 * Mittelpunkt liegt damit fest bei 2,125 rem vom rechten Rand (`px-4` der
 * Leiste plus die halbe Knopfbreite). Panel und Pfeil rechnen von derselben
 * Kante aus — eine Messung wäre eine Maschinerie für genau einen Aufrufer.
 *
 * Gerendert wird sie als **Geschwister** der Leiste, nicht darin: Die trägt
 * beim Wegfahren ein `transform`, und ein transformiertes Element wird zum
 * Bezugsrahmen für jedes `position: fixed` darin. Die Blase säße sonst in einem
 * 56 Pixel hohen Kasten.
 */
import {
  Bell,
  Blocks,
  CakeSlice,
  CalendarClock,
  CalendarX,
  Check,
  Cookie,
  Gift,
  Guitar,
  HandHelping,
  Home,
  ListChecks,
  Megaphone,
  MessageSquareX,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserMinus,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { lockOverlay } from '@/components/ui/overlay-lock';
import { pulledLeft } from '@/components/ui/swipe';
import { formatTimestamp } from '@/lib/date';
import { cn } from '@/lib/cn';
import {
  useInbox,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/lib/api/hooks';
import type { NotificationEntry } from '@/lib/api/types';

/**
 * Ein Symbol je Art.
 *
 * Der **Text** kommt gespeichert vom Server — er soll morgen noch dasselbe
 * sagen wie gestern, auch wenn der Termin inzwischen verschoben wurde. Nur das
 * Symbol wird hier gewählt: Es ist Gestaltung und keine Aussage über die Welt.
 */
const ICONS: Record<NotificationEntry['type'], typeof Bell> = {
  HOST_REMINDER: Home,
  TOPIC_REMINDER: ListChecks,
  SONG_REMINDER: Guitar,
  SNACK_REMINDER: Cookie,
  TESTIMONY_REMINDER: Sparkles,
  ACTIONSTEP_REMINDER: Check,
  ROLE_ASSIGNED: Users,
  PRAYER_BUDDY_ASSIGNED: Users,
  MEETING_CANCELLED: CalendarX,
  MEETING_TIME_CHANGED: CalendarClock,
  MEETING_SLOTS_CHANGED: Blocks,
  ROLE_OPEN_REMINDER: HandHelping,
  RECAP_ADDED: ScrollText,
  MEETING_TODAY: CalendarClock,
  NOTES_REMINDER: NotebookPen,
  ATTENDANCE_DECLINED: MessageSquareX,
  HOST_CAPACITY_UNLOCKED: Home,
  MEMBER_LEFT: UserMinus,
  CUSTOM_MEETING_CREATED: CalendarClock,
  CUSTOM_MEETING_REMINDER: CalendarClock,
  BIRTHDAY_GIFT_ASSIGNED: Gift,
  BIRTHDAY_GIFT_REMINDER: CakeSlice,
  BIRTHDAY_GIFT_DECIDED: Gift,
  ADMIN_GRANTED: ShieldCheck,
  RELEASE_NOTES: Megaphone,
};

export function NotificationInbox({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const inbox = useInbox();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const router = useRouter();
  const [showRead, setShowRead] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const unread = inbox.data?.unread ?? [];
  const read = inbox.data?.read ?? [];

  // Wie beim `Sheet` und aus demselben Grund über eine Ref: Der Effekt zieht
  // den Fokus ins Panel und dürfte nicht neu laufen, nur weil der Aufrufer bei
  // jedem Render einen frischen Pfeil übergibt.
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestClose.current();
    };
    document.addEventListener('keydown', onKeyDown);

    // Dieselbe Anmeldung wie beim Sheet, und sie sagt hier drei Dinge auf
    // einmal: Der Hintergrund scrollt nicht, „Ziehen zum Aktualisieren" hört
    // nicht zu — und die Kopfleiste bleibt stehen (`useHeaderScroll` fragt
    // `useOverlayOpen`). Ohne das führe die Leiste beim ersten Wischen weg und
    // ließe die Blase mitsamt ihrem Pfeil im Nichts hängen.
    const release = lockOverlay();
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      release();
    };
  }, [open]);

  const openEntry = (entry: NotificationEntry) => {
    if (entry.readAt === null) markRead.mutate(entry.id);
    onClose();
    if (entry.url) router.push(entry.url);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Der Weg hinaus. Ein leichter Schleier statt der `black/60` des
              Sheets: Die Blase nimmt ein Viertel des Bildschirms ein, alles
              dahinter abzudunkeln behauptete mehr Gewicht, als sie hat. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/25"
          />

          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Benachrichtigungen"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            style={{ transformOrigin: 'top right' }}
            className="top-header fixed right-3 z-50 flex max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-lg border border-line bg-card shadow-xl shadow-black/20 outline-none"
          >
            {/* Der Zipfel: ein gedrehtes Quadrat, das nur seine beiden oberen
                Kanten zeigt. 1,375 rem vom rechten Rand des Panels — das sind
                die 2,125 rem der Glocke minus die 0,75 rem, um die das Panel
                selbst eingerückt ist. */}
            <span
              aria-hidden
              className="absolute -top-1.5 right-[1.375rem] size-3 rotate-45 rounded-tl-[3px] border-t border-l border-line bg-card"
            />

            <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
              <p className="flex-1 text-sm font-bold text-stone-800">
                Benachrichtigungen
                {unread.length > 0 && (
                  <span className="ml-1.5 font-semibold text-stone-400">
                    {unread.length} neu
                  </span>
                )}
              </p>
              {/* Als Textknopf und nicht als Balken am Fuß: Das Sheet hatte
                  unten Platz, die Blase hat oben eine Zeile. */}
              {unread.length > 0 && (
                <button
                  type="button"
                  disabled={markAll.isPending}
                  onClick={() => markAll.mutate()}
                  className="shrink-0 text-xs font-bold text-terracotta-600 disabled:opacity-50"
                >
                  Alle gelesen
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-3">
              {unread.length === 0 && read.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  Hier landet, was die App dir zu sagen hat.
                </p>
              ) : (
                <div className="space-y-2">
                  {unread.map((entry) => (
                    <SwipeToRead
                      key={entry.id}
                      onRead={() => markRead.mutate(entry.id)}
                    >
                      <Row entry={entry} onOpen={openEntry} />
                    </SwipeToRead>
                  ))}

                  {unread.length === 0 && (
                    <p className="py-4 text-center text-sm text-stone-400">
                      Nichts Neues.
                    </p>
                  )}

                  {read.length > 0 && (
                    <div className="pt-2">
                      {/* Aufgeklappt nur auf Wunsch: Gelesenes ist
                          Nachschlagewerk, und es stünde sonst immer unter dem,
                          was gerade zählt. */}
                      <button
                        type="button"
                        onClick={() => setShowRead((value) => !value)}
                        className="w-full py-2 text-xs font-bold tracking-wider text-stone-400 uppercase"
                      >
                        {showRead
                          ? 'Früher ausblenden'
                          : `Früher (${read.length})`}
                      </button>

                      {showRead && (
                        <div className="space-y-2">
                          {read.map((entry) => (
                            <Row
                              key={entry.id}
                              entry={entry}
                              onOpen={openEntry}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Eine ungelesene Zeile, die sich nach links wegwischen lässt.
 *
 * **Nur die ungelesenen.** An einer gelesenen gibt es nichts wegzuräumen; eine
 * Zeile, die nachgibt und dann nichts tut, ist ein Versprechen, das die Liste
 * nicht hält.
 *
 * **Ohne Knopf dahinter**, anders als `SwipeActions` in den Listen der App. Die
 * geben rechts Stift und Papierkorb frei, weil dort zwei Dinge zur Wahl stehen
 * und eines davon löscht. Hier gibt es genau eine Sache zu tun, und sie ist
 * umkehrbar — der Eintrag wandert nach „Früher", nicht aus der Welt. Dafür
 * einen Knopf anzubieten, den man dann noch treffen muss, wäre ein Schritt zu
 * viel; darunter steht deshalb nur, was gleich passiert.
 *
 * Die Schwelle kommt aus `swipe.ts` wie bei allen anderen Zügen der App:
 * Strecke **oder** Schwung, damit ein Verrutschen nicht zählt und ein
 * Schnipser reicht. `dragDirectionLock` und `touch-pan-y`, damit die Liste
 * senkrecht scrollt wie immer.
 */
function SwipeToRead({
  onRead,
  children,
}: {
  onRead: () => void;
  children: React.ReactNode;
}) {
  const controls = useAnimationControls();

  return (
    <div className="relative overflow-hidden rounded-md">
      {/* Was unter der Zeile liegt. Grün wie überall, wo etwas erledigt ist —
          und rechts, weil die Zeile nach links darüber hinweggeht. */}
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-end rounded-md bg-success-bg pr-4 text-success"
      >
        <Check size={16} />
      </span>

      <motion.div
        drag="x"
        dragDirectionLock
        // Beide Grenzen auf 0 und die Nachgiebigkeit nur nach links: Die Zeile
        // folgt dem Finger nach links fast eins zu eins und lässt sich nach
        // rechts gar nicht ziehen — dorthin gibt es nichts freizugeben.
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0 }}
        animate={controls}
        onDragEnd={(_, info) => {
          if (pulledLeft(info)) {
            // Erst zu Ende wischen, dann schreiben: Der Eintrag verschwindet
            // sonst erst, wenn die Antwort da ist — und bis dahin stünde er
            // halb weggeschoben da.
            void controls
              .start({ x: '-100%', opacity: 0, transition: { duration: 0.18 } })
              .then(onRead);
          } else {
            void controls.start({
              x: 0,
              transition: { type: 'spring', damping: 30, stiffness: 300 },
            });
          }
        }}
        className="relative touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Eine Zeile.
 *
 * Gelesene stehen blasser da und tragen keinen Punkt — sie sind noch
 * anklickbar, denn der Weg zum Termin ist auch dann der richtige, wenn man ihn
 * schon einmal gegangen ist.
 */
function Row({
  entry,
  onOpen,
}: {
  entry: NotificationEntry;
  onOpen: (entry: NotificationEntry) => void;
}) {
  const Icon = ICONS[entry.type] ?? Bell;
  const unread = entry.readAt === null;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
        unread
          ? 'border-terracotta-100 bg-terracotta-50/60'
          : 'border-line bg-card',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          unread
            ? 'bg-terracotta-500 text-white'
            : 'bg-stone-100 text-stone-400',
        )}
      >
        <Icon size={15} strokeWidth={2} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm leading-snug font-bold',
            unread ? 'text-stone-900' : 'text-stone-500',
          )}
        >
          {entry.title}
        </span>
        {entry.body && (
          <span
            className={cn(
              'mt-0.5 block text-xs leading-relaxed',
              unread ? 'text-stone-600' : 'text-stone-400',
            )}
          >
            {entry.body}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-stone-400">
          {formatTimestamp(entry.sentAt)}
        </span>
      </span>

      {unread && (
        <span
          aria-hidden
          className="mt-2 size-2 shrink-0 rounded-full bg-terracotta-500"
        />
      )}
    </button>
  );
}
