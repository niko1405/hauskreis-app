'use client';

/**
 * Ziehen zum Aktualisieren.
 *
 * Die App holt ihre Daten beim Öffnen und danach nur noch, wenn etwas
 * geschrieben wurde — `refetchOnWindowFocus` steht bewusst auf `false`
 * (`query-client.ts`). Wer wissen will, ob inzwischen jemand einen Termin
 * eingetragen hat, hatte deshalb bisher nur das Neuladen der Seite. Auf einer
 * Web-Seite ist das ein Knopf in der Leiste; in einer App vom Home-Bildschirm
 * gibt es keine Leiste, und die Geste dafür ist überall dieselbe.
 *
 * **Warum von Hand und nicht als Bibliothek.** Die Geste ist zwanzig Zeilen,
 * die Fallunterscheidungen sind der eigentliche Inhalt — und die kennt nur,
 * wer diese App kennt: die Wochen-Tabelle scrollt waagerecht, die Sheets
 * liegen als eigene Ebene darüber, und ohne Netz soll gar nichts erst
 * anlaufen.
 *
 * **Warum ein offenes Sheet die Geste abschaltet.** Hier stand einmal, eine
 * Berührung im Sheet erreiche diese Behandlung gar nicht, und das erspare die
 * Frage, ob gerade eines offen ist. Das war falsch: Die Sheets dieser App
 * liegen im Seiteninhalt und **nicht in einem Portal** — `position: fixed`
 * ändert, wo gemalt wird, nicht, woran ein Element hängt. Jeder Wisch darin
 * lief also bis hierher, und weil man ein Sheet fast immer von ganz oben
 * öffnet, griff auch `window.scrollY > 0` nicht: Das Sheet ließ sich nicht
 * mehr scrollen, und beim Loslassen lud die Seite dahinter nach. Gefragt wird
 * jetzt wirklich — `useOverlayOpen` aus `overlay-lock.ts`.
 *
 * **Warum sich nur der Kringel bewegt und nicht der Inhalt.** Dieselbe
 * Eigenheit, andere Folge: Ein `transform` am Inhalt — und sei es
 * `translateY(0)` — macht das Element zum Bezugsrahmen für alles
 * `position: fixed` darin. Die Sheets säßen danach im Kasten statt im Fenster.
 * Also die Android-Auslegung der Geste, bei der nur der Kringel wandert.
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOverlayOpen } from '@/components/ui/overlay-lock';
import { useToast } from '@/components/ui/toast';
import { useOnline } from '@/lib/use-online';
import { cn } from '@/lib/cn';

/** Ab hier löst das Loslassen aus. */
const THRESHOLD = 72;

/** Weiter lässt sich nicht ziehen — ein Gummiband, das irgendwann straff ist. */
const MAX_PULL = 110;

/**
 * Wie zäh der Zug ist. Ohne Dämpfung folgt der Inhalt dem Finger eins zu eins
 * und fühlt sich an, als hinge er lose; mit ihr spürt man einen Widerstand,
 * der wächst.
 */
const RESISTANCE = 0.45;

/**
 * Bevor die Geste als senkrecht gilt, muss sie diese Strecke zurückgelegt
 * haben. Darunter ist noch nicht entschieden, ob jemand nach unten zieht oder
 * die Wochen-Tabelle zur Seite schiebt.
 */
const DIRECTION_LOCK = 8;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const overlay = useOverlayOpen();

  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Dieselbe Strecke noch einmal, nur synchron lesbar. `touchend` muss wissen,
   * wie weit gezogen wurde, und der Zustand von oben ist dort schon eine
   * Runde alt.
   */
  const pulled = useRef(0);

  /**
   * Der Zustand der laufenden Geste. Bewusst in einem `ref`: Er ändert sich
   * bei jeder Fingerbewegung, und jedes Mal neu zu rendern wäre teuer und
   * sichtbar.
   */
  const gesture = useRef<{
    startY: number;
    startX: number;
    /** `null` = noch unentschieden, `false` = waagerecht, also nicht unsere. */
    vertical: boolean | null;
  } | null>(null);

  // Die letzten Werte, ohne die Effekt-Abhängigkeiten zu bewegen: würde der
  // Effekt bei jedem `pull` neu laufen, hinge die Behandlung ständig neu am
  // Element und `touchmove` verlöre sein `passive: false`.
  const state = useRef({ online, refreshing, overlay });
  state.current = { online, refreshing, overlay };

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const start = (event: TouchEvent) => {
      // Nur von ganz oben. Mitten im Dokument ist ein Zug nach unten das
      // gewöhnliche Scrollen — und liegt ein Sheet darüber, gehört jeder Wisch
      // ihm, nicht der Seite dahinter.
      if (window.scrollY > 0 || state.current.refreshing) return;
      if (state.current.overlay) return;

      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) return;

      gesture.current = {
        startY: touch.clientY,
        startX: touch.clientX,
        vertical: null,
      };
    };

    const move = (event: TouchEvent) => {
      const current = gesture.current;
      const touch = event.touches[0];
      if (!current || !touch) return;

      const dy = touch.clientY - current.startY;
      const dx = touch.clientX - current.startX;

      if (current.vertical === null) {
        if (Math.abs(dy) < DIRECTION_LOCK && Math.abs(dx) < DIRECTION_LOCK) {
          return;
        }
        // Waagerecht überwiegt: das ist die Chip-Reihe oder die Wochen-Tabelle.
        current.vertical = Math.abs(dy) > Math.abs(dx);
        if (!current.vertical) {
          gesture.current = null;
          return;
        }
      }

      // Nach oben gezogen heißt: doch scrollen. Die Geste gibt auf.
      if (dy <= 0) {
        gesture.current = null;
        pulled.current = 0;
        setPull(0);
        setDragging(false);
        return;
      }

      // Öffnet sich mitten in der Geste ein Sheet, gibt sie auf, statt es
      // festzuhalten: Der Finger ist dann schon auf dem neuen Inhalt.
      if (state.current.overlay) {
        gesture.current = null;
        pulled.current = 0;
        setPull(0);
        setDragging(false);
        return;
      }

      // Ab hier gehört die Geste uns. `preventDefault` verhindert, dass das
      // Dokument gleichzeitig mitscrollt — dafür muss der Zuhörer unten mit
      // `passive: false` angemeldet sein.
      event.preventDefault();
      pulled.current = Math.min(dy * RESISTANCE, MAX_PULL);
      setPull(pulled.current);
      setDragging(true);
    };

    const end = () => {
      const current = gesture.current;
      const distance = pulled.current;

      gesture.current = null;
      pulled.current = 0;
      setPull(0);
      setDragging(false);

      // Der Aufruf steht hier und nicht in einem `setState`-Aktualisierer:
      // React darf den zweimal ausführen (`reactStrictMode`), und zweimal
      // nachladen wäre eine Anfrage zu viel.
      if (current?.vertical && distance >= THRESHOLD) void refresh();
    };

    const refresh = async () => {
      if (!state.current.online) {
        toast.error('Ohne Verbindung gibt es nichts Neues zu holen.');
        return;
      }

      setRefreshing(true);
      try {
        // Nur was der sichtbare Bildschirm gerade hält. Alles neu zu holen
        // hieße, für jeden Zug die halbe API abzufragen.
        await queryClient.refetchQueries({ type: 'active' });
      } finally {
        setRefreshing(false);
      }
    };

    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);

    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
    };
  }, [queryClient, toast]);

  const offset = refreshing ? THRESHOLD * 0.6 : pull;
  const armed = pull >= THRESHOLD;

  return (
    <div ref={host} className="relative">
      {/* Der Kringel sitzt über der Inhaltskante und schiebt sich mit ihr ins
          Bild. `pointer-events-none`, damit er nie im Weg steht.

          `top-[env(…)]` statt `top-0`: Seit die App bis unter die Notch reicht,
          ist die Oberkante dieses Wirts die Oberkante des Bildschirms — der
          Kringel drehte sich sonst hinter der Uhr. */}
      <div
        role="status"
        // Solange gezogen wird, ist der Kringel reine Rückmeldung an das Auge
        // und hat nichts zu sagen. Erst das tatsächliche Nachladen wird
        // angesagt.
        aria-label={refreshing ? 'Wird aktualisiert' : undefined}
        aria-hidden={!refreshing}
        className="pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top)] z-10 flex justify-center"
        style={{
          transform: `translateY(${offset - 34}px)`,
          opacity: offset > 4 ? 1 : 0,
          // Während des Ziehens keine Übergangszeit: der Kringel soll am
          // Finger hängen. Erst beim Loslassen federt er zurück.
          transition: dragging ? undefined : 'transform .25s, opacity .2s',
        }}
      >
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card shadow-sm',
            armed || refreshing ? 'text-terracotta-500' : 'text-stone-400',
          )}
        >
          <Loader2
            size={16}
            className={refreshing ? 'animate-spin' : undefined}
            // Vor dem Auslösen dreht sich der Kringel mit dem Zug: die
            // Bewegung kommt aus dem Finger, nicht aus einer Animation.
            style={
              refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }
            }
          />
        </span>
      </div>

      {children}
    </div>
  );
}
