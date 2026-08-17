/**
 * Der Schleier über der Statusleiste.
 *
 * Seit `statusBarStyle: 'black-translucent'` (`app/layout.tsx`) reicht die App
 * bis unter die Notch — das Kopfbild geht durch, statt an einem Streifen
 * aufzuhören. Der Preis dafür: iOS zeichnet Uhr, Netz und Batterie ab dann
 * **immer weiß**, einen zweiten Wert gibt es nicht. Auf der cremefarbenen
 * Leinwand wären sie unsichtbar, und auf einem hellen Kopfbild kaum besser.
 *
 * Also derselbe Kniff, den native Apps über Fotos benutzen: ein dunkler
 * Verlauf, oben kräftig, nach unten aus. Er ist zwei Dinge zugleich — die
 * Lesbarkeit der Uhr und die Kante, die einem sagt, wo oben ist.
 *
 * Die Höhe ist **genau** der sichere Rand, und das ist der eigentliche Trick:
 * Ohne Notch — am Rechner, im Browser-Tab, unter Android — ist `env()` null,
 * das Element damit null Pixel hoch und nicht vorhanden. Es braucht keine
 * Abfrage, welches Gerät gerade zusieht.
 *
 * **Im Gerüst wäre er zu tief.** Er steht deshalb im Wurzel-Layout: Die
 * Anmeldeseite, „Seite nicht gefunden" und der Wartebildschirm liegen außerhalb
 * von `AppShell`, und ausgerechnet die Anmeldeseite ist das erste, was jemand
 * sieht. Eine unsichtbare Uhr über dem hellen Kasten wäre ein merkwürdiger
 * Empfang. Was React gar nicht rendert — die Offline-Seite des Service Workers
 * — bringt seinen eigenen mit.
 *
 * `z-40`: über der Leiste unten (`z-30`) und über den Kopfbildern, unter Sheets
 * und Meldungen (`z-50`) — die bringen ihren eigenen Abstand mit.
 */
export function StatusBarScrim() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-gradient-to-b from-black/45 to-transparent"
    />
  );
}
