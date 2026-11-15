/**
 * Wie eine Seite kommt **und wie die alte geht** — für `app/(app)/template.tsx`.
 *
 * **Zwei Werkzeuge.** Ein Tab blendet über (CSS, `animate-tab-in`): Tabs
 * liegen nebeneinander, die alte Seite muss nirgendwohin. Alles andere läuft
 * über die View Transitions des Browsers: Er hält ein Bild der alten Seite
 * fest, und das kann hinausgleiten, während die neue schon da ist — mit CSS
 * allein gibt es die alte Seite im selben Moment nicht mehr.
 *
 * **Welche Bewegung, entscheidet ein Attribut an `<html>`** (`data-nav`), und
 * die Regeln dazu stehen in `globals.css`. Es wird gesetzt, sobald die neue
 * Seite eingehängt ist und bevor der Browser die Bilder animiert — die alte
 * Seite kennt ihr Ziel nicht, das Attribut schon:
 *
 * - `push` — eine Unterseite: Die neue kommt leicht von rechts, die alte
 *   weicht nach links und blendet aus.
 * - `pop` — **Zurück**: Die Unterseite geht nach rechts, die vorige kommt von
 *   links zurück, wie unter iOS.
 * - `sheet-open` / `sheet-close` — die Gruppe auf dem Telefon: Sie fährt von
 *   unten herauf wie ein Sheet und beim Verlassen wieder hinunter.
 * - `fade` — zwischen zwei Ebenen (Tabs, am Rechner auch Gruppe und
 *   Verwaltung): Die alte ist sofort weg, die neue blendet über.
 * - `none` — der Browser hat schon selbst animiert (die Wischgeste zurück in
 *   Safari, `hasUAVisualTransition`); ein zweites Mal sähe man die Seite, die
 *   man gerade weggewischt hat, noch einmal gehen.
 * - `idle` — kurz nach jedem Wechsel, bis zum nächsten.
 *
 * **Zurück hat drei Wege, und jeder braucht etwas anderes:**
 *
 * - Der **Pfeil, der `router.back()` ruft** (`BackButton`), startet die View
 *   Transition selbst (`navigateBack`). React lässt sie bei `popstate` aus:
 *   Es rendert dort sofort, damit der Browser die Scrollposition
 *   wiederherstellen kann.
 * - Der **Pfeil, der auf die Liste verlinkt** (Termin, Thema, Notiz), ist für
 *   den Router ein Schritt vorwärts. Er sagt vorher, dass er zurück meint
 *   (`markBackNavigation`), und läuft dann wie jeder Link über React.
 * - **Alles andere** — der Knopf des Browsers, die Geste unter Android — kommt
 *   per CSS von links herein (`animate-back-in`), wie bisher. Hat der Browser
 *   schon selbst animiert, gar nicht.
 *
 * Ob es ein Zurück war, sagt `popstate` (oder die Markierung). Gemerkt wird
 * der Zeitpunkt, und als Zurück zählt der Wechsel, der kurz darauf ankommt:
 * Ein `popstate` ohne neue Seite (`?id=` wechselt, das Template bleibt stehen)
 * färbte sonst den nächsten gewöhnlichen Wechsel.
 */

/** Was für eine Seite das ist — daraus und aus der Richtung folgt die Bewegung. */
export type PageKind = 'tab' | 'side' | 'group' | 'detail';

export type NavMode =
  'idle' | 'push' | 'pop' | 'sheet-open' | 'sheet-close' | 'fade' | 'none';

/**
 * Die Kennung, die Tab-Leiste und Seitenspalte ihren Links mitgeben
 * (`transitionTypes`). Damit hängt `<ViewTransition>` die Seiten für diesen
 * Wechsel nicht heraus: Zwischen zwei Tabs reicht das Überblenden.
 */
export const LEVEL_TRANSITION = 'nav-level';

/** Das Attribut am Kasten jeder Seite — `data-page` in `template.tsx`. */
const PAGE_ATTRIBUTE = 'data-page';

/** Wie lange nach `popstate` ein neuer Seitenaufbau noch als Zurück gilt. */
const WINDOW_MS = 800;

/** Ab hier gilt die Seitenspalte — `md` in Tailwind. */
const DESKTOP = '(min-width: 48rem)';

let poppedAt = 0;
let markedAt = 0;
let animatedByBrowser = false;

/** Läuft gerade ein Zurück, das `navigateBack` selbst bewegt. */
let backInHand = false;

/** Die Art der Seite, die gerade steht — die nächste braucht sie als Herkunft. */
let current: PageKind | null = null;

/**
 * Nach dem Wechsel zurück auf `idle`. Das Bild der **alten** Seite hält der
 * Browser fest, bevor die neue das Attribut setzt — stünde dort noch die
 * Bewegung des letzten Wechsels, würde das Gerüst mal mit, mal ohne
 * festgehalten.
 */
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const IDLE_AFTER_MS = 900;

if (typeof window !== 'undefined') {
  // In der Einfangphase: So läuft das hier vor dem Router, der beim
  // `popstate` sofort rendert — und dabei schon wissen muss, dass es zurückgeht.
  window.addEventListener(
    'popstate',
    (event) => {
      poppedAt = Date.now();
      // Noch nicht überall bekannt; fehlt es, hat der Browser nichts gezeigt.
      animatedByBrowser =
        (event as PopStateEvent & { hasUAVisualTransition?: boolean })
          .hasUAVisualTransition === true;
    },
    { capture: true },
  );
}

const recently = (at: number) => Date.now() - at < WINDOW_MS;

const canTransition = () =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function wasBackNavigation(): boolean {
  return recently(poppedAt) || recently(markedAt);
}

/**
 * Ob dieses Zurück schon jemand bewegt — die View Transition oder der
 * Browser. Dann kommt die Seite nicht noch zusätzlich per CSS herein.
 */
export function backIsAnimated(): boolean {
  if (recently(poppedAt) && animatedByBrowser) return true;
  if (!canTransition()) return false;
  return backInHand || recently(markedAt);
}

/** Für einen Link, der zurückführt, obwohl er vorwärts navigiert. */
export function markBackNavigation(): void {
  markedAt = Date.now();
}

export function navModeOf(
  from: PageKind | null,
  to: PageKind,
  back: boolean,
  desktop: boolean,
): NavMode {
  // Am Rechner sind Gruppe und Verwaltung Ziele der Seitenspalte wie die Tabs.
  const level = (kind: PageKind) =>
    kind === 'tab' || (desktop && kind !== 'detail');

  if (from === null) return 'fade';
  if (level(from) && level(to)) return 'fade';

  if (!desktop) {
    if (to === 'group' && !back) return 'sheet-open';
    if (from === 'group' && back) return 'sheet-close';
  }

  if (back) return 'pop';
  if (level(to)) return 'fade';
  return 'push';
}

/**
 * Meldet die Seite an, die gerade eingehängt wurde, und stellt die Bewegung
 * für diesen Wechsel ein. Einmal je Seite — der Aufrufer sorgt dafür.
 */
export function enterPage(kind: PageKind, back: boolean): void {
  const desktop = window.matchMedia(DESKTOP).matches;
  const mode =
    back && recently(poppedAt) && animatedByBrowser
      ? 'none'
      : navModeOf(current, kind, back, desktop);

  document.documentElement.dataset.nav = mode;
  current = kind;

  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    document.documentElement.dataset.nav = 'idle';
  }, IDLE_AFTER_MS);
}

function name(element: HTMLElement, role: 'page-in' | 'page-out'): void {
  element.style.setProperty('view-transition-name', role);
  element.style.setProperty('view-transition-class', role);
}

function unname(element: HTMLElement): void {
  element.style.removeProperty('view-transition-name');
  element.style.removeProperty('view-transition-class');
}

/**
 * Zurück, mit einer Seite, die hinausgleitet.
 *
 * Der Browser hält die alte Seite als `page-out` fest, dann geht es zurück,
 * und die neue wird `page-in` — dieselben Namen, die `<ViewTransition>` sonst
 * vergibt, also dieselben Regeln in `globals.css`. Gewartet wird auf den
 * `popstate` und darauf, dass der Router fertig ist; bleibt das Template
 * stehen (nur `?id=` wechselt), geht die alte allein.
 *
 * Ohne View Transitions, oder wer weniger Bewegung eingestellt hat, geht es
 * einfach zurück.
 */
export function navigateBack(back: () => void): void {
  const old = document.querySelector<HTMLElement>(`[${PAGE_ATTRIBUTE}]`);
  if (!old || !canTransition()) {
    back();
    return;
  }

  name(old, 'page-out');
  backInHand = true;

  let arrived: HTMLElement | null = null;

  const transition = document.startViewTransition(async () => {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        window.removeEventListener('popstate', done);
        // Der Router rendert beim `popstate` sofort, aber erst nach diesem
        // Aufruf — einen Takt später steht die neue Seite.
        setTimeout(resolve, 0);
      };
      const timer = setTimeout(done, 600);
      window.addEventListener('popstate', done);
      back();
    });

    const fresh = document.querySelector<HTMLElement>(`[${PAGE_ATTRIBUTE}]`);
    if (fresh && fresh !== old) {
      arrived = fresh;
      name(fresh, 'page-in');
    } else {
      unname(old);
    }
  });

  const cleanUp = () => {
    backInHand = false;
    unname(old);
    if (arrived) unname(arrived);
  };

  // Abgebrochen wird eine View Transition etwa, wenn währenddessen eine
  // zweite beginnt. Dann ist die Seite trotzdem gewechselt — nur ohne Bild.
  transition.ready.catch(() => {});
  transition.finished.then(cleanUp, cleanUp);
}
