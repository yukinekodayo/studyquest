import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockUser, markChatRead, reportMessage, sendMessage, type ChatTarget } from '@/api/chat';
import { CHAT_MAX_LENGTH, formatChatTime, isQuietHour, QUICK_PHRASES, REPORT_REASONS } from '@/domain/chat';
import { haptic } from '@/lib/haptics';
import type { ChatMessage, ChatUnread, ReportReason } from '@/types/database';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { PressableScale } from '@/ui/PressableScale';
import { Sheet } from '@/ui/Sheet';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors, fonts, radius } from '@/ui/theme';
import { useAuth } from '@/lib/auth';
import { chatKey, keys, useMessages } from '../hooks';
import { ChatRulesSheet, useChatRulesFirstTime } from './ChatRules';

interface Props {
  target: ChatTarget;
  title: string;
  subtitle?: string;
  /** グループでは送信者の名前・アイコンを出す */
  showSender: boolean;
}

/** グループ / 友だち共通のチャット画面 */
export function ChatScreen({ target, title, subtitle, showSender }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const run = useRun();
  const toast = useToast();
  const { userId } = useAuth();
  const messages = useMessages(target);
  const rules = useChatRulesFirstTime();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [blocking, setBlocking] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState<ReportReason>('abuse');
  const [note, setNote] = useState('');
  const quiet = isQuietHour(new Date().getHours());
  const key = chatKey(target);
  const lastRead = useRef<string | null>(null);

  const list = messages.data ?? [];
  const newestId = list[0]?.id ?? null;

  // 開いている間、新しいメッセージが来たら既読にする(未読バッジを消す)
  useEffect(() => {
    if (!newestId || lastRead.current === newestId || newestId.startsWith('tmp-')) return;
    lastRead.current = newestId;
    void markChatRead(target)
      .then(() => {
        qc.setQueryData<ChatUnread>(keys.chatUnread, (prev) => {
          if (!prev) return prev;
          const next: ChatUnread = { groups: { ...prev.groups }, dms: { ...prev.dms } };
          if (target.group) next.groups[target.group] = 0;
          else if (target.user) next.dms[target.user] = 0;
          return next;
        });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  const send = async (body: string, quick: boolean) => {
    const trimmed = body.trim();
    if (!trimmed || !userId) return;
    // 送った瞬間に画面へ出す(失敗したら取り消す)
    const tmp: ChatMessage = { id: `tmp-${Date.now()}`, body: trimmed, kind: quick ? 'quick' : 'text', created_at: new Date().toISOString(), sender_id: userId, is_mine: true, nickname: '', avatar: 'blue' };
    qc.setQueryData<ChatMessage[]>(keys.chat(key), (prev) => [tmp, ...(prev ?? [])]);
    if (!quick) setText('');
    haptic.tap();
    const sent = await run(() => sendMessage(target, trimmed, quick));
    if (!sent) {
      qc.setQueryData<ChatMessage[]>(keys.chat(key), (prev) => (prev ?? []).filter((m) => m.id !== tmp.id));
      if (!quick) setText(trimmed);
      haptic.warning();
      return;
    }
    await qc.invalidateQueries({ queryKey: keys.chat(key) });
  };

  const doReport = async () => {
    if (!reporting) return;
    const r = await run(() => reportMessage(reporting.id, reason, note.trim() || null));
    if (r) {
      haptic.success();
      toast.show('通報しました。運営が確認します', 'success');
      setReporting(null);
      setNote('');
      setReason('abuse');
    }
  };

  const doBlock = async () => {
    if (!blocking) return;
    const ok = await run(async () => {
      await blockUser(blocking.sender_id);
      return true;
    });
    if (ok) {
      toast.show(`${blocking.nickname}さんをブロックしました`, 'success');
      setBlocking(null);
      await qc.invalidateQueries({ queryKey: ['chat'] });
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="もどる" testID="chat-back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text variant="title" size={19} numberOfLines={1} testID="chat-title">{title}</Text>
          {subtitle ? <Text variant="caption" size={12}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={() => setRulesOpen(true)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="チャットのルール" testID="chat-rules">
          <Ionicons name="information-circle-outline" size={24} color={colors.inkSoft} />
        </Pressable>
      </View>

      {messages.isLoading ? (
        <View style={styles.fill}><LoadingState /></View>
      ) : messages.isError ? (
        <View style={styles.fill}><ErrorState error={messages.error} onRetry={() => void messages.refetch()} /></View>
      ) : (
        <FlatList
          style={styles.fill}
          data={list}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty} testID="chat-empty">
              <Text variant="bodyBold" align="center">まだメッセージはありません</Text>
              <Text variant="caption" align="center">下の「ひとこと」をタップして、あいさつしてみましょう</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const older = list[index + 1];
            const showName = showSender && !item.is_mine && older?.sender_id !== item.sender_id;
            return (
              <Bubble m={item} showName={showName} showAvatar={showSender} onPress={() => !item.is_mine && !item.id.startsWith('tmp-') && setMenu(item)} />
            );
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        {quiet ? (
          <View style={styles.quiet} testID="chat-quiet">
            <Ionicons name="moon" size={16} color={colors.blue} />
            <Text variant="bodyBold" size={13} color={colors.blue} style={styles.quietText}>夜(22時〜7時)はお休みの時間です。また明日話しましょう</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quick}>
              {QUICK_PHRASES.map((p) => (
                <PressableScale key={p} onPress={() => send(p, true)} style={styles.quickChip} pressedScale={0.93} accessibilityRole="button" testID={`quick-${p}`}>
                  <Text variant="bodyBold" size={13} color={colors.blue}>{p}</Text>
                </PressableScale>
              ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="メッセージを入力"
                placeholderTextColor={colors.inkFaint}
                maxLength={CHAT_MAX_LENGTH}
                multiline
                style={styles.input}
                accessibilityLabel="メッセージ"
                testID="chat-input"
              />
              <PressableScale onPress={() => send(text, false)} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && styles.sendOff]} pressedScale={0.88} accessibilityRole="button" accessibilityLabel="送信" testID="chat-send">
                <Ionicons name="arrow-up" size={22} color={colors.white} />
              </PressableScale>
            </View>
            {text.length > CHAT_MAX_LENGTH - 40 ? <Text variant="caption" size={11} align="right">{text.length} / {CHAT_MAX_LENGTH}</Text> : null}
          </>
        )}
      </View>

      <ChatRulesSheet visible={rules.open || rulesOpen} onClose={() => { rules.setOpen(false); setRulesOpen(false); }} />

      <Sheet visible={!!menu} title="このメッセージ" onClose={() => setMenu(null)}>
        <View style={styles.quote}><Text variant="body" numberOfLines={3}>{menu?.body}</Text></View>
        <Button label="通報する" icon="flag-outline" variant="soft" onPress={() => { const m = menu; setMenu(null); setReporting(m); }} testID="menu-report" />
        <Button label={`${menu?.nickname ?? ''}さんをブロック`} icon="hand-left-outline" variant="danger" onPress={() => { const m = menu; setMenu(null); setBlocking(m); }} testID="menu-block" />
      </Sheet>

      <Sheet visible={!!reporting} title="メッセージを通報" onClose={() => setReporting(null)}>
        <Text variant="caption">通報すると、運営が内容を確認します。通報したことは、相手には伝わりません。</Text>
        <View style={styles.reasons}>
          {REPORT_REASONS.map((r) => (
            <PressableScale key={r.value} onPress={() => { haptic.select(); setReason(r.value); }} style={[styles.reason, reason === r.value && styles.reasonOn]} pressedScale={0.98} accessibilityRole="radio" accessibilityState={{ selected: reason === r.value }} testID={`reason-${r.value}`}>
              <View style={[styles.radio, reason === r.value && styles.radioOn]}>{reason === r.value ? <View style={styles.radioDot} /> : null}</View>
              <Text variant="bodyBold" size={15}>{r.label}</Text>
            </PressableScale>
          ))}
        </View>
        <TextField label="くわしく(書かなくてもOK)" value={note} onChangeText={setNote} maxLength={200} testID="report-note" />
        <Button label="通報する" icon="flag" onPress={doReport} testID="report-submit" />
      </Sheet>

      <Sheet visible={!!blocking} title="ブロックする" onClose={() => setBlocking(null)}>
        <Text variant="body">{blocking?.nickname}さんをブロックしますか？ この人のメッセージは見えなくなり、1対1のメッセージも送り合えなくなります。あとで設定から解除できます。</Text>
        <Button label="ブロックする" variant="danger" onPress={doBlock} testID="block-confirm" />
        <Button label="やめる" variant="soft" size="md" onPress={() => setBlocking(null)} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, showName, showAvatar, onPress }: { m: ChatMessage; showName: boolean; showAvatar: boolean; onPress: () => void }) {
  const mine = m.is_mine;
  return (
    <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
      {!mine && showAvatar ? (
        <View style={styles.avatarSlot}>{showName ? <Avatar name={m.nickname} color={m.avatar} size={32} /> : null}</View>
      ) : null}
      <View style={[styles.col, mine ? styles.colMine : styles.colOther]}>
        {showName ? <Text variant="caption" size={11} style={styles.name}>{m.nickname}</Text> : null}
        <PressableScale onPress={onPress} disabled={mine} pressedScale={0.97} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]} testID={`msg-${m.body}`} accessibilityRole={mine ? undefined : 'button'} accessibilityLabel={mine ? undefined : `${m.nickname}のメッセージ ${m.body}`}>
          <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{m.body}</Text>
        </PressableScale>
        <Text variant="caption" size={10} color={colors.inkFaint} style={styles.time}>{m.id.startsWith('tmp-') ? '送信中' : formatChatTime(m.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.bg },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, gap: 1 },
  listContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  empty: { paddingVertical: 60, gap: 6, alignItems: 'center', transform: [{ scaleY: -1 }] },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  avatarSlot: { width: 32, alignSelf: 'flex-start' },
  col: { maxWidth: '78%', gap: 2 },
  colMine: { alignItems: 'flex-end' },
  colOther: { alignItems: 'flex-start' },
  name: { marginLeft: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: colors.blue, borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: colors.white, borderBottomLeftRadius: 5 },
  bubbleText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  bubbleTextMine: { color: colors.white },
  time: { marginHorizontal: 4 },
  composer: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white, paddingTop: 8, paddingHorizontal: 12, gap: 8 },
  quick: { gap: 8, paddingHorizontal: 2 },
  quickChip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: 22, backgroundColor: colors.beige, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: fonts.body, fontSize: 16, color: colors.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: colors.inkFaint },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 },
  quietText: { flex: 1 },
  quote: { backgroundColor: colors.beige, borderRadius: radius.md, padding: 14 },
  reasons: { gap: 8 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.beige },
  reasonOn: { backgroundColor: colors.blueSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.inkFaint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.blue },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.blue },
});
