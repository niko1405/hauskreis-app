/**
 * Eigene Versionen eines Lieds — **nur in diesem Gerät**.
 *
 * Text und Akkorde eines Lieds gehören dem, der sie geschrieben hat, und die
 * App hat kein Recht, sie zu verbreiten. Deshalb liegt hier, was jemand für
 * sich hinterlegt, und nirgends sonst: kein Endpunkt, kein Abgleich zwischen
 * Geräten, keine Sicherung, kein Teilen. Wer die App löscht oder das Telefon
 * wechselt, fängt neu an — so steht es auch beim Speichern dabei.
 *
 * **IndexedDB und nicht `localStorage`.** Ein Blatt wiegt ein paar Kilobyte,
 * eine Sammlung von hundert Liedern einige hundert, und `localStorage` ist
 * synchron, klein und teilt sich seinen Platz mit allem anderen. IndexedDB
 * liest asynchron und wächst mit.
 *
 * **Je Person getrennt**, über den Schlüssel `[personId, songId]`. Zwei Konten
 * auf demselben Gerät sehen einander nichts — „nur für dich" heißt auch das.
 *
 * Ohne Abhängigkeit: Die vier Aufrufe, die hier gebraucht werden, sind die
 * wenigen Zeilen um `request()` nicht wert, eine Bibliothek dafür zu laden.
 */

export interface OwnSong {
  personId: string;
  hauskreisId: string;
  songId: string;
  /** Titel und Interpret beim letzten Öffnen — für „Meine Lieder" ohne Netz. */
  title: string;
  artist: string | null;
  /** Das Blatt als ChordPro (`lib/chords/chordpro.ts`). */
  text: string;
  /** Die erkannte oder angegebene Tonart des Blatts, wie es gespeichert ist. */
  key: string | null;
  capo: number | null;
  /** Halbtöne, um die im Vollbild verschoben wird — gemerkt je Lied. */
  transpose: number;
  /** Stufe 1–10 für den Autoscroll — ein langsames Lied scrollt langsam. */
  scrollSpeed: number;
  /**
   * Die gewählten Griffe im Vollbild, je `instrument:Akkord` die Nummer der
   * Variante. Fehlt bei Versionen von vorher — dann gilt überall die erste.
   */
  voicings?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

const DATABASE = 'hauskreis-eigene-lieder';
const VERSION = 1;
const STORE = 'versions';
const BY_OWNER = 'byOwner';

/** Ohne IndexedDB — etwa in einem privaten Fenster mancher Browser. */
export class OwnSongStorageError extends Error {
  constructor(cause?: unknown) {
    super(
      'Dieser Browser lässt die App hier nichts speichern — etwa in einem privaten Fenster.',
    );
    this.name = 'OwnSongStorageError';
    this.cause = cause;
  }
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;

  opening = new Promise<IDBDatabase>((resolve, reject) => {
    let opener: IDBOpenDBRequest;
    try {
      opener = indexedDB.open(DATABASE, VERSION);
    } catch (error) {
      reject(new OwnSongStorageError(error));
      return;
    }

    opener.addEventListener('upgradeneeded', () => {
      const database = opener.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, {
          keyPath: ['personId', 'songId'],
        });
        store.createIndex(BY_OWNER, ['personId', 'hauskreisId']);
      }
    });
    opener.addEventListener('success', () => {
      const database = opener.result;
      // Öffnet ein neuerer Tab eine neue Fassung, macht dieser hier Platz und
      // öffnet beim nächsten Zugriff neu.
      database.addEventListener('versionchange', () => {
        database.close();
        opening = null;
      });
      resolve(database);
    });
    opener.addEventListener('error', () =>
      reject(new OwnSongStorageError(opener.error)),
    );
    opener.addEventListener('blocked', () => reject(new OwnSongStorageError()));
  });

  // Ein Fehlschlag soll beim nächsten Versuch wieder fragen dürfen.
  opening.catch(() => {
    opening = null;
  });

  return opening;
}

function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction;
        let pending: IDBRequest<T>;
        try {
          transaction = database.transaction(STORE, mode);
          pending = run(transaction.objectStore(STORE));
        } catch (error) {
          reject(new OwnSongStorageError(error));
          return;
        }
        // Erst wenn die Transaktion durch ist, ist auch geschrieben.
        transaction.addEventListener('complete', () => resolve(pending.result));
        transaction.addEventListener('error', () =>
          reject(new OwnSongStorageError(transaction.error)),
        );
        transaction.addEventListener('abort', () =>
          reject(new OwnSongStorageError(transaction.error)),
        );
      }),
  );
}

export function getOwnSong(
  personId: string,
  songId: string,
): Promise<OwnSong | null> {
  return request<OwnSong | undefined>('readonly', (store) =>
    store.get([personId, songId]),
  ).then((found) => found ?? null);
}

export function listOwnSongs(
  personId: string,
  hauskreisId: string,
): Promise<OwnSong[]> {
  return request<OwnSong[]>('readonly', (store) =>
    store.index(BY_OWNER).getAll([personId, hauskreisId]),
  );
}

let persistAsked = false;

/**
 * Bittet den Browser, die Daten nicht von sich aus zu räumen.
 *
 * Einmal je Sitzung und beim ersten Speichern, nicht beim Start: Erst dann
 * gibt es etwas, das verloren gehen könnte. Eine Absage ändert nichts am
 * Speichern selbst — sie heißt nur, dass der Browser bei knappem Platz
 * aufräumen darf.
 */
function askToPersist(): void {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

export function putOwnSong(song: OwnSong): Promise<OwnSong> {
  askToPersist();
  return request('readwrite', (store) => store.put(song)).then(() => song);
}

export function removeOwnSong(personId: string, songId: string): Promise<void> {
  return request('readwrite', (store) => store.delete([personId, songId])).then(
    () => undefined,
  );
}
