'use client';

/**
 * „Wo treffen wir uns" am Termin — in drei Zuständen.
 *
 * - **Noch offen**: eine gestrichelte Fläche, die selbst der Knopf ist — „Ort
 *   oder Gastgeber festlegen". Ein Titel „Noch offen" mit einem Stift daneben
 *   sagte dasselbe zweimal und verlangte, den Stift zu finden.
 * - **Treffpunkt**: Stecknadel, Name, Adresse.
 * - **Bei jemandem zu Hause**: Die Überschrift sagt es („Bei Gastgeber
 *   zuhause"), statt der Stecknadel steht ein Haus, und daran klein **das
 *   Gesicht des Gastgebers**. Ein Zuhause heißt schon „Bei Niko" — wer das ist,
 *   sieht man so, ohne dass sein Name ein zweites Mal dasteht. Das Haus ist das
 *   Größere: Die Sektion beantwortet „wo", nicht „wer".
 *
 * **Der Stift ist der einzige Eingang zum Ort**, in beide Richtungen (Zuhause
 * oder Treffpunkt, `VenueSheet`); der Gastgeber steht deshalb nicht unter
 * „Zuständigkeiten". **Maps steht unter dem Ort**, durch einen Strich getrennt
 * und über die volle Breite: zwei Knöpfe in einer Zeile ließen Name und Adresse
 * kaum Platz, und es sind zwei Absichten — „anders" und „hin".
 */
import {
  ChevronRight,
  House,
  MapPin,
  MapPinPen,
  Navigation,
  Plus,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { IconButton, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { mapsUrl } from '@/lib/meeting';
import type { Meeting } from '@/lib/api/types';

export function VenueCard({
  meeting,
  editable,
  showMaps,
  onChange,
}: {
  meeting: Meeting;
  /** Nicht an einem abgesagten Abend und nicht beim Nachlesen. */
  editable: boolean;
  /**
   * „Wie komme ich hin" — nicht beim Nachlesen: Das fragt an einem Abend, der
   * vorbei ist, niemand.
   */
  showMaps: boolean;
  onChange: () => void;
}) {
  const location = meeting.location;

  if (!location) {
    // Ohne Ort und ohne die Möglichkeit, einen einzutragen, gibt es nichts zu
    // sagen — „Noch offen" an einem vergangenen Abend ist keine Auskunft.
    if (!editable) return null;

    return (
      <section>
        <SectionTitle>Ort & Anreise</SectionTitle>
        <button
          type="button"
          onClick={onChange}
          className={cn(
            'group flex w-full items-center gap-4 rounded-card border border-dashed border-line-strong p-4 text-left transition-colors hover:border-terracotta-400',
            'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
            PRESSABLE,
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-500/10 text-terracotta-500">
            <Plus size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-stone-800">
              Ort oder Gastgeber festlegen
            </span>
            <span className="mt-0.5 block text-xs text-stone-400">
              Treffpunkt wählen oder dich als Host eintragen
            </span>
          </span>
          <ChevronRight
            size={16}
            className="shrink-0 text-stone-400 transition-colors group-hover:text-terracotta-500"
          />
        </button>
      </section>
    );
  }

  const home = location.requiresHost;

  return (
    <section>
      <SectionTitle>
        {home ? 'Bei Gastgeber zuhause' : 'Ort & Anreise'}
      </SectionTitle>
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-4 p-4">
          <span className="relative shrink-0">
            <span className="flex size-12 items-center justify-center rounded-xl border border-terracotta-500/30 bg-terracotta-500/10 text-terracotta-500">
              {home ? <House size={21} /> : <MapPin size={21} />}
            </span>
            {/* Das Gesicht als Abzeichen am Haus: Die Kachel sagt, was für ein
                Ort das ist, das Bild, wessen. Es lässt sich groß ansehen wie
                überall — deshalb sitzt die Lage an einer Hülle: Mit Bild ist
                der Avatar ein Knopf um das `<img>`, und eine Klasse am Avatar
                landete am Bild darin. */}
            {home && meeting.host && (
              <span className="absolute -right-1.5 -bottom-1.5 flex rounded-full ring-2 ring-card">
                <Avatar person={meeting.host} size="xs" />
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-lg font-bold text-stone-900">
              {location.name}
            </p>
            <p className="mt-0.5 truncate text-sm text-stone-500">
              {location.address ?? 'Keine Adresse hinterlegt'}
            </p>
          </div>

          {editable && (
            <IconButton label="Ort ändern" onClick={onChange}>
              <MapPinPen size={17} />
            </IconButton>
          )}
        </div>

        {showMaps && (
          <a
            href={mapsUrl(location)}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'flex items-center justify-center gap-2 border-t border-line py-3 text-sm font-semibold text-terracotta-500 transition-colors hover:bg-canvas hover:text-terracotta-600',
              'focus-visible:bg-canvas focus-visible:outline-none',
            )}
          >
            <Navigation size={15} />
            In Google Maps öffnen
          </a>
        )}
      </Card>
    </section>
  );
}
