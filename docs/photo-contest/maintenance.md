# フォトコンテストページ コンテンツ更新手順書

このドキュメントは、フォトコンテストページ（YAMA FRAME AWARD）の内容を更新する担当者向けの手順書です。
ReactやNext.jsの知識は不要です。**JSONファイルと画像ファイルを編集・追加するだけ**で、すべての更新が完了します。
`.tsx` などのプログラムファイルを編集する必要は一切ありません。

## ページとURL

| ページ | URL | 内容のファイル |
|---|---|---|
| フォトコンテスト一覧 | `/photo-contest` | `public/data/photo-contests/archive.json` |
| 年度別結果（例: 2026） | `/photo-contest/2026` | `public/data/photo-contests/2026.json` |

## ファイルの保存場所

```text
public/
├─ data/
│  └─ photo-contests/
│     ├─ archive.json      ← 一覧ページの内容（見出し・年度リスト）
│     ├─ 2026.json         ← 2026年度の結果ページの内容
│     ├─ 2025.json
│     ├─ 2024.json
│     ├─ 2023.json
│     └─ 2022.json
└─ images/
   └─ photo-contests/
      ├─ 2026/             ← 2026年度の画像（カバー・受賞作品）
      │  ├─ cover.jpg
      │  ├─ cover-mobile.jpg
      │  ├─ grand-prix.jpg
      │  ├─ award-02.jpg
      │  └─ award-03.jpg
      ├─ 2025/
      └─ ...
```

- コンテンツ: `public/data/photo-contests/` の中のJSON
- 画像: `public/images/photo-contests/<年度>/` の中（年度ごとにフォルダを分ける）

---

## 一覧ページ（archive.json）の構造

```json
{
  "heading": {
    "eyebrow": "ARCHIVE",
    "title": "PHOTO CONTEST ARCHIVE",
    "description": [
      "1行目の説明文",
      "2行目の説明文"
    ]
  },
  "seo": {
    "title": "ブラウザタブなどに表示されるタイトル",
    "description": "検索エンジン向けの説明文",
    "ogImage": "/images/photo-contests/2026/cover.jpg"
  },
  "contests": [
    {
      "year": 2026,
      "title": "黎明の稜線",
      "description": "一覧に表示する短い説明文。",
      "coverImage": {
        "src": "/images/photo-contests/2026/cover.jpg",
        "mobileSrc": "/images/photo-contests/2026/cover-mobile.jpg",
        "alt": "朝日に照らされた雪山の稜線",
        "position": "center 45%"
      },
      "isLatest": true,
      "isPublished": true,
      "order": 1
    }
  ]
}
```

- `heading.description` は配列の1要素が1行として表示されます（スマートフォンの狭い画面では自動で折り返します）。
- `contests` の各要素が一覧の1コンテストです。

## 年度別結果ページ（<年度>.json）の構造

```json
{
  "year": 2026,
  "title": "黎明の稜線",
  "description": "ページ左側に表示するコンテスト説明文。",
  "concept": ["山は、", "私たちの原風景であり、", "未来の記憶。"],
  "outro": "受賞作品は今後も順次ご紹介していきます。",
  "isPublished": true,
  "seo": {
    "title": "2026 黎明の稜線 | YAMA FRAME AWARD",
    "description": "検索エンジン向けの説明文",
    "ogImage": "/images/photo-contests/2026/grand-prix.jpg"
  },
  "awards": [
    {
      "id": "grand-prix",
      "order": 1,
      "number": "01",
      "prizeName": "GRAND PRIX",
      "title": "黎明の稜線",
      "copy": "作品の短いコンセプトコピー。",
      "description": "作品の解説文。",
      "image": {
        "src": "/images/photo-contests/2026/grand-prix.jpg",
        "alt": "朝日に照らされた険しい山の稜線",
        "position": "center 45%"
      },
      "winner": {
        "name": "Takashi Yamamoto",
        "x": { "label": "@takashi_yama", "url": "https://x.com/takashi_yama" },
        "instagram": { "label": "takashi_yamamoto_ph", "url": "https://www.instagram.com/takashi_yamamoto_ph/" }
      }
    }
  ]
}
```

- `concept` はPC版ファーストビューの左側に出る大きなコピーです。配列の1要素が1行になります。
- `awards` の各要素が受賞作品1件です。**1件でも、5件以上でも、そのまま追加・削除できます**（左側ナビゲーションの番号も自動で増減します）。

---

## よくある更新のやり方

### タイトルを変更する

- 一覧ページの大見出し: `archive.json` の `heading.title`
- コンテストのタイトル: `archive.json` の `contests[].title`（一覧表示分）と `<年度>.json` の `title`（結果ページ分）の両方
- 作品のタイトル: `<年度>.json` の `awards[].title`

### 説明文・コピーを変更する

- 一覧ページの説明文: `archive.json` の `heading.description`
- コンテストの説明文: `archive.json` の `contests[].description`（一覧） / `<年度>.json` の `description`（結果）
- コンセプトコピー（結果ページ左の大きな文）: `<年度>.json` の `concept`
- 作品のコピー: `<年度>.json` の `awards[].copy`
- 作品の解説: `<年度>.json` の `awards[].description`
- ページ末尾の一文: `<年度>.json` の `outro`（消したい場合はこの行ごと削除）

### 画像を追加・差し替える

1. 画像ファイルを `public/images/photo-contests/<年度>/` に置く
2. JSONの `src`（または `mobileSrc`）のパスをそのファイル名に合わせる

同じファイル名で上書きすれば、JSONの変更は不要です。

- `src` … PC向け画像（必須）
- `mobileSrc` … スマートフォン向け画像（**省略可**。省略するとPC向け画像がそのまま使われます）
- `alt` … 画像の代替テキスト（必須。写真の内容を短い日本語で）
- `position` … 表示位置の調整（省略可）。写真は枠に合わせて自動トリミングされるため、見せたい位置を指定します
  - 例: `"center"`（中央） / `"center 30%"`（上寄り） / `"center 70%"`(下寄り)

推奨画像仕様:

- 形式: WebP または JPEG
- PC向け: 幅2000〜2400px、横長（2:1前後を推奨。結果ページの写真は横長ほどシネマティックに見えます）
- スマートフォン向け（任意）: 幅1200px前後
- 1枚500KB以下を目安に圧縮してください

### 受賞者名・SNSを変更する

`<年度>.json` の `awards[].winner` を編集します。

- 受賞者名: `winner.name`
- Xの表示名: `winner.x.label` / XのURL: `winner.x.url`
- Instagramの表示名: `winner.instagram.label` / URL: `winner.instagram.url`

SNSを表示しない場合は、その項目ごと削除します。

```json
"winner": { "name": "Sota Watanabe" }                        ← SNSなし
"winner": { "name": "...", "x": { "label": "...", "url": "..." } }   ← Xのみ
```

### 受賞作品を追加・削除する

- 追加: `<年度>.json` の `awards` 配列に要素を1つ追加し、画像を年度フォルダへ置く
- 削除: `awards` 配列から該当要素を削除する

`number`（画面に出る作品番号 "01" など）と `order`（並び順）も合わせて調整してください。

### 作品の表示順を変更する

`awards[].order` の数値を変更します（小さい順に表示）。`order` は同じ年度内で重複させないでください。
一覧ページの年度の並びも同様に `archive.json` の `contests[].order` で変わります。

### 新しい年度（例: 2027）を追加する

次の3ステップだけで完了します。プログラムの変更は不要です。

1. `public/data/photo-contests/archive.json` の `contests` に2027年度の要素を追加する
   （`order` を 1 にして他の年度を繰り下げると先頭に並びます）
2. `public/data/photo-contests/2027.json` を作る（既存の `2026.json` をコピーして書き換えるのが簡単です）
3. `public/images/photo-contests/2027/` フォルダを作り、カバー画像と作品画像を置く

### 最新年度（LATEST表示）を変更する

`archive.json` で、新しく最新にする年度の `isLatest` を `true` に、以前の年度を `false` にします。
`isLatest: true` の年度は一覧ページで大きく表示されます。

### 公開・非公開を切り替える

- 一覧から隠す: `archive.json` の該当年度の `isPublished` を `false`
- 結果ページを非公開にする: `<年度>.json` の `isPublished` を `false`（アクセスすると「ページが見つかりません」表示になります）

準備中の年度は両方 `false` にしておき、公開時に `true` へ変えるだけです。

### SEO情報（タイトル・説明・OGP画像）を変更する

`archive.json` / `<年度>.json` の `seo` を編集します。

- `seo.title` … ブラウザタブ・検索結果のタイトル
- `seo.description` … 検索結果の説明文
- `seo.ogImage` … SNSシェア時の画像パス

---

## JSON記述時の注意点

- 文字コードはUTF-8のまま保存してください
- 要素の区切りのカンマ `,` を忘れない・**最後の要素の後ろにカンマを付けない**
- 文字列は必ず `"` （半角ダブルクォート）で囲む（`”` などの全角記号は不可）
- 文中に `"` を書きたいときは `\"` と書く
- パスは `/images/photo-contests/...` のように **先頭にスラッシュ** を付ける

### よくある記述ミス

| 症状 | 原因 |
|---|---|
| ページ全体が「ページを表示できません」になる | JSONの文法エラー（カンマ・クォートの付け忘れなど） |
| 特定の年度だけ表示されない | `isPublished` が `false` のまま / `order` の重複 / 必須項目（title・alt など）の欠落 |
| 画像が表示されない | `src` のパスとファイル名が一致していない（大文字小文字も区別されます） |

記述ミスがあると、開発者ツールのコンソール（F12 → Console）に **どのファイルのどの項目が悪いか** が日本語で表示されます。

---

## 更新後の確認方法

ローカルで確認する場合（Node.jsが必要です）:

```bash
npm install        # 初回のみ
npm run dev        # 開発サーバを起動
```

ブラウザで `http://localhost:5173/photo-contest` を開き、以下を確認します。

1. 一覧ページに追加・変更した年度が表示されること
2. 該当年度の結果ページ（`/photo-contest/<年度>`）が表示されること
3. 画像・受賞者名・SNSリンクが正しいこと
4. スマートフォン幅（ブラウザの開発者ツールで幅390pxなど）でも崩れないこと

公開前の機械チェック:

```bash
npm run lint       # コードチェック（JSONの構文エラーはブラウザのコンソールで確認）
npm run typecheck  # 型チェック
npm run build      # 本番ビルドが通ることの確認
```

`main` ブランチへマージすると、GitHub Actions が自動でビルドしてGitHub Pagesへ公開します。
