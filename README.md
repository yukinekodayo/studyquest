# StudyQuest

**「今日のやること、全部クリアしよう。」** — 中高生向けの学習支援アプリ(iOS / Android)。

自分で決めた1日の学習計画を、1つずつクエストとしてクリアし、全部達成すると「ハンコ」がもらえる。友だちと進み具合を見せ合い、応援し、一緒に勉強し、グループで協力チャレンジができる。

- **アプリ**: Expo (React Native) + Expo Router + TypeScript(strict)
- **バックエンド**: Supabase(Auth / PostgreSQL / RLS)。ゲームロジックはすべてDB側の関数で実行
- **デザイン**: 提供された UI PDF(温かいグレー地・濃い青・明朝体の見出し・朱色の「済」ハンコ・イニシャルのアイコン)に準拠。フォントは Shippori Mincho(見出し)/ Noto Sans JP(本文)/ DM Sans(数字)

## 実装済みの範囲

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | 認証 / プロフィール / タスク(追加・編集・削除・並び替え・完了/未完了) / タイマー / 1日達成判定 / ハンコ / ハンコ帳 | ✅ |
| 2 | フレンド(コード・申請・承認・削除) / 進捗共有 / 応援リアクション / 一緒に勉強する | ✅ |
| 3 | グループ / 協力チャレンジ / XP・レベル | ✅(コレクション拡張は未着手) |
| — | 設定 / プライバシー設定 / **アカウント削除**(App Store 審査要件) | ✅ |

画面: `/home` `/quest` `/quest/[id]` `/complete` `/stamps` `/friends` `/study-party` `/groups` `/groups/[id]` `/profile` `/settings` `/login` `/signup`

## ハンコのルール(サーバーで判定)

その日の「絶対やる」タスクが **1つ以上あり、すべて完了** した瞬間に、その日が「クリア」になる(連続日数・累計・XPはここで記録)。
**ハンコは、クリアした後にユーザー自身がタップして押す**(完了画面。押し込み→ドンッ→振動)。種類は、その日の連続日数からサーバーが決める。押し忘れても連続日数は途切れず、ハンコ帳の「押す」から後で押せる(直近60日)。

| 連続日数 | ハンコ |
|---|---|
| 通常 | 通常ハンコ |
| 7の倍数 | 青ハンコ(7, 14, 21…) |
| 30の倍数 | 緑ハンコ |
| 60の倍数 | 金ハンコ |
| 100の倍数 | 特別ハンコ |

- 大きい節目を優先(例: 210日目は緑)。「青×5」のように青が複数回もらえるPDFの表示に合わせ、7日ごとに繰り返す解釈にしています(仕様書の「7日連続 → 青」の解釈)。変えたい場合は `stamp_for_streak`(SQL)と `src/domain/stamps.ts` を同時に直してください(0〜1000日の一致をテストしています)。
- 1日休むと **連続日数だけ** リセット。獲得済みハンコ・最高連続・累計達成は消えない。
- 同じ日に二重達成/二重付与は起きない(`daily_completions` と `stamps` が `(user_id, 日付)` で一意)。
- 一度もらったハンコは、後からタスクを未完了に戻しても取り消さない。XPも二重取得できない。
- 「日付」はユーザーのタイムゾーン(登録時に端末から取得)で判定。過去日のタスクは完了できない。

## セキュリティ / プライバシー設計

- **状態はRPC経由でのみ変更**。クライアントは `tasks` の `title / planned_minutes / kind` しか更新できず、`status`・XP・達成・ハンコは列権限で直接書き込み不可(テスト済み)。
- **RLS** をすべてのテーブルに設定。友だちのタスク・セッション・達成記録は直接読めず、`friends_overview()` などの集計関数だけが「達成数・クリア済み・勉強中・連続日数」を返す。
- プロフィールに載せるのは **ニックネームとアイコンのみ**(本名・学校・住所・電話は聞かない)。勉強中の教科名を友だちに見せるかは設定で切り替え可能。
- フレンドは **コード + 承認制**。知らない人からフォローされない。チャット・自由な会話機能はない。
- 入力検証は「クライアント(zod)+ DB制約 + RPC内チェック」の二重三重。空/長すぎるタスク名、マイナスや過大な予定時間、他人のIDへのアクセスなどをサーバー側で拒否。
- エラーは `src/domain/errors.ts` でユーザー向けの短い日本語に変換(SQL・スタックトレースは表示しない)。

## セットアップ

```bash
npm install
cp .env.example .env    # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY を設定
```

### Supabase

1. Supabase プロジェクトを作成し、`supabase/migrations/*.sql` を順に適用(`supabase db push`、または SQL Editor に貼り付け)。
2. `.env` に Project URL と **anon key**(service_role キーは絶対に入れない)を設定。
3. Auth > メール認証。本番で「メール確認」を有効にする場合、登録画面は「確認メールを送ったよ」を表示する。

> スマホ(Expo Go)で試すだけなら、[docs/PHONE.md](docs/PHONE.md) の手順が最短です(`supabase/setup_all.sql` を貼り付けるだけで DB が整います。`npm run setup-sql` で再生成)。

### 起動

```bash
npm start          # Expo Go(実機)/ シミュレータ
npm run ios
npm run android
```

> Docker/Supabase CLI が使えない環境では `npm run stack` で Postgres + PostgREST + 簡易認証サーバーを起動できます(開発専用・[説明](scripts/local-stack/README.md))。

## テスト

```bash
npm run typecheck
npm run test:unit   # 純粋ロジック(ハンコ判定・タイマー計算・日付・入力検証・エラー文言)
npm run test:db     # PostgreSQL 16 を一時起動し、マイグレーションを実DBで検証(RLS・RPC・境界値)
```

`test:db` は 7 / 30 / 60 / 100 日の境界、リセット後の過去ハンコ保持、二重付与の防止、友だちデータのアクセス制御、タイマー計算、退会時のデータ削除などを検証します(PostgreSQL 16 のバイナリが必要。`PG_BIN` か `TEST_DATABASE_ADMIN_URL` で指定)。

### E2E(ブラウザで実操作)

Web版をビルドして配信し、PlaywrightでスマホサイズのChromiumから実際に操作します。事前に `npm run stack` と `.env` の設定が必要です。

```bash
npm run web:export && npm run web:serve   # 別ターミナルで
npm run e2e:phase1   # 登録 → 計画 → タイマー → 完了 → ハンコ → ハンコ帳 → リロード後も保持
npm run e2e:phase2   # 2ユーザーでフレンド・応援・一緒に勉強・グループ・退会
```

## iOS / Android への配信

Expo(EAS Build)でビルドします。

```bash
npm i -g eas-cli && eas login
eas build:configure                    # app.json に extra.eas.projectId が入る
eas build -p ios --profile production
eas build -p android --profile production
eas submit -p ios / -p android
```

- 識別子は `app.json` の `app.studyquest.mobile`(iOS bundleIdentifier / Android package)。変更する場合は先に決めてください。
- ストア申請前に必要なもの: **プライバシーポリシーのURL**、年齢区分の設定(中高生向け・13歳未満の扱い、保護者同意の要否は各国の規約を確認)、スクリーンショット。
- アカウント削除(設定 > アカウントを削除)は実装済み。

## ディレクトリ構成

```
app/                 画面(Expo Router)。(tabs) が下部ナビ付き、quest/[id]・complete はナビなし
src/domain/          UIに依存しない純粋ロジック(ハンコ・タイマー・日付・検証・エラー文言)
src/api/             Supabase呼び出し(型付きRPCラッパー)。UIから分離
src/features/        画面ごとの部品・データ取得フック(TanStack Query)
src/ui/              共通UI(テーマ・ボタン・シート・ハンコ/アイコンのSVG・タップで押すハンコ)
src/lib/haptics.ts   端末の振動(ハンコを押した瞬間は 強→中→成功 の3段)
src/types/           DB型定義
supabase/migrations/ スキーマ・RLS・ゲームロジック(SQL関数)
tests/               unit(純粋ロジック) / db(実Postgres)
scripts/             ローカルスタック・E2E・アセット生成
```

## 既知の制限 / 次にやること

- **プッシュ通知は未実装**(PDFの「通知の設定」メニューは未作成)。タイマー終了の通知や応援の通知は今後の追加項目。
- リアルタイム同期は Supabase Realtime ではなく **ポーリング**(友だち/勉強中は15〜20秒間隔)。RLSを保ったまま、集計関数で安全に返すための選択。
- フレンドコードの総当たり対策(レート制限)は未実装。公開前にゲートウェイ側での制限を推奨。
- 「勉強中」の共有はタイマー実行中のみ。1つのセッションは最大8時間で頭打ち。
- `supabase/config.toml` は Docker が無い環境で作ったため、`supabase start` での動作は未検証。
- タイムゾーンは登録時の端末設定で固定(引っ越し等での変更UIは未実装)。
