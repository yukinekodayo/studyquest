import { describe, expect, it } from 'vitest';
import { createSecureStorage, splitByBytes, type SecureStoreLike } from '@/lib/secureStorage';

function fakes() {
  const secure = new Map<string, string>();
  const legacy = new Map<string, string>();
  const fail = { set: 0, get: false }; // set: N回目以降の書き込みを失敗させる(0=無効)
  let sets = 0;
  const store: SecureStoreLike = {
    async getItemAsync(k) {
      if (fail.get) throw new Error('read fail');
      return secure.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      if (new TextEncoder().encode(v).length > 2048) throw new Error('too large');
      sets++;
      if (fail.set && sets >= fail.set) throw new Error('write fail');
      secure.set(k, v);
    },
    async deleteItemAsync(k) {
      secure.delete(k);
    },
  };
  const kv = {
    getItem: async (k: string) => legacy.get(k) ?? null,
    removeItem: async (k: string) => void legacy.delete(k),
  };
  return { secure, legacy, fail, resetSets: () => (sets = 0), storage: createSecureStorage(store, kv, 1) };
}

const K = 'sb-token';

describe('secureStorage', () => {
  it('長い値・日本語・絵文字が往復でき、各チャンクは2KB未満', async () => {
    const { storage, secure } = fakes();
    const value = JSON.stringify({ name: 'がくしゅう😀'.repeat(400), t: 'x'.repeat(5000) });
    await storage.setItem(K, value);
    expect(await storage.getItem(K)).toBe(value);
    for (const v of secure.values()) expect(new TextEncoder().encode(v).length).toBeLessThanOrEqual(1500);
  });

  it('上書きすると古いチャンクは残らない', async () => {
    const { storage, secure } = fakes();
    await storage.setItem(K, 'a'.repeat(6000));
    await storage.setItem(K, 'short');
    expect(await storage.getItem(K)).toBe('short');
    expect(secure.size).toBe(2); // 件数キー + 1チャンク
  });

  it('書き込み途中で失敗しても旧セッションを失わず、エラーは上位へ伝わる', async () => {
    const { storage, fail, resetSets } = fakes();
    const oldVal = 'old'.repeat(2000);
    await storage.setItem(K, oldVal);
    resetSets();
    fail.set = 2; // 新チャンクの2個目で失敗
    await expect(storage.setItem(K, 'new'.repeat(2000))).rejects.toThrow('write fail');
    fail.set = 0;
    expect(await storage.getItem(K)).toBe(oldVal);
  });

  it('書き込み失敗時は書きかけの新世代チャンクを掃除し、旧世代だけが残る', async () => {
    const { storage, fail, resetSets, secure } = fakes();
    await storage.setItem(K, 'old'.repeat(2000)); // 件数キー + 4チャンク
    const before = new Set(secure.keys());
    resetSets();
    fail.set = 3; // 新チャンクの3個目で失敗(2個は書き込み済み)
    await expect(storage.setItem(K, 'new'.repeat(2000))).rejects.toThrow('write fail');
    expect(new Set(secure.keys())).toEqual(before);
  });

  it('並行 get/set でも get は null にならず、孤児チャンクも残らない', async () => {
    const { storage, secure } = fakes();
    await storage.setItem(K, 'a'.repeat(4000));
    const results = await Promise.all([
      storage.setItem(K, 'b'.repeat(4000)),
      storage.getItem(K),
      storage.setItem(K, 'c'.repeat(4000)),
      storage.getItem(K),
    ]);
    expect(results[1]).toBe('b'.repeat(4000));
    expect(results[3]).toBe('c'.repeat(4000));
    expect(await storage.getItem(K)).toBe('c'.repeat(4000));
    expect(secure.size).toBe(1 + 3); // 件数キー + 3チャンク(孤児なし)
  });

  it('旧AsyncStorageの値を初回読み出しでSecureStoreへ移行し、旧値を消す', async () => {
    const { storage, legacy, secure } = fakes();
    legacy.set(K, 'legacy-session');
    expect(await storage.getItem(K)).toBe('legacy-session');
    expect(legacy.has(K)).toBe(false);
    expect(secure.size).toBeGreaterThan(0);
    expect(await storage.getItem(K)).toBe('legacy-session');
  });

  it('移行(SecureStore書き込み)に失敗しても旧値を返し、旧データは残して次回再試行できる', async () => {
    const { storage, legacy, fail } = fakes();
    legacy.set(K, 'legacy-session');
    fail.set = 1;
    expect(await storage.getItem(K)).toBe('legacy-session');
    expect(legacy.get(K)).toBe('legacy-session');
    fail.set = 0;
    expect(await storage.getItem(K)).toBe('legacy-session');
    expect(legacy.has(K)).toBe(false);
  });

  it('チャンクが欠けていたら null、読み出し失敗も null', async () => {
    const { storage, secure, fail } = fakes();
    await storage.setItem(K, 'z'.repeat(5000));
    const chunk = [...secure.keys()].find((k) => !k.endsWith('.n'))!;
    secure.delete(chunk);
    expect(await storage.getItem(K)).toBeNull();
    fail.get = true;
    expect(await storage.getItem(K)).toBeNull();
  });

  it('removeItem は SecureStore と旧AsyncStorageの両方を消す', async () => {
    const { storage, secure, legacy } = fakes();
    await storage.setItem(K, 'a'.repeat(4000));
    legacy.set(K, 'stale');
    await storage.removeItem(K);
    expect(secure.size).toBe(0);
    expect(legacy.size).toBe(0);
    expect(await storage.getItem(K)).toBeNull();
  });

  it('splitByBytes はサロゲートペアを割らず、結合すると元に戻る', () => {
    const v = '😀あa'.repeat(1000);
    const parts = splitByBytes(v, 100);
    expect(parts.join('')).toBe(v);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(100);
    expect(splitByBytes('')).toEqual(['']);
  });
});
