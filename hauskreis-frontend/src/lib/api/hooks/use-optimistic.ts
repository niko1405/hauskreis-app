'use client';

/**
 * Vorgreifen, statt zu warten.
 *
 * Ein Ja/Nein am Termin ist ein Schalter, kein Formular: er soll umspringen,
 * wenn man ihn antippt, nicht wenn der Server antwortet. Bisher wartete jede
 * Änderung auf die Runde zum Server und zurück — auf einem Handy im Zug sind
 * das mehrere Sekunden, in denen der Knopf sich anfühlt wie kaputt.
 *
 * Deshalb hier ein Baustein und kein Rahmenwerk: `patch` setzt einen
 * Cache-Eintrag vorläufig und merkt sich, was vorher darin stand. Geht der
 * Aufruf schief, dreht `rollback` alles zurück — und die Fehlermeldung dazu
 * kommt aus `useApiMutation`, denn ein Rückfall ohne Erklärung sieht aus wie
 * ein Geist.
 *
 * **Wer vorgreift, sperrt nicht.** Die Schalter hingen bisher an
 * `disabled={…isPending}`; zusammen mit einem vorgreifenden Cache wäre das
 * genau verkehrt herum — die Anzeige stimmt schon, aber der Knopf ist noch
 * eine Sekunde lang tot, und ein Fehlgriff lässt sich nicht sofort
 * zurücknehmen.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Ändert einen Eintrag im Cache, bevor der Server gefragt wurde.
 *
 * Muss abgewartet werden: davor läuft `cancelQueries`, und ohne das Warten
 * stünde die Rücknahme nicht rechtzeitig fest.
 */
export type Patch = <T>(
  key: QueryKey,
  updater: (previous: T) => T,
) => Promise<void>;

/**
 * Dasselbe für **alle** Einträge unter einem Präfix.
 *
 * Nötig, weil die Filter einer Liste im Schlüssel stecken: von der Terminliste
 * liegen je nach Suchbegriff und „Kommende/Vergangene" mehrere Fassungen im
 * Cache, und wer in einer davon zusagt, hat es auch in den anderen getan.
 */
export type PatchAll = <T>(
  prefix: QueryKey,
  updater: (previous: T) => T,
) => Promise<void>;

export interface OptimisticContext {
  rollback: () => void;
}

/** Was ein Hook mitgibt, um vorzugreifen. */
export type OptimisticUpdate<TInput> = (
  input: TInput,
  patch: Patch,
  patchAll: PatchAll,
) => void | Promise<void>;

export async function applyOptimistic<TInput>(
  queryClient: QueryClient,
  input: TInput,
  optimistic: OptimisticUpdate<TInput>,
): Promise<OptimisticContext> {
  const undo: (() => void)[] = [];

  const write = (key: QueryKey, previous: unknown, next: unknown) => {
    undo.push(() => queryClient.setQueryData(key, previous));
    queryClient.setQueryData(key, next);
  };

  const patch: Patch = async (key, updater) => {
    // Ein laufendes GET würde sonst gleich wieder den alten Stand hinschreiben
    // — und der Knopf spränge sichtbar zurück, obwohl nichts schiefging.
    await queryClient.cancelQueries({ queryKey: key });

    const previous = queryClient.getQueryData(key);
    // Nichts geladen heißt: diese Ansicht ist gerade gar nicht offen. Dann gibt
    // es nichts vorzugreifen und erst recht nichts zurückzunehmen.
    if (previous === undefined) return;

    write(key, previous, updater(previous as never));
  };

  const patchAll: PatchAll = async (prefix, updater) => {
    await queryClient.cancelQueries({ queryKey: prefix });

    for (const [key, previous] of queryClient.getQueriesData({
      queryKey: prefix,
    })) {
      if (previous === undefined) continue;
      write(key, previous, updater(previous as never));
    }
  };

  await optimistic(input, patch, patchAll);

  return {
    // Rückwärts, damit sich zwei Eingriffe am selben Key nicht in die Quere
    // kommen.
    rollback: () => {
      for (const step of undo.toReversed()) step();
    },
  };
}
