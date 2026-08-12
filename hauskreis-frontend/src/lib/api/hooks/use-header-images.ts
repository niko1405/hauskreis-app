'use client';

/**
 * Die Hintergrundbilder im Kopfbereich.
 *
 * Zuschnitt Zeile für Zeile von `usePersonPhoto`: die **Liste** sagt, welche
 * Bildschirme ein Bild haben und seit wann, und der Zeitstempel wandert in den
 * Schlüssel der Datei-Abfrage. Ein neues Bild ist damit ein neuer Schlüssel,
 * und der alte Eintrag verfällt von selbst — ohne dass irgendwer von Hand
 * invalidieren müsste.
 */
import { useQuery } from '@tanstack/react-query';
import { headerImagesApi } from '../endpoints';
import type { HeaderScreen } from '../types';
import { useHk } from './use-hk';
import { useApiMutation } from './use-resource';

const HOUR = 60 * 60 * 1000;

/** Für welche der vier Bildschirme ein eigenes Bild gesetzt ist. */
export function useHeaderImages() {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.headerImages.list,
    queryFn: ({ signal }) =>
      headerImagesApi.listHeaderImages(hauskreisId, signal),
    enabled,
    // Vier Zeitstempel, die sich ändern, wenn jemand ein Bild tauscht — das
    // passiert vielleicht einmal im Jahr.
    staleTime: HOUR,
  });
}

/**
 * Das Bild eines Bildschirms.
 *
 * Gibt **zwei** Dinge zurück, und der Unterschied ist keine Spitzfindigkeit:
 * `dataUrl` ist die geladene Datei, `exists` die Auskunft der Liste. Zwischen
 * beiden liegen ein paar hundert Millisekunden, und in diesem Fenster gibt es
 * ein Bild, das man noch nicht sieht — das Sheet muss trotzdem schon „Zurück
 * zum Standard" anbieten.
 *
 * Kein `dataUrl` heißt meistens nicht „lädt noch", sondern „es gibt keins":
 * dann steht der mitgelieferte Verlauf da, und das ist ein gültiger Zustand,
 * kein Fehler.
 */
export function useHeaderImage(screen: HeaderScreen) {
  const { hauskreisId, keys } = useHk();
  const images = useHeaderImages();

  const updatedAt = images.data?.find(
    (row) => row.screen === screen,
  )?.updatedAt;

  const file = useQuery({
    queryKey: keys.headerImages.file(screen, updatedAt ?? ''),
    queryFn: ({ signal }) =>
      headerImagesApi.getHeaderImage(hauskreisId, screen, signal),
    enabled: Boolean(hauskreisId) && updatedAt !== undefined,
    // Unter demselben Schlüssel **kann** sich nichts mehr ändern.
    staleTime: Infinity,
    // Ein fehlendes Bild ist kein Netzproblem — es noch dreimal zu versuchen
    // hilft niemandem.
    retry: false,
  });

  return { dataUrl: file.data, exists: updatedAt !== undefined };
}

/** Ein neues Bild setzen. */
export function useUploadHeaderImage(screen: HeaderScreen) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (file: File) =>
      headerImagesApi.uploadHeaderImage(hauskreisId, screen, file),
    { invalidateKeys: [[...keys.headerImages.all]] },
  );
}

/** Und wieder entfernen — zurück zum Verlauf. */
export function useDeleteHeaderImage(screen: HeaderScreen) {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    () => headerImagesApi.deleteHeaderImage(hauskreisId, screen),
    { invalidateKeys: [[...keys.headerImages.all]] },
  );
}
