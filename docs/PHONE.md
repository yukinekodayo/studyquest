# スマホで動かす手順(Expo Go)

必要なもの: **パソコン**(Node.js 20 以上)、**スマホ**(iPhone / Android)、無料の **Supabase アカウント**。
パソコンとスマホは同じ Wi-Fi につなぎます。

## 1. Supabase のプロジェクトを作る(5分)

1. <https://supabase.com> でアカウントを作り、**New project** を作成(リージョンは Tokyo がおすすめ)。
2. 左メニュー **SQL Editor** → **New query** を開く。
3. このリポジトリの [`supabase/setup_all.sql`](../supabase/setup_all.sql) の**全文**を貼り付けて **Run**(1回だけ)。
   - 「Success」と出れば完了です。もう一度実行するとエラーになります(2回目は不要)。
4. 左メニュー **Authentication → Sign In / Providers → Email** を開き、**Confirm email をオフ** にして保存。
   - オンのままだと、登録後にメール確認が必要になります。
   - **注意: Confirm email をオフにするのは、手元で試すためのテスト用設定です。** 他の人に公開する本番のプロジェクトでは、なりすまし登録を防ぐため必ず **オン** にしてください(あわせてメールの送信設定も確認)。
5. 左メニュー **Project Settings → API** を開き、次の2つを控える。
   - **Project URL**(`https://xxxx.supabase.co`)
   - **anon public** のキー(`service_role` のキーは使わない・どこにも貼らない)

## 2. アプリを用意する

```bash
git clone https://github.com/yukinekodayo/studyquest.git
cd studyquest
git checkout ccr-5a3266bc-arzdv5
npm install
cp .env.example .env
```

`.env` を開いて、控えた値に書き換えます。

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...(anon public のキー)
```

## 3. スマホで開く

1. スマホに **Expo Go** をインストール(App Store / Google Play)。
2. パソコンで `npx expo start` を実行すると、ターミナルに **QR コード**が出ます。
3. - iPhone: 標準の **カメラ** で QR を読み取り → Expo Go で開く
   - Android: **Expo Go** アプリの「Scan QR code」で読み取る
4. 起動したら「新しく登録する」から、ニックネームとアイコンを選んで登録 → 今日のやることを追加 → 開始。

友だち機能を試すには、もう1台(家族のスマホ等)でも同じ手順で登録し、
**マイページ > 設定** のフレンドコードを入力して申請 → 承認します。

## うまくいかないとき

| 症状 | 対処 |
|---|---|
| QR を読んでも開かない / タイムアウト | パソコンとスマホが同じ Wi-Fi か確認。だめなら `npx expo start --tunnel`(初回に追加パッケージの導入を聞かれます) |
| 「アプリの設定がまだ終わっていないよ」と出る | `.env` が未設定。保存後に `npx expo start --clear` で再起動 |
| 登録しても進まない / 「確認メール」と出る | 手順1-4の **Confirm email** がオンのまま |
| 「うまくいかなかったよ」が続く | 手順1-3の SQL が未実行、または途中でエラー。SQL Editor でもう一度確認 |
| ログイン後に何も表示されない | Supabase の **Project Settings > API** の URL とキーの貼り間違い |

## 補足

- 開発用のビルド(Expo Go)です。App Store / Google Play 向けの配信は README の「iOS / Android への配信」を参照。
- この手順の Supabase 本番環境と実機での動作は、まだ検証できていません。つまずいたら画面のスクリーンショットかエラー文を教えてください。
