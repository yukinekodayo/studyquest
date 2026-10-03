import { rpc } from './rpc';
import type { ReportReason } from '@/types/database';
import { CHAT_MAX_LENGTH } from '@/domain/chat';
import { ValidationError } from './auth';

/** 宛先は「グループ」か「友だち」のどちらか一方 */
export type ChatTarget = { group: string; user?: undefined } | { user: string; group?: undefined };

const args = (t: ChatTarget) => ({ p_group: t.group ?? null, p_user: t.user ?? null });

export const fetchMessages = (t: ChatTarget) => rpc('get_messages', { ...args(t), p_before: null, p_limit: 60 });

export async function sendMessage(t: ChatTarget, body: string, quick = false) {
  const text = body.trim();
  if (text.length < 1) throw new ValidationError('メッセージを入力してください');
  if (text.length > CHAT_MAX_LENGTH) throw new ValidationError(`${CHAT_MAX_LENGTH}文字までです`);
  return rpc('send_message', { ...args(t), p_body: text, p_quick: quick });
}

export const markChatRead = (t: ChatTarget): Promise<void> => rpc('mark_chat_read', args(t)).then(() => undefined);
export const fetchChatUnread = () => rpc('chat_unread');
export const blockUser = (userId: string): Promise<void> => rpc('block_user', { p_user: userId }).then(() => undefined);
export const unblockUser = (userId: string): Promise<void> => rpc('unblock_user', { p_user: userId }).then(() => undefined);
export const fetchBlocks = () => rpc('my_blocks');
export const reportMessage = (messageId: string, reason: ReportReason, note: string | null) =>
  rpc('report_message', { p_message_id: messageId, p_reason: reason, p_note: note });

export const fetchIsAdmin = () => rpc('is_admin');
export const fetchAdminReports = () => rpc('admin_open_reports');
export const resolveAdminReport = (id: string, action: 'dismiss' | 'hide' | 'hide_mute'): Promise<void> =>
  rpc('admin_resolve_report', { p_report_id: id, p_action: action }).then(() => undefined);
