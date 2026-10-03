import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { useFriends } from '@/features/hooks';

/** /chat/dm/[id] : 友だちとの1対1のチャット(id は友だちのユーザーID) */
export default function FriendChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friends = useFriends();
  const friend = friends.data?.find((f) => f.user_id === id);
  return <ChatScreen target={{ user: id }} title={friend?.nickname ?? 'フレンド'} showSender={false} />;
}
