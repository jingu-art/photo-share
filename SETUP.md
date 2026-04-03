# セットアップ手順書 — photo-share（Cloudflare R2版）

---

## 1. Cloudflare アカウントの作成（カード不要・無料）

1. [Cloudflare](https://dash.cloudflare.com/sign-up) でアカウントを作成
2. メール認証を完了する

> クレジットカード登録なしで R2 の無料枠が使えます。

---

## 2. R2 バケットの作成

1. Cloudflare ダッシュボード左サイドバー → **「R2」**
2. **「Create bucket」** をクリック
3. Bucket name に `photo-share` と入力
4. Location は **「Automatic」** のまま → **「Create bucket」**

---

## 3. API トークンの作成（R2 読み書き権限）

1. R2 トップページ右上の **「Manage R2 API tokens」**
2. **「Create API token」** をクリック
3. 以下を設定：
   - Token name: `photo-share-token`（任意）
   - Permissions: **「Object Read & Write」**
   - Bucket: **「Apply to specific bucket」→ `photo-share`**
4. **「Create API Token」** をクリック
5. 表示される以下の値を必ず保存（この画面を閉じると再表示不可）：
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`

### アカウント ID の確認

- R2 トップページ右側の **「Account ID」** の値 → `R2_ACCOUNT_ID`

---

## 4. 環境変数の設定（ローカル開発）

```bash
cp .env.local.example .env.local
```

`.env.local` を開いて値を入力：

```env
R2_ACCOUNT_ID=（Cloudflare ダッシュボードの Account ID）
R2_ACCESS_KEY_ID=（API トークンの Access Key ID）
R2_SECRET_ACCESS_KEY=（API トークンの Secret Access Key）
R2_BUCKET_NAME=photo-share
CRON_SECRET=（任意のランダム文字列）
```

---

## 5. ローカル起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開いて動作確認。

---

## 6. Vercel へのデプロイ

### 6-1. Vercel CLI でデプロイ（初回）

```bash
npm install -g vercel
vercel login
vercel
```

- Framework Preset: **Next.js**
- Root Directory: `.`（そのまま Enter）

### 6-2. 環境変数を Vercel に設定

Vercel ダッシュボード → プロジェクト → **Settings → Environment Variables** で以下を追加：

| 変数名 | 値 |
|--------|-----|
| `R2_ACCOUNT_ID` | Cloudflare の Account ID |
| `R2_ACCESS_KEY_ID` | API トークンの Access Key ID |
| `R2_SECRET_ACCESS_KEY` | API トークンの Secret Access Key |
| `R2_BUCKET_NAME` | `photo-share` |
| `CRON_SECRET` | ローカルと同じ値 |

### 6-3. 本番デプロイ

```bash
vercel --prod
```

---

## 7. Vercel Cron の設定

`vercel.json` に以下が記載されています（変更不要）：

```json
{
  "crons": [
    {
      "path": "/api/cleanup",
      "schedule": "0 18 * * *"
    }
  ]
}
```

- `0 18 * * *` = UTC 18:00 = JST 03:00 に毎日実行
- `/api/cleanup` は `Authorization: Bearer {CRON_SECRET}` で保護

---

## 8. R2 のデータ構造

```
photo-share バケット/
└── photo-share/
    ├── {uuid-1}/
    │   ├── _metadata.json   ← { name: "フォルダ名", createdAt: "ISO文字列" }
    │   ├── photo001.jpg
    │   └── photo002.jpg
    └── {uuid-2}/
        ├── _metadata.json
        └── photo003.jpg
```

---

## 9. 無料枠の制限（アプリ側で自動制御）

| 項目 | R2 無料枠 | アプリの制限 |
|------|-----------|------------|
| ストレージ | 月 10GB | 合計 8GB 超えたらアップロード拒否 |
| 書き込みリクエスト | 月 100 万回 | 1 ファイルずつ順番にアップロード |
| 読み込みリクエスト | 月 1000 万回 | キャッシュヘッダーで制御 |
| ファイルサイズ | — | 1 ファイル最大 20MB |

---

## 10. R2 の CORS 設定（Presigned URL 直接アップロード用）

iPhone → R2 直接アップロード（Presigned URL）を使う場合、R2 バケットに CORS 設定が必要です。

### wrangler を使う方法

```bash
npx wrangler r2 bucket cors put photo-share --file cors-config.json
```

> `wrangler` が未インストールの場合は `npm install -g wrangler` でインストールしてください。

### Cloudflare ダッシュボードを使う方法

1. Cloudflare ダッシュボード → **R2** → `photo-share` バケット
2. **Settings** タブ → **CORS Policy**
3. **Add CORS policy** をクリックし、`cors-config.json` の内容を貼り付けて保存

`cors-config.json` の内容：

```json
[
  {
    "AllowedOrigins": [
      "https://photo-share-lake.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

> 本番ドメインが変わる場合は `AllowedOrigins` を適宜更新してください。

---

## 完成チェックリスト

- [ ] `npm install` が通る
- [ ] `npm run dev` でローカル起動できる
- [ ] フォルダ一覧が表示される
- [ ] 写真をアップロードできる
- [ ] 8GB 超過時にエラーメッセージが表示される
- [ ] 同名フォルダへの追加アップロードが動作する
- [ ] フォルダ詳細画面でサムネイルが表示される
- [ ] ZIP ダウンロードが動作する
- [ ] Vercel Cron で 7 日経過フォルダの自動削除が動作する
