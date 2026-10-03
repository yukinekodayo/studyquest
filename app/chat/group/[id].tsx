import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { useGroupDetail } from '@/features/hooks';

/** /chat/group/[id] : グループのチャット */
export default function GroupChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroupDetail(id);
  return <ChatScreen target={{ group: id }} title={group.data?.name ?? 'グループ'} subtitle={group.data ? `${group.data.members.length}人` : undefined} showSender />;
}
