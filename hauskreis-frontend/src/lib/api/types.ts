/**
 * Lesbare Namen für die erzeugten Schema-Typen.
 *
 * `schema.d.ts` kommt aus `pnpm gen:api` und wird nicht von Hand geändert. Die
 * Spec verwendet durchgehend eingebettete Objekte statt `$ref`, deshalb haben
 * verschachtelte Formen dort keinen eigenen Namen — hier bekommen sie einen.
 */
import type { components } from './schema';

type S = components['schemas'];

/** Hülle jeder paginierten Liste (`docs/api-fuer-frontend.md` §5). */
export interface Page<T> {
  items: T[];
  total: number;
  take: number;
  skip: number;
  hasMore: boolean;
}

/**
 * Eine Person, wie sie überall eingebettet auftaucht.
 *
 * `photoUpdatedAt` ist dabei, weil ein Avatar überall dort steht, wo jemand
 * *benannt* wird — als Gastgeber, als Themen-Zuständige, als Gebetsbuddy. Ohne
 * das Feld hier müsste jede dieser Ansichten die Personenliste dazuladen, nur
 * um an ein Bild zu kommen.
 */
export type PersonRef = {
  id: string;
  name: string;
  photoUpdatedAt: string | null;
};

// ── Fehler ──────────────────────────────────────────────────────────────────

export type ErrorPayload = S['ErrorDto'];
export type FieldError = NonNullable<ErrorPayload['errors']>[number];

// ── Ich, Hauskreis ──────────────────────────────────────────────────────────

export type Me = S['MeResponseDto'];
export type Hauskreis = S['HauskreisResponseDto'];
export type CreateHauskreisInput = S['CreateHauskreisDto'];

// ── Personen ────────────────────────────────────────────────────────────────

export type Person = S['PersonResponseDto'];
/**
 * Wie `Person`, plus `awayToday`. Das Feld ist abgeleitet und gibt es nur in
 * der Liste — eine einzelne Person abzurufen beantwortet die Frage „wer ist
 * gerade weg" nicht.
 */
export type PersonListEntry = S['PersonListResponseDto'][number];
export type PersonRole = Person['role'];
export type CreatePersonInput = S['CreatePersonDto'];
export type InvitePersonInput = S['InvitePersonDto'];
export type InvitedPerson = S['InvitedPersonResponseDto'];
/**
 * Achtung: `playsInstrument`, `canHost` und `autoAttend` sind **Pflicht**,
 * obwohl es ein PATCH ist — die Zod-Defaults machen sie im Schema
 * nicht-optional. Wer nur den Namen ändert, muss alle drei mitschicken.
 */
export type UpdatePersonInput = S['UpdatePersonDto'];

// ── Orte ────────────────────────────────────────────────────────────────────

export type Location = S['LocationResponseDto'];
export type CreateLocationInput = S['CreateLocationDto'];
/** Ebenfalls mit Pflichtfeldern trotz PATCH: `hostWeight`, `requiresHost`. */
export type UpdateLocationInput = S['UpdateLocationDto'];
export type ResolvedAddress = S['ResolveAddressResponseDto'];
/** Ob ein Ort wirklich gelöscht wurde oder nur stillgelegt. */
export type RemovalResult = S['RemovalResultDto'];
export type PurgeResult = S['PurgeResultDto'];
export type SetHomeInput = S['SetHomeDto'];
export type ChangedEmail = S['ChangedEmailResponseDto'];
/** Ob Keycloak die Bestätigungsmail losgeworden ist — mehr sagt die Route nicht. */
export type VerificationSent = S['VerificationSentResponseDto'];
/** Der neue Zeitstempel des Profilbilds — er **ist** die Bild-URL. */
export type PhotoUploaded = S['PhotoResponseDto'];

// ── Termine ─────────────────────────────────────────────────────────────────

export type Meeting = S['MeetingResponseDto'];
export type MeetingListItem = S['MeetingPageResponseDto']['items'][number];
export type MeetingPage = Page<MeetingListItem>;
export type CreateMeetingInput = S['CreateMeetingDto'];
export type UpdateMeetingInput = S['UpdateMeetingDto'];
export type CancelMeetingInput = S['CancelMeetingDto'];
/** Wochentag und Uhrzeit der Gruppe — die Vorgabe für neue Abende. */
export type MeetingSchedule = S['MeetingScheduleResponseDto'];
export type UpdateMeetingScheduleInput = S['UpdateMeetingScheduleDto'];
export type LeaveHauskreisInput = S['LeaveHauskreisDto'];
export type LeaveResult = S['LeaveResultResponseDto'];
export type AccountDeleted = S['AccountDeletedResponseDto'];
/** Eine Person-Zeile, die noch niemandem gehört — das Angebot eines Hauskreises. */
export type Invitation = S['InvitationListResponseDto'][number];

export type MeetingType = Meeting['type'];
export type MeetingStatus = Meeting['status'];
export type AttendanceStatus = Meeting['attendances'][number]['status'];
/** Die Einheit am Abend — dort sitzt die Nachbereitung. */
export type MeetingTopicSession = NonNullable<Meeting['topicSession']>;

export type SetAttendanceInput = S['SetAttendanceDto'];
export type Attendance = S['AttendanceResponseDto'];

/** Der Haken am Actionstep — pro Person, nicht pro Abend. */
export type ActionstepDone = S['ActionstepDoneResponseDto'];

export const MEETING_TYPES = [
  'STANDARD',
  'LOBPREIS_GEBET',
  'CUSTOM',
] as const satisfies readonly MeetingType[];

// ── Vorschläge ──────────────────────────────────────────────────────────────

export type HostSuggestion = S['HostSuggestionListResponseDto'][number];
export type RoleSuggestion = S['RoleSuggestionListResponseDto'][number];
/** Was jede Vorschlagsart gemeinsam hat — reicht für die schlichte Darstellung. */
export type Suggestion = RoleSuggestion;
export type SuggestionFacts = Suggestion['facts'];
export type HostSuggestionFacts = HostSuggestion['facts'];
export type HostHomeFacts = HostSuggestionFacts['home'];
export type UpcomingCommitment = SuggestionFacts['upcomingCommitments'][number];

// ── Themen ──────────────────────────────────────────────────────────────────

export type Topic = S['TopicResponseDto'];
export type TopicListItem = S['TopicPageResponseDto']['items'][number];
export type TopicStatus = Topic['status'];
export type UpdateTopicInput = S['UpdateTopicDto'];

/** Ein Abend eines Themas — hier sitzt der Inhalt, nicht am Termin. */
export type TopicSession = S['TopicSessionResponseDto'];
/** Dieselbe Einheit unter ihrem Thema: ohne die Kopfzeile, die darüber steht. */
export type TopicSessionInTopic = Topic['sessions'][number];
/** Und unter ihrem Termin: ohne den Termin, an dem sie ohnehin hängt. */
export type TopicSessionInMeeting = NonNullable<Meeting['topicSession']>;
export type UpdateTopicSessionInput = S['UpdateTopicSessionDto'];
/** Eine Einheit anlegen, ohne dass ein Abend dafür feststeht. Titel ist Pflicht. */
export type CreateTopicSessionInput = S['CreateTopicSessionDto'];
/** Die drei Wege aus Spec §3: neues Thema, eigenes fortsetzen, Entwurf zurück. */
export type ChooseTopicSessionInput = S['ChooseTopicSessionDto'];
export type TopicChoices = S['TopicChoicesResponseDto'];
export type TopicChoiceTopic = TopicChoices['topics'][number];
/** Offene Einheiten eines Themas, gebündelt — so, wie sie angezeigt werden. */
export type TopicChoiceGroup = TopicChoices['openSessions'][number];
/**
 * Eine offene Einheit. Trägt `meeting`, wenn sie gerade an einem **anderen**
 * kommenden Abend hängt — dann kostet das Aufnehmen jenen Abend seine Auswahl.
 */
export type OpenTopicSession = TopicChoiceGroup['sessions'][number];
export type TopicResponsibles = S['TopicResponsiblesResponseDto'];

// ── Lieder ──────────────────────────────────────────────────────────────────

export type Song = S['SongResponseDto'];
/** Die Listenform trägt zusätzlich `timesPlayed` und `lastPlayedAt`. */
export type SongListItem = S['SongPageResponseDto']['items'][number];
export type CreateSongInput = S['CreateSongDto'];
export type UpdateSongInput = S['UpdateSongDto'];

export type MeetingSong = S['MeetingSongResponseDto'];
export type AddMeetingSongInput = S['AddMeetingSongDto'];
export type SetSongLeadersInput = S['SetSongLeadersDto'];

// ── Gebetsbuddys ────────────────────────────────────────────────────────────

export type PrayerBuddyRound = S['CurrentPrayerBuddyResponseDto'];
export type PrayerBuddyGroup = PrayerBuddyRound['groups'][number];
export type PrayerBuddyConfig = S['PrayerBuddyConfigResponseDto'];
export type UpdateCycleConfigInput = S['UpdateCycleConfigDto'];
export type RotationResult = S['RotationResultResponseDto'];
export type PlanningResult = S['PlanningResultResponseDto'];

// ── Abwesenheiten ───────────────────────────────────────────────────────────

export type Absence = S['AbsenceResponseDto'];
export type CreateAbsenceInput = S['CreateAbsenceDto'];
export type UpdateAbsenceInput = S['UpdateAbsenceDto'];

// ── Home, Einteilungen, Archiv ──────────────────────────────────────────────

export type HomeScreen = S['HomeScreenResponseDto'];
export type HomeNextMeeting = NonNullable<HomeScreen['nextMeeting']>;
export type HomeActionstep = NonNullable<HomeScreen['openActionstep']>;
export type HomePrayerBuddies = NonNullable<HomeScreen['prayerBuddies']>;

export type Assignment = S['AssignmentListResponseDto']['items'][number];
export type AssignmentRole = Assignment['role'];

export type ArchiveSummary = S['ArchiveSummaryResponseDto'];

// ── Benachrichtigungen ──────────────────────────────────────────────────────

export type NotificationSetting = S['NotificationSettingResponseDto'];
export type NotificationType = NotificationSetting['type'];
/**
 * Diskriminiert über `kind`, aber ohne `discriminator` in der Spec — beim
 * Verzweigen also von Hand auf `schedule.kind` prüfen.
 */
export type NotificationSchedule = NotificationSetting['schedule'];
export type UpdateNotificationSettingInput = S['UpdateNotificationSettingDto'];

export type PushPublicKey = S['PushPublicKeyResponseDto'];
export type PushSubscriptionRecord = S['PushSubscriptionResponseDto'];
export type CreatePushSubscriptionInput = S['CreatePushSubscriptionDto'];
export type DeliveryResult = S['DeliveryResultResponseDto'];

// ── Ergebnisse der Admin-Läufe ──────────────────────────────────────────────

export type GenerationResult = S['GenerationResultResponseDto'];
export type ReminderRunResult = S['ReminderRunResultResponseDto'];
export type ActionstepRunResult = S['ActionstepRunResultResponseDto'];
export type SyncResult = S['SyncResultResponseDto'];
