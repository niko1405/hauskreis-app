'use client';

/**
 * Ein Termin im Detail. Eigene Route, echte URL — der Zurück-Knopf des
 * Browsers funktioniert, und man kann den Link teilen.
 *
 * Jede Änderung geht als `PATCH` mit `If-Match` raus. Kommt ein `412` zurück,
 * erscheint das Konfliktbanner: dann hat jemand anders in der Zwischenzeit
 * gespeichert, und das gehört gesehen.
 */
import { ArrowLeft, CalendarX, ExternalLink, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { RoleChip } from '@/components/domain/role-badge';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { InlineEdit, Select } from '@/components/ui/field';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useCancelMeeting,
  useLocations,
  useMeeting,
  useSongLeaders,
  useUpdateMeeting,
} from '@/lib/api/hooks';
import { formatDayFull, formatRelativeDay, formatWeekday } from '@/lib/date';
import {
  MEETING_TYPE_LABEL,
  hasTestimonySlot,
  hasTopicSlot,
  mapsUrl,
  meetingHeadline,
} from '@/lib/meeting';
import type { AssignmentRole } from '@/lib/api/types';
import { AttendanceCard } from './attendance-card';
import { SongsCard } from './songs-card';
import { useRoleAssignment } from './use-role-assignment';

const AssignmentSheet = dynamic(() =>
  import('@/components/domain/assignment-sheet').then((m) => m.AssignmentSheet),
);

type SheetRole = Exclude<AssignmentRole, 'PRAYER_BUDDY'>;

export function MeetingDetailScreen({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const meetingQuery = useMeeting(meetingId);
  const meeting = meetingQuery.data?.data;

  if (meetingQuery.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (meetingQuery.error || !meeting) {
    return (
      <div className="px-5 pt-6">
        <ErrorState
          error={meetingQuery.error ?? new Error('Termin nicht gefunden')}
          onRetry={() => void meetingQuery.refetch()}
        />
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push('/termine')}
        >
          Zurück zu den Terminen
        </Button>
      </div>
    );
  }

  return <Loaded meetingId={meetingId} meeting={meeting} />;
}

function Loaded({
  meetingId,
  meeting,
}: {
  meetingId: string;
  meeting: NonNullable<ReturnType<typeof useMeeting>['data']>['data'];
}) {
  const [sheet, setSheet] = useState<SheetRole | null>(null);

  const update = useUpdateMeeting(meetingId);
  const cancel = useCancelMeeting(meetingId);
  const locations = useLocations();
  const songLeaders = useSongLeaders(meetingId);
  const roles = useRoleAssignment(meeting);
  const toast = useToast();

  const cancelled = meeting.status === 'CANCELLED';
  const patch = (input: Parameters<typeof update.mutate>[0]) =>
    update.mutate(input, {
      onError: (error) => toast.error(errorMessage(error)),
    });

  const selectedFor = (role: SheetRole): string[] => {
    if (role === 'HOST')
      return meeting.hostPersonId ? [meeting.hostPersonId] : [];
    if (role === 'TOPIC') return roles.topicPeople.map((p) => p.id);
    return (songLeaders.data ?? []).map((p) => p.id);
  };

  const submitFor = (role: SheetRole) => {
    if (role === 'HOST') return roles.assignHost;
    if (role === 'TOPIC') return roles.assignTopicResponsibles;
    return roles.assignSongLeaders;
  };

  return (
    <div className="space-y-6 px-5 pt-4 pb-10">
      <div className="flex items-center justify-between">
        <Link href="/termine">
          <IconButton label="Zurück">
            <ArrowLeft size={18} />
          </IconButton>
        </Link>
        {cancelled && <Badge variant="alert">Abgesagt</Badge>}
      </div>

      {(roles.conflict || update.conflict) && (
        <ConflictBanner
          onReload={() => window.location.reload()}
          onDismiss={() => {
            roles.dismissConflict();
            update.dismissConflict();
          }}
        />
      )}

      <header>
        <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
          {formatWeekday(meeting.date)} · {formatRelativeDay(meeting.date)}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight font-bold text-stone-900">
          {meetingHeadline(meeting)}
        </h1>
        <p className="mt-1 text-sm text-stone-400">
          {formatDayFull(meeting.date)} · {MEETING_TYPE_LABEL[meeting.type]}
        </p>
      </header>

      <Card className="space-y-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-stone-500">Titel</p>
          <InlineEdit
            label="Titel"
            value={meeting.title}
            emptyLabel="Kein eigener Titel"
            placeholder="z. B. Geburtstag von Mira"
            saving={update.isPending}
            onSave={(next) => patch({ title: next })}
          />
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold text-stone-500">Ort</p>
          <Select
            value={meeting.locationId ?? ''}
            disabled={update.isPending}
            onChange={(event) =>
              patch({
                locationId:
                  event.target.value === '' ? null : event.target.value,
              })
            }
          >
            <option value="">Noch offen / draußen</option>
            {(locations.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>

          {meeting.location && (
            <a
              href={mapsUrl(meeting.location)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-terracotta-600 hover:underline"
            >
              <MapPin size={12} />
              In Maps öffnen
              <ExternalLink size={11} />
            </a>
          )}
          {meeting.location && !meeting.location.requiresHost && (
            <p className="mt-1 text-[11px] text-stone-400">
              Hier braucht es keinen Gastgeber.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <RoleChip
            kind="HOST"
            people={meeting.host ? [meeting.host] : []}
            onClick={() => setSheet('HOST')}
            emptyLabel={
              meeting.location && !meeting.location.requiresHost
                ? 'Kein Host nötig'
                : undefined
            }
          />
          {hasTopicSlot(meeting.type) && (
            <RoleChip
              kind="TOPIC"
              people={roles.topicPeople}
              onClick={() => setSheet('TOPIC')}
            />
          )}
          <RoleChip
            kind="SONG"
            people={songLeaders.data ?? []}
            onClick={() => setSheet('SONG')}
          />
        </div>
      </Card>

      {hasTestimonySlot(meeting.type) && (
        <section>
          <SectionTitle>Testimony</SectionTitle>
          <Card>
            <InlineEdit
              label="Testimony"
              multiline
              value={meeting.testimonyText}
              emptyLabel="Noch kein Testimony — an dem Abend geht es vielleicht nur um Lobpreis."
              saving={update.isPending}
              onSave={(next) => patch({ testimonyText: next })}
            />
          </Card>
        </section>
      )}

      <SongsCard meetingId={meetingId} />

      <AttendanceCard meeting={meeting} />

      <section>
        <SectionTitle>Zusammenfassung</SectionTitle>
        <Card>
          <InlineEdit
            label="Zusammenfassung"
            multiline
            value={meeting.summaryText}
            emptyLabel="Noch keine Zusammenfassung — hilft allen, die nicht da waren."
            saving={update.isPending}
            onSave={(next) => patch({ summaryText: next })}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Actionstep</SectionTitle>
        <Card>
          <InlineEdit
            label="Actionstep"
            value={meeting.actionstepText}
            emptyLabel="Noch kein Actionstep für die Woche"
            saving={update.isPending}
            onSave={(next) => patch({ actionstepText: next })}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Infos</SectionTitle>
        <Card>
          <InlineEdit
            label="Infos"
            multiline
            value={meeting.infoText}
            emptyLabel="Nichts Besonderes zu beachten"
            saving={update.isPending}
            onSave={(next) => patch({ infoText: next })}
          />
        </Card>
      </section>

      {!cancelled && (
        <Button
          variant="danger"
          className="w-full"
          loading={cancel.isPending}
          onClick={() =>
            cancel.mutate(undefined, {
              onSuccess: () => toast.success('Termin abgesagt.'),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <CalendarX size={15} />
          Termin absagen
        </Button>
      )}

      {sheet && (
        <AssignmentSheet
          open
          onClose={() => setSheet(null)}
          kind={sheet}
          meetingId={meetingId}
          selectedIds={selectedFor(sheet)}
          multiple={sheet !== 'HOST'}
          onSubmit={submitFor(sheet)}
          saving={roles.saving}
        />
      )}
    </div>
  );
}
