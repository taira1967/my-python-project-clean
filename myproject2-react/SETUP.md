# 🔧 セットアップガイド

## 📋 概要

この電気料金比較アプリは、Firebase Authentication、Firestore、Gemini APIを使用しています。

---

## 🏠 ローカル開発環境のセットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルが既に作成されています。

#### ⚠️ 重要：Gemini APIキーを設定してください

`.env.local`ファイルを開いて、以下の行を編集してください：

```
VITE_GEMINI_API_KEY=ここにGemini_APIキーを入力
```

↓ 実際のAPIキーに変更

```
VITE_GEMINI_API_KEY=あなたの実際のGemini_APIキー
```

#### Gemini APIキーの取得方法

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. Googleアカウントでログイン
3. 「Create API Key」をクリック
4. 生成されたAPIキーをコピー
5. `.env.local`ファイルに貼り付け

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` にアクセスしてください。

---

## 🔐 セキュリティ注意事項

### ✅ 安全なファイル（Gitで追跡される）
- `.env.example` - テンプレートファイル（機密情報なし）
- `src/App.jsx` - 環境変数を使用（直接的な機密情報なし）

### 🚫 危険なファイル（Gitで追跡されない）
- `.env.local` - **絶対にGitにコミットしないでください**
- `.gitignore`に`*.local`が含まれているため自動的に除外されます

### 確認方法

```bash
git status
```

`.env.local`が表示されなければOKです！

---

## 🚀 Vercelへのデプロイ

### 準備

#### 1. GitHubにプッシュする前の確認

```bash
# .env.localが含まれていないことを確認
git status

# 安全なファイルのみをコミット
git add .
git commit -m "電気料金比較アプリを追加"
git push origin main
```

#### 2. Vercelプロジェクトの作成

1. [Vercel](https://vercel.com) にログイン
2. 「New Project」をクリック
3. GitHubリポジトリを選択
4. `myproject2-react`ディレクトリを「Root Directory」に設定

#### 3. 環境変数の設定（最重要！）

Vercelのプロジェクト設定で、以下の環境変数を設定してください：

| 変数名 | 値 |
|--------|-----|
| `VITE_FIREBASE_API_KEY` | `AIzaSyARU57Bv5NfGIk0KDtoi09ImlesiIrLrK8` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `my-p1-bcbe8.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `my-p1-bcbe8` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `my-p1-bcbe8.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `21917026577` |
| `VITE_FIREBASE_APP_ID` | `1:21917026577:web:d9bf69c31ececa8a0a24b0` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-98NCZQCEPM` |
| `VITE_GEMINI_API_KEY` | **あなたのGemini APIキー** |
| `VITE_APP_ID` | `default-app-id` |

**設定手順：**

1. Vercelプロジェクト → Settings → Environment Variables
2. 各変数名と値を入力
3. Environment: `Production`, `Preview`, `Development` すべてにチェック
4. 「Save」をクリック

#### 4. デプロイ

環境変数を設定したら、Vercelが自動的にデプロイを開始します。

---

## 🧪 動作確認

### ローカル環境

1. 開発サーバーを起動: `npm run dev`
2. ブラウザで `http://localhost:5173` を開く
3. ログイン画面が表示されることを確認
4. Firebase Authenticationで作成したアカウントでログイン

### Vercel環境

1. Vercelのデプロイが完了したら、URLをクリック
2. ログイン画面が表示されることを確認
3. OCR機能が動作することを確認（画像アップロード → 解析）

---

## ❓ トラブルシューティング

### エラー: "Firebase設定情報が見つかりません"

→ `.env.local`ファイルが正しく作成されているか確認してください。

### エラー: "Gemini APIキーが設定されていません"

→ `.env.local`の`VITE_GEMINI_API_KEY`を実際のAPIキーに変更してください。

### Vercelでアプリが動作しない

→ Vercelの環境変数が**すべて**正しく設定されているか確認してください。

### OCR機能が動作しない

→ Gemini APIキーが有効で、クォータが残っているか確認してください。

---

## 📞 サポート

問題が解決しない場合は、以下を確認してください：

1. `.env.local`ファイルの内容
2. Vercelの環境変数設定
3. Firebase Consoleのプロジェクト設定
4. Google AI StudioのAPIキーの状態

---

**© 2025 kazumasa taira. All rights reserved.**








