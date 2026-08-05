import { PageHeader } from '@/components/layout/app-shell';
import { RequireAdmin } from '@/components/layout/require-admin';
import { HostWeightsAdmin } from '@/features/admin/host-weights-admin';
import { MaintenanceAdmin } from '@/features/admin/maintenance-admin';
import { PeopleAdmin } from '@/features/admin/people-admin';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <PageHeader
        title="Verwaltung"
        subtitle="Personen, Gewichtung und die Läufe, die sonst der Zeitplaner anstößt"
      />
      <div className="space-y-6 px-5">
        <PeopleAdmin />
        {/* Orte stehen im Archiv: sie brauchen keine Admin-Rechte mehr, und
            dort liegt schon alles andere, was die Gruppe gesammelt hat. Nur
            die Gewichtung ist hier geblieben — sie ist eine Aussage über
            Menschen und gehört nicht in eine Liste, die alle sehen. */}
        <HostWeightsAdmin />
        <MaintenanceAdmin />
      </div>
    </RequireAdmin>
  );
}
