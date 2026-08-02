import { MeetingDetailScreen } from '@/features/meetings/detail/meeting-detail-screen';

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MeetingDetailScreen meetingId={id} />;
}
