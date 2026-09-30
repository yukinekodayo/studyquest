# ローカル開発スタック(Docker不要)

`supabase start`(Docker)が使えない環境向けの簡易スタックです。**開発・検証専用**で、本番では使いません。

- PostgreSQL 16 に `supabase/migrations/*.sql` を適用
- [PostgREST](https://postgrest.org) を起動(Supabase の REST 層と同じもの)
- 小さな認証サーバー(`/auth/v1/*`)と、`/rest/v1/*` を PostgREST に中継するゲートウェイを 54321 番で起動

```bash
# PostgREST のバイナリを用意(PATH か POSTGREST_BIN で指定)
node scripts/local-stack/start.mjs
# → EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 と表示される anon key を .env に設定
```

普段の開発では Supabase CLI(`supabase start`)を使うのがおすすめです。
