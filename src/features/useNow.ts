import { useEffect, useState } from 'react';

/** 一定間隔で現在時刻(ms)を返す。表示更新用で、時間の正しさは開始時刻ベースの計算が担保する */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
