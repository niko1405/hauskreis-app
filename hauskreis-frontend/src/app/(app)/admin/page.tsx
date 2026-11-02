import { PageHeader } from '@/components/layout/app-shell';
import { RequireAdmin } from '@/components/layout/require-admin';
import { AdminDraftProvider } from '@/features/admin/admin-draft';
import { BirthdayGiftAdmin } from '@/features/admin/birthday-gift-admin';
import { GuideCard } from '@/features/admin/guide-card';
import { HostWeightsAdmin } from '@/features/admin/host-weights-admin';
import { MaintenanceAdmin } from '@/features/admin/maintenance-admin';
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
        <div className="space-y-6 px-5">
          <GuideCard />
          <PeopleAdmin />
          <HostWeightsAdmin />
          <BirthdayGiftAdmin />
          <MaintenanceAdmin />
        </div>
      </AdminDraftProvider>
    </RequireAdmin>
  );
}
