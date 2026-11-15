import { PageHeader } from '@/components/layout/app-shell';
import { RequireAdmin } from '@/components/layout/require-admin';
import { AdminDraftProvider } from '@/features/admin/admin-draft';
import { AdminReady } from '@/features/admin/admin-ready';
import { BirthdayGiftAdmin } from '@/features/admin/birthday-gift-admin';
import { GuideCard } from '@/features/admin/guide-card';
import { HostWeightsAdmin } from '@/features/admin/host-weights-admin';
import {
  GroupSettingsAdmin,
  JobsAdmin,
} from '@/features/admin/maintenance-admin';
import { MarkAdminSeen } from '@/features/admin/mark-admin-seen';
import { PeopleAdmin } from '@/features/admin/people-admin';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <MarkAdminSeen />
      {/* Alles darunter ist ein Formular mit einem Speichern-Balken
          (`admin-draft.tsx`) — außer Einladen und den Läufen. */}
      <AdminDraftProvider>
        <PageHeader
          title="Verwaltung"
          subtitle="Verwalte hier deine Hauskreis-Gruppe."
          back="/profil"
        />
        {/* Mitglieder, dann die Rhythmen (Termine, Gebet, Actionstep), dann
            Geschenke und Gewichtung, am Ende die Läufe — vom Häufigen zum
            Seltenen. */}
        <AdminReady>
          <div className="space-y-6 px-5">
            <GuideCard />
            <PeopleAdmin />
            <GroupSettingsAdmin />
            <BirthdayGiftAdmin />
            <HostWeightsAdmin />
            <JobsAdmin />
          </div>
        </AdminReady>
      </AdminDraftProvider>
    </RequireAdmin>
  );
}
