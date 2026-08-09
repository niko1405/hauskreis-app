import { TopicDetailScreen } from '@/features/archive/topic-detail-screen';

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TopicDetailScreen topicId={id} />;
}
