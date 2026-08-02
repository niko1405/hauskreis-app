import { PageHeader } from '@/components/layout/app-shell';
import { RequireAdmin } from '@/components/layout/require-admin';
import { LocationsAdmin } from '@/features/admin/locations-admin';
import { MaintenanceAdmin } from '@/features/admin/maintenance-admin';
import { PeopleAdmin } from '@/features/admin/people-admin';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <PageHeader
        title="Verwaltung"
        subtitle="Personen, Orte und die Läufe, die sonst der Zeitplaner anstößt"
      />
      <div className="space-y-6 px-5">
        <PeopleAdmin />
        <LocationsAdmin />
        <MaintenanceAdmin />
      </div>
    </RequireAdmin>
  );
}
