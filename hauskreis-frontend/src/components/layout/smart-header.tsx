'use client';

/**
 * Die Kopfleiste über den fünf Tabs.
 *
 * **Warum es sie gibt.** Die Leiste unten ist mit fünf Zielen voll; ein
 * sechstes für den Gruppen-Bildschirm machte sie eng. Der Weg dorthin musste
 * also nach oben — nur wäre ein starrer Balken das Ende der Kopfbilder, die auf
 * drei Bildschirmen die halbe Gestaltung tragen.
 *
 * **Zwei Zustände.** Ganz oben ein Schleier, durch den das Kopfbild durchgeht;
 * Bild und Name stehen frei darauf, die Knöpfe als Glas. Sobald gescrollt
 * wurde, ein gedämpfter Terracotta-Verlauf mit Durchsicht — dann liegt Text
 * darunter, und der braucht eine Kante.
 *
 * **Warum der Schleier aus zwei Lagen besteht** (`.header-veil` in
 * `globals.css`), steht dort ausführlich: Schwarz obenauf für die Lesbarkeit
 * und weil `StatusBarScrim` darüber ebenfalls schwarz ist, ein angedeuteter
 * Terracotta-Anteil darunter. Rein schwarz war er auch schon einmal, und dann
 * wirkten Bild, Name und Knöpfe, als gehörten sie zur Seite statt zu einer
 * Leiste. Die Farbe ist das, was sie zusammenhält.
 *
 * **Links steht kein Knopf.** Bild und Name sind Identität, der Weg zur Gruppe
 * ist der hervorgehobene Knopf rechts. Vorher trug beides eine Pille mit
 * eigenem Hintergrund — eine zweite Fläche über dem Foto, und damit der zweite
 * Grund für den Overlay-Eindruck.
 *
 * **Und ganz oben steht auch links nichts.** Über dem Kopfbild trugen Bild,
 * Name, Gruppe-Knopf und Glocke gemeinsam auf — vier Dinge über einem Foto, das
 * selbst schon sagt, wo man ist. Die Identität blendet deshalb mit dem Balken
 * ein: Dort liegt kein Bild darunter, das sie verdecken könnte, und dort ist sie
 * das Einzige, was den Balken einer Seite zuordnet.
 *
 * Ausgeblendet und nicht entfernt — der Block trägt `flex-1` und hält die
 * beiden Knöpfe rechts. Nähme man ihn heraus, sprängen sie beim Umschalten.
 *
 * **`sticky` und nicht `fixed`.** Die App ist ab `md` eine zentrierte Spalte
 * mit Seitenleiste; `fixed` müsste diese Geometrie ein zweites Mal nachbauen.
 * Die negative Untermarge (`header-inset`) nimmt ihr die Höhe im Fluss, sodass
 * sie über dem Inhalt liegt statt vor ihm.
 *
 * **Warum die Nachrichten-Blase daneben steht und nicht darin.** Die Leiste
 * trägt beim Wegfahren ein `transform`, und ein transformiertes Element wird
 * zum Bezugsrahmen für jedes `position: fixed` darin — dieselbe Eigenschaft,
 * wegen der `pull-to-refresh.tsx` den Inhalt nie verschiebt. Die Blase säße
 * sonst in einem 56 Pixel hohen Kasten statt unter der Glocke.
 */
import Link from '@/components/ui/link';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { PRESSABLE } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { GroupAvatar } from './group-avatar';
import { NotificationBell } from './notification-bell';
import { NotificationInbox } from './notification-inbox';
import { useHasSmartHeader, useHeaderScroll } from './use-header-scroll';

export function SmartHeader() {
  const show = useHasSmartHeader();
  const { atTop, hidden } = useHeaderScroll();
  const { hauskreis } = useHauskreis();
  const [inbox, setInbox] = useState(false);

  if (!show) return null;

  return (
    <>
      <header
        className={cn(
          'header-inset sticky top-0 z-40 transition-colors duration-200',
          // Der Übergang gilt **nur beim Zurückkommen**. Beim Wegfahren fällt
          // die Klasse im selben Render weg, in dem die Verschiebung dazukommt:
          // Die Leiste ist damit sofort weg, statt sich sichtbar hinauszu-
          // schieben. Genau darum ging es — was man während des Hinausschiebens
          // sieht, ist der Balken, den man erst beim Hochwischen sehen soll.
          hidden ? '-translate-y-full' : 'transition-transform duration-200',
          atTop
            ? 'header-veil'
            : 'bg-gradient-to-b from-header-bar/95 to-header-bar-deep/95 shadow-md shadow-black/10 backdrop-blur',
        )}
      >
        <div className="h-header flex items-end gap-3 px-4 pb-2.5">
          {/* Identität, kein Ziel — und erst auf dem Balken. Der Ring hält das
              Bild von einem hellen Untergrund ab, in den es sonst ausliefe. */}
          <div
            aria-hidden={atTop}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 transition-opacity duration-200',
              atTop && 'pointer-events-none opacity-0',
            )}
          >
            <GroupAvatar size="sm" className="ring-1 ring-white/25" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
              {hauskreis?.name ?? 'Hauskreis'}
            </span>
          </div>

          {/* Der eine Weg zur Gruppe, und der einzige hervorgehobene Knopf der
              Leiste. Ganz oben als Glas, damit er sich ins Foto einfügt; auf
              dem Balken hell gefüllt, weil er sich sonst darin verlöre. */}
          <Link
            href="/hauskreis"
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-3 text-[11px] font-bold tracking-wider uppercase transition-colors',
              PRESSABLE,
              atTop
                ? 'bg-black/30 text-white ring-1 ring-white/25 backdrop-blur-md'
                : 'bg-canvas text-terracotta-700 ring-1 ring-black/5',
            )}
          >
            <Users
              size={15}
              strokeWidth={2.2}
              className={atTop ? 'text-terracotta-400' : undefined}
            />
            Gruppe
          </Link>

          {/* Ganz außen, und zwar sie und nicht „Gruppe": Die Glocke ist die
              wiederkehrende Aktion, auf allen fünf Bildschirmen dieselbe und
              mehrmals am Tag gebraucht. Die äußerste Ecke ist der Platz, den
              der Daumen ohne Hinsehen findet. Zur Gruppe geht man einmal. */}
          <NotificationBell atTop={atTop} onClick={() => setInbox(true)} />
        </div>
      </header>

      {/* Außerhalb der Leiste — siehe oben, `transform`. */}
      <NotificationInbox open={inbox} onClose={() => setInbox(false)} />
    </>
  );
}
