/**
 * Alle Endpunkt-Funktionen unter einem Dach. Nur Transport, keine
 * React-Abhängigkeit — dadurch auch außerhalb von Komponenten benutzbar
 * (Prefetch, Service Worker, Skripte).
 */
export * as absencesApi from './absences';
export * as coreApi from './core';
export * as dashboardApi from './dashboard';
export * as locationsApi from './locations';
export * as meetingSongsApi from './meeting-songs';
export * as meetingTopicsApi from './meeting-topics';
export * as meetingsApi from './meetings';
export * as peopleApi from './people';
export * as prayerBuddiesApi from './prayer-buddies';
export * as pushApi from './push';
export * as songLookupApi from './song-lookup';
export * as songsApi from './songs';
export * as topicsApi from './topics';
