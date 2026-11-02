'use client';

/**
 * Die Verwaltung als **ein** Formular — mit einem Speichern für alles.
 *
 * **Warum nicht mehr je Karte.** Die Seite hatte fünf Speichern-Knöpfe und
 * dazwischen Schalter, die sofort schrieben. Wer drei Dinge umstellte, drückte
 * drei Knöpfe an drei Stellen, und ob ein Schalter schon galt, sah man ihm
 * nicht an. Jetzt ist alles, was hier steht, ein Entwurf (Soll), bis der
 * Balken unten es schreibt — und der Balken ist genau dann da, wenn Soll und
 * Ist auseinanderliegen.
 *
 * **Was nicht dazugehört**, sind Aktionen: einladen, Rechte geben, entfernen,
 * eine Gebetsrunde weiterschalten, die Läufe. Sie tun etwas, statt etwas
 * einzustellen, und fragen vorher nach, wo es nötig ist.
 *
 * **Ein Register und kein gemeinsamer Zustand.** Jede Karte lädt ihre eigenen
 * Daten und hält ihren eigenen Entwurf; hier meldet sie nur an, ob sie
 * abweicht, ob sie so gespeichert werden darf, und wie man sie speichert oder
 * verwirft. Den Entwurf hierher zu ziehen hieße, fünf Ressourcen an einer
 * Stelle zu kennen, die keine davon braucht.
 *
 * **Und wer geht, wird gefragt** (`useUnsavedGuard`): Jeder Link der App fragt
 * nach, solange etwas offen ist, der Browser beim Neuladen und Schließen.
 */
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BottomSlot } from '@/components/layout/bottom-slot';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useUnsavedGuard } from '@/components/ui/unsaved';

export interface DraftSection {
  /** Weicht der Entwurf vom Stand des Servers ab? */
  dirty: boolean;
  /** Warum so nicht gespeichert werden kann — `undefined` heißt: es geht. */
  invalid?: string;
  /** Schreibt den Entwurf. Wirft, wenn es nicht geklappt hat. */
  save: () => Promise<void>;
  /** Zurück auf den Stand des Servers. */
  reset: () => void;
}

interface Entry {
  dirty: boolean;
  invalid?: string;
  section: React.RefObject<DraftSection>;
}

interface Registry {
  report: (key: string, entry: Entry) => void;
  remove: (key: string) => void;
}

const Context = createContext<Registry | null>(null);

export function AdminDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Eine `Map` hält die Reihenfolge der Anmeldung — und die ist die der Karten
  // auf der Seite. In dieser Folge wird gespeichert.
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(
    () => new Map(),
  );

  const report = useCallback((key: string, entry: Entry) => {
    setEntries((current) => {
      const previous = current.get(key);
      if (
        previous &&
        previous.dirty === entry.dirty &&
        previous.invalid === entry.invalid
      ) {
        return current;
      }
      return new Map(current).set(key, entry);
    });
  }, []);

  const remove = useCallback((key: string) => {
    setEntries((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const registry = useMemo(() => ({ report, remove }), [report, remove]);

  const dirty = [...entries.values()].filter((entry) => entry.dirty);
  useUnsavedGuard(dirty.length > 0);

  return (
    <Context.Provider value={registry}>
      {children}
      {dirty.length > 0 && <SaveBar entries={dirty} />}
    </Context.Provider>
  );
}

/**
 * Meldet eine Karte an. Der Abschnitt darf bei jedem Rendern ein neues Objekt
 * sein — gelesen wird er über eine Ref, angemeldet wird nur, wenn sich `dirty`
 * oder `invalid` ändern.
 */
export function useAdminDraftSection(key: string, section: DraftSection) {
  const registry = useContext(Context);
  if (!registry) {
    throw new Error('useAdminDraftSection außerhalb des AdminDraftProvider');
  }

  const latest = useRef(section);
  useEffect(() => {
    latest.current = section;
  });

  const { report, remove } = registry;
  const { dirty, invalid } = section;

  useEffect(() => {
    report(key, { dirty, invalid, section: latest });
  }, [report, key, dirty, invalid]);

  useEffect(() => () => remove(key), [remove, key]);
}

/**
 * Der Balken unten — da, solange etwas abweicht.
 *
 * Er ersetzt den Platz unter der Seite wie der Antwort-Balken am Termin
 * (`BottomSlot`). Verschwindet die letzte Abweichung, gibt er ihn zurück:
 * Dann ist nichts zu speichern, und ein ausgegrauter Knopf fragte nur nach
 * einer Erklärung.
 */
function SaveBar({ entries }: { entries: Entry[] }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // Der erste Grund genügt. Zwei Sätze untereinander wären ein Absatz über
  // einem Knopf — und behebt man den ersten, steht der zweite da.
  const invalid = entries.find((entry) => entry.invalid)?.invalid;

  const save = async () => {
    setSaving(true);
    try {
      // Nacheinander und nicht gleichzeitig: Die Karten schreiben
      // verschiedene Ressourcen, aber eine Antwort kann einen Plan anstoßen,
      // den die nächste liest (Geschenke). Und geht etwas schief, steht der
      // Rest noch als Entwurf da, statt halb geschrieben zu sein.
      for (const entry of entries) {
        await entry.section.current.save();
      }
      toast.success('Gespeichert.');
    } catch {
      // Gemeldet hat es schon der Hook: als Toast oder als Konflikt-Hinweis
      // an der Karte. Was nicht gespeichert wurde, steht weiter als Entwurf da.
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSlot>
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="pb-safe sticky bottom-0 z-30 border-t border-line bg-canvas/95 px-5 pt-3 backdrop-blur"
      >
        {invalid && (
          <p className="pb-2 text-center text-[11px] font-semibold text-alert">
            {invalid}
          </p>
        )}
        {/* `pb-3` und nicht `mb-3`, wie am `EditBar`: Der Außenabstand fiele
            durch den Balken hindurch, und darunter schiene die Seite durch. */}
        <div className="flex gap-2 pb-3">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={saving}
            onClick={() => {
              for (const entry of entries) entry.section.current.reset();
            }}
          >
            Verwerfen
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            disabled={invalid !== undefined}
            onClick={() => void save()}
          >
            <Check size={16} /> Speichern
          </Button>
        </div>
      </motion.div>
    </BottomSlot>
  );
}
