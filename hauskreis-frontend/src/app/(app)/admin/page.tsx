import { PageHeader } from '@/components/layout/app-shell';
import { RequireAdmin } from '@/components/layout/require-admin';
import { MaintenanceAdmin } from '@/features/admin/maintenance-admin';
import { PeopleAdmin } from '@/features/admin/people-admin';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <PageHeader
        title="Verwaltung"
        subtitle="Personen und die Läufe, die sonst der Zeitplaner anstößt"
      />
      <div className="space-y-6 px-5">
        <PeopleAdmin />
        {/* Orte stehen im Archiv: sie brauchen keine Admin-Rechte mehr, und
            dort liegt schon alles andere, was die Gruppe gesammelt hat. */}
        <MaintenanceAdmin />
      </div>
    </RequireAdmin>
  );
}
