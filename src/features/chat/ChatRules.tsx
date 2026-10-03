import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

const SEEN_KEY = 'studyquest.chat.rules.v1';

export const CHAT_RULES = [
  '電話番号・住所・学校名・メールアドレス・SNSのIDは、書かない・送らない',
  '相手がいやな気持ちになる言葉は使わない',
  '夜(22時〜7時)はお休みの時間。メッセージは送れません',
  'いやなことがあったら、相手のメッセージをタップすると「通報」か「ブロック」ができます',
  'こまったときや、つらいときは、家族や学校の先生など身近な大人に話してください',
];

/** 初めてチャットを開いたときに1回だけ出す「安心して使うためのルール」。いつでも(i)ボタンから見られる */
export function useChatRulesFirstTime(): { open: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        if (alive && !v) setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const set = (v: boolean) => {
    setOpen(v);
    if (!v) void AsyncStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
  };
  return { open, setOpen: set };
}

export function ChatRulesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="安心して使うためのルール" onClose={onClose}>
      <View style={styles.list}>
        {CHAT_RULES.map((r, i) => (
          <View key={r} style={styles.row}>
            <Text variant="num" size={16} color={colors.blue} style={styles.n}>{i + 1}</Text>
            <Text variant="body" style={styles.t}>{r}</Text>
          </View>
        ))}
      </View>
      <Button label="わかりました" onPress={onClose} testID="chat-rules-ok" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  n: { width: 20 },
  t: { flex: 1 },
});
