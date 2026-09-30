import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Fns = Database['public']['Functions'];

/** 型付きRPC呼び出し。エラーは throw(呼び出し側で toUserMessage に通す) */
export async function rpc<K extends keyof Fns>(
  fn: K,
  ...args: Fns[K]['Args'] extends Record<string, never> ? [] : [Fns[K]['Args']]
): Promise<Fns[K]['Returns']> {
  // supabase-js の rpc の型は関数ごとのジェネリクスが複雑なため、ここで1回だけ型を確定させる
  const call = supabase.rpc as unknown as (
    name: string,
    params?: object,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  const { data, error } = await call.call(supabase, fn as string, args[0] ?? {});
  if (error) throw error;
  return data as Fns[K]['Returns'];
}
