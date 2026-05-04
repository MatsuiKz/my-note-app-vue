# My Note App

## デモ

https://note-app-test-2b9e5.web.app/

## 概要

Vue3 + TypeScript + Firebaseで構築したnoteアプリです。
Googleアカウントでログインして、noteの投稿・いいね・コメントができます。

## 使用技術

- Vue 3 / TypeScript
- Firebase Authentication（Googleログイン）
- Cloud Firestore
- Firebase Hosting
- Vite

## 機能

- Googleログイン・ログアウト
- note投稿・一覧表示
- いいね機能（二重いいね防止・likeCountのリアルタイム更新）
- コメント投稿・一覧表示
- 書き込み制限（note投稿・コメント・いいねは1ユーザーにつき1日3件まで）

## Firestore設計

### コレクション構造

```
users/{userId}
notes/{noteId}
comments/{commentId}
likes/{noteId_userId}
```

### 設計のポイント

- commentsとlikesは分離型で設計。noteIdをフィールドに持たせることでwhere句による絞り込みを可能にした
- likesのドキュメントIDをnoteId_userIdの複合キーにすることで、同一ユーザーの二重いいねを構造で防止
- いいね数はnotesにlikeCountとして保持し、一覧表示時のクエリコストを削減
- likesの作成・削除とlikeCountの更新はrunTransactionで整合性を担保

### 複合インデックス

- comments: noteId ASC, createdAt DESC

## ローカル起動手順

```bash
git clone git@github.com:MatsuiKz/my-note-app-vue.git
cd my-note-app-vue
npm install
```

`.env.example` をコピーして `.env` を作成し、自身のFirebaseプロジェクトの設定値を入力してください。

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

```bash
npm run dev
```
