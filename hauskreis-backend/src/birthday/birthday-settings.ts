import { BirthdayGiftMode } from '../../generated/prisma/enums';

/**
 * Die Einstellungen, auf das reduziert, was gerechnet wird.
 *
 * Eine eigene Datei, weil der Planer sie **ohne** Zeile in der Datenbank
 * braucht: Ein nächtlicher Lauf soll keine Konfiguration erzeugen, nur weil er
 * nachgesehen hat. Dieselbe Trennung wie zwischen `getConfig` und `getRhythm`
 * beim Terminplan.
 */
export interface GiftSettings {
  enabled: boolean;
  mode: BirthdayGiftMode;
  freezeDays: number;
}

/**
 * **Aus.** Nicht jeder Hauskreis beschenkt sich, und ein System, das ungefragt
 * Zuständigkeiten verteilt und Nachrichten verschickt, wäre für die ein
 * Ärgernis statt einer Hilfe. Die Geburtstage im Kalender kosten dagegen
 * niemanden etwas — die stehen von Anfang an da.
 */
export const DEFAULT_GIFT_CONFIG: GiftSettings = {
  enabled: false,
  mode: BirthdayGiftMode.ROTATING,
  freezeDays: 14,
};

/** Grenzen für die Frist. Unter einem Tag ist sie keine, über 90 ein Vierteljahr. */
export const MIN_FREEZE_DAYS = 1;
export const MAX_FREEZE_DAYS = 90;
