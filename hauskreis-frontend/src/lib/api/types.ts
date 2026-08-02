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

/** Eine Person, wie sie überall eingebettet auftaucht: nur Id und Name. */
export type PersonRef = { id: string; name: string };

// ── Fehler ──────────────────────────────────────────────────────────────────

export type ErrorPayload = S['ErrorDto'];
export type FieldError = NonNullable<ErrorPayload['errors']>[number];

// ── Ich, Hauskreis ──────────────────────────────────────────────────────────

export type Me = S['MeResponseDto'];
export type Hauskreis = S['HauskreisResponseDto'];
export type CreateHauskreisInput = S['CreateHauskreisDto'];

// ── Personen ────────────────────────────────────────────────────────────────

export type Person = S['PersonResponseDto'];
export type CreatePersonInput = S['CreatePersonDto'];
export type InvitePersonInput = S['InvitePersonDto'];
export type InvitedPerson = S['InvitedPersonResponseDto'];
/**
 * Achtung: `playsInstrument` und `canHost` sind **Pflicht**, obwohl es ein
 * PATCH ist — die Zod-Defaults machen sie im Schema nicht-optional. Wer nur
 * den Namen ändert, muss beide trotzdem mitschicken.
 */
export type UpdatePersonInput = S['UpdatePersonDto'];

// ── Orte ────────────────────────────────────────────────────────────────────

export type Location = S['LocationResponseDto'];
export type CreateLocationInput = S['CreateLocationDto'];
/** Ebenfalls mit Pflichtfeldern trotz PATCH: `hostWeight`, `requiresHost`. */
export type UpdateLocationInput = S['UpdateLocationDto'];

// ── Termine ─────────────────────────────────────────────────────────────────

export type Meeting = S['MeetingResponseDto'];
export type MeetingListItem = S['MeetingPageResponseDto']['items'][number];
export type MeetingPage = Page<MeetingListItem>;
export type CreateMeetingInput = S['CreateMeetingDto'];
export type UpdateMeetingInput = S['UpdateMeetingDto'];

export type MeetingType = Meeting['type'];
export type MeetingStatus = Meeting['status'];
export type AttendanceStatus = Meeting['attendances'][number]['status'];
export type MeetingTopic = NonNullable<Meeting['topic']>;

export type SetAttendanceInput = S['SetAttendanceDto'];
export type Attendance = S['AttendanceResponseDto'];

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
export type CreateTopicInput = S['CreateTopicDto'];
export type UpdateTopicInput = S['UpdateTopicDto'];

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
export type CarryOverResult = S['CarryOverResultResponseDto'];
export type SyncResult = S['SyncResultResponseDto'];
