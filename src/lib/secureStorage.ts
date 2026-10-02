/**
 * 認証トークン用のストレージアダプタ(SecureStore + 旧AsyncStorageからの移行)。
 * SecureStore は1値あたり約2KBまでなので、長いセッションJSONはUTF-8で1500バイト以下に分割して保存する。
 * 保存形式: `<key>.n` = "<世代>:<個数>"、チャンク = `<key>.<世代>.<i>`。
 * 書き込みは「新世代のチャンク → 件数キー更新 → 旧世代の削除」の順なので、途中で落ちても旧セッションは壊れない。
 */
export interface SecureStoreLike {
  getItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void>;
  deleteItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<void>;
}
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_BYTES = 1500; // SecureStore の約2KB上限に余裕を持たせる

const countKey = (k: string) => `${k}.n`;
const chunkKey = (k: string, gen: string, i: number) => `${k}.${gen}.${i}`;

/** コードポイント単位(サロゲートペアを割らない)で、UTF-8 で maxBytes 以下になるよう分割する */
export function splitByBytes(value: string, maxBytes: number = CHUNK_BYTES): string[] {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    const b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + b > maxBytes) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  if (cur !== '' || out.length === 0) out.push(cur);
  return out;
}

function parseCount(raw: string | null): { gen: string; n: number } | null {
  const m = /^([a-z0-9]+):(\d+)$/.exec(raw ?? '');
  if (!m || Number(m[2]) <= 0) return null;
  return { gen: m[1]!, n: Number(m[2]) };
}

export function createSecureStorage(secure: SecureStoreLike, legacy: KeyValueStore, keychainAccessible?: number) {
  const opts = keychainAccessible === undefined ? undefined : { keychainAccessible };

  async function readCount(key: string) {
    return parseCount(await secure.getItemAsync(countKey(key), opts));
  }
  async function deleteChunks(key: string, c: { gen: string; n: number }) {
    for (let i = 0; i < c.n; i++) {
      try {
        await secure.deleteItemAsync(chunkKey(key, c.gen, i), opts);
      } catch {
        // 古いチャンクの削除失敗は無害(次回以降の孤児になるだけ)
      }
    }
  }

  // キー単位のプロミスチェーンで直列化(並行 get/set で一瞬 null になる競合や、並行 set の孤児を防ぐ)
  const chains = new Map<string, Promise<unknown>>();
  function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
    const tail = run.catch(() => undefined);
    chains.set(key, tail);
    void tail.then(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
    return run;
  }

  // 以下の *Unlocked は直列化済みの呼び出し内からのみ使う(再入によるデッドロック回避)
  async function setUnlocked(key: string, value: string): Promise<void> {
    const prev = await readCount(key).catch(() => null);
    const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const chunks = splitByBytes(value);
    try {
      for (let i = 0; i < chunks.length; i++) await secure.setItemAsync(chunkKey(key, gen, i), chunks[i]!, opts);
      await secure.setItemAsync(countKey(key), `${gen}:${chunks.length}`, opts); // ここで新世代に切り替わる
    } catch (e) {
      await deleteChunks(key, { gen, n: chunks.length }); // 書きかけの新世代を best-effort で掃除(旧セッションは残す)
      throw e;
    }
    if (prev) await deleteChunks(key, prev);
  }

  async function getUnlocked(key: string): Promise<string | null> {
    try {
      const c = await readCount(key);
      if (!c) {
        const old = await legacy.getItem(key);
        if (old !== null) {
          try {
            await setUnlocked(key, old);
            await legacy.removeItem(key);
          } catch {
            // 移行に失敗しても旧データは消さず、今回は旧値を返す(ログイン維持。次回読み出し時に再試行)
          }
        }
        return old;
      }
      const parts: string[] = [];
      for (let i = 0; i < c.n; i++) {
        const part = await secure.getItemAsync(chunkKey(key, c.gen, i), opts);
        if (part === null) return null; // 欠けていたら未ログイン扱い
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  }

  const storage = {
    // 方針: 読み出し失敗は null(未ログイン扱い・保存データは消さない)、書き込み失敗は握りつぶさず上位へ伝える
    getItem: (key: string): Promise<string | null> => serialize(key, () => getUnlocked(key)),
    setItem: (key: string, value: string): Promise<void> => serialize(key, () => setUnlocked(key, value)),
    removeItem: (key: string): Promise<void> =>
      serialize(key, async () => {
        const c = await readCount(key).catch(() => null);
        await secure.deleteItemAsync(countKey(key), opts);
        if (c) await deleteChunks(key, c);
        await legacy.removeItem(key);
      }),
  };
  return storage;
}
