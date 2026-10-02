import * as Haptics from 'expo-haptics';

const safe = (p: Promise<unknown>): void => {
  p.catch(() => undefined);
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 端末の振動(触覚)。未対応の端末・Webでは何も起きない */
export const haptic = {
  /** ボタンなど軽いタップ */
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** 選択の切り替え */
  select: () => safe(Haptics.selectionAsync()),
  /** 完了・成功 */
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** ハンコを押した瞬間: ドンッ(強) → コッ(中) → 達成の余韻(成功) */
  async stamp() {
    safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    await wait(85);
    safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    await wait(110);
    safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** 押し込む瞬間(指を置いたとき)の予告 */
  press: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
