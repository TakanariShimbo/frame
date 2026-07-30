# フォトコンテスト開催告知ページ 更新手順書

対象ページ：`/photo-contest/2026-01/announcement`
（`2026-01` は「2026年の第1回」を表す開催識別子です）

このページの文言・画像・状態は、**すべてデータファイルと画像ファイルの編集だけ**で更新できます。
`.tsx` などのプログラムを編集する必要はありません。

---

## 1. 触るファイルはこの2種類だけ

| 種類 | 場所 |
|---|---|
| コンテンツ（文章・状態・SNS・協賛など） | `public/data/photo-contests/announcements/2026-01.json` |
| 画像（メインビジュアル） | `public/images/photo-contests/2026-01/announcement/` |

一覧ページ（`/photo-contest`）からの導線は `public/data/photo-contests/archive.json` で管理します（→ 15章）。

JSONは「キー」と「値」の集まりです。**値（`"..."` の中身）だけ**を書き換えてください。
カンマ `,` や括弧 `{ } [ ]` を消すとページが表示されなくなります。編集後は必ず 17章の確認を行ってください。

---

## 2. メインビジュアル画像の差し替え

`public/images/photo-contests/2026-01/announcement/` に置いた画像を、JSONの `hero.image` で参照しています。

```json
"image": {
  "src": "/images/photo-contests/2026-01/announcement/hero.jpg",
  "mobileSrc": "/images/photo-contests/2026-01/announcement/hero-mobile.jpg",
  "alt": "夕日に染まる山の稜線を撮影する登山者",
  "position": "center 40%"
}
```

- **差し替え方法**：同じファイル名（`hero.jpg` / `hero-mobile.jpg`）で新しい画像を上書きするだけです。
- **PC用とスマホ用**：`src` がPC用、`mobileSrc` がスマホ用です。`mobileSrc` を消す（`null` にする）と、スマホでもPC用画像が使われます。
- **alt**：画像の内容を説明する文字です（目が見えない方や読み上げ用）。必ず入れてください。
- **position**：画像のどこを中心に見せるか。`"center"`（中央）/ `"center 40%"`（少し上寄り）/ `"center 60%"`（少し下寄り）など。

### 推奨画像サイズ

| 用途 | 推奨サイズ | 比率 | 形式 |
|---|---|---|---|
| PC（`src`） | 横 2400px 程度（例 2400×1350） | 16:9（横長） | JPG |
| スマホ（`mobileSrc`） | 横 1080px 程度（例 1080×1350） | 4:5（やや縦長） | JPG |

- 1枚あたり **300KB 以下** を目安に書き出してください（重いと表示が遅くなります）。
- 参考画像そのものや、権利のない写真は使わないでください。

---

## 3. タイトル・英字見出しの変更

```json
"hero": {
  "eyebrow": "ANNOUNCEMENT",
  "titleLines": ["PHOTO", "CONTEST"],
  "yearLabel": "2026",
  "lead": "山の個性を、あなたの視点で。",
  "description": "ヤマフレームフォトコンテスト 2026"
}
```

- `titleLines`：大きな英字見出し。**配列の1要素が1行**になります（`["PHOTO", "CONTEST"]` → 2行）。
- `yearLabel`：見出し下のゴールドの年号。
- `lead`：明朝体の大きなリードコピー。
- `description`：その下の小さな補足。

---

## 4. テーマの変更

```json
"theme": {
  "title": "山を、もっと自分らしく。",
  "description": "写真の上手さではなく、アプリを使って出力した山写真の個性を評価するフォトコンテストです。"
}
```

---

## 5. 開催期間の変更

開催期間は `status` の日時から自動で「2026.08.08 — 2026.08.31」のように表示されます。
`status` の `startAt`（開始）と `endAt`（終了）を書き換えてください（→ 6章）。

日付の下の一文は `periodNote` です。

```json
"periodNote": "応募期間中に投稿された作品が対象です。"
```

---

## 6. 開催状態の切り替え（開催前 / 受付中 / 受付終了 / 結果公開）

このページは同じURLのまま、状態に応じてヒーローの表示が変わります。

```json
"status": {
  "mode": "auto",
  "override": null,
  "timeZone": "Asia/Tokyo",
  "startAt": "2026-08-08T00:00:00+09:00",
  "endAt": "2026-08-31T23:59:59+09:00",
  "resultsPublished": false
},
"statusLabels": {
  "scheduled": "開催決定・近日受付開始",
  "open": "応募受付中",
  "closed": "応募受付終了",
  "resultsPublished": "結果公開済み"
}
```

### 自動判定（おすすめ）

`"mode": "auto"` の場合、**日本時間**の現在時刻と `startAt` / `endAt` を比べて自動で切り替わります。

| 状態 | 条件 | 表示（`statusLabels`） |
|---|---|---|
| `scheduled` | 開始前 | 開催決定・近日受付開始 |
| `open` | 開始〜終了の間 | 応募受付中 |
| `closed` | 終了後 | 応募受付終了 |
| `resultsPublished` | `resultsPublished` が `true` のとき（最優先） | 結果公開済み |

- 表示文言を変えたいときは `statusLabels` の値を書き換えます。
- 結果ページを公開したら `"resultsPublished": true` にしてください。

### 手動で固定したいとき

日時に関係なく状態を固定したい場合は、次のようにします。

```json
"status": {
  "mode": "manual",
  "override": "open",
  ...
}
```

`override` に `"scheduled"` / `"open"` / `"closed"` / `"resultsPublished"` のいずれかを入れます。

---

## 7. 応募条件の追加・削除

```json
"requirements": [
  "ヤマフレームを用いて出力された写真であること。",
  "#ヤマフレームフォトコンテスト を付けて投稿すること。",
  "指定アカウントをメンションして投稿すること。",
  "山、または山での体験に付随した写真であること。",
  "単写真であること。"
]
```

- 1行 ＝ 1項目（先頭のゴールドのひし形は自動で付きます）。
- 追加：`"...",` の行を足す。削除：不要な行を消す。**最後の行の末尾にはカンマを付けない**点に注意。

---

## 8. ハッシュタグの変更

```json
"hashtag": "#ヤマフレームフォトコンテスト"
```

---

## 9. SNSアカウント（メンション先＝指定アカウント）の設定

「応募プラットフォーム」欄の下に「指定アカウント」として表示されます。
各アカウントは `label`（画面に出る表示名）と `url`（クリック先）で設定します。

```json
"mentionAccounts": {
  "x": { "label": "@r_outdoor_photo", "url": "https://x.com/r_outdoor_photo" },
  "instagram": { "label": "yama_frame", "url": "https://www.instagram.com/yama_frame/" },
  "threads": { "label": "@r_outdoor_photo", "url": "https://www.threads.com/@r_outdoor_photo" }
},
"pendingAccountMessage": "指定アカウントは確定後に掲載します。"
```

- **X / Instagram / Threads**：それぞれ `"x"` / `"instagram"` / `"threads"` の値を設定します。
- **表示名の変更**：`label` を書き換えます（例 `"@yamaframe"`）。
- **リンク先の変更**：`url` を書き換えます。
- **URLだけ未確定のとき**：`"url": null` にすると、表示名だけ出てリンクにはなりません。
- **アカウント自体が未確定のとき**：その項目を丸ごと `null` にします（例 `"x": null`）。
  3つとも `null` にすると、代わりに `pendingAccountMessage` の文が表示されます。
- `"#"` や `example.com` などの仮リンクは絶対に入れないでください。
- 未設定時の表示文を変えたいときは `pendingAccountMessage` を編集します。

---

## 10. 応募プラットフォームの変更

```json
"platforms": ["x", "instagram", "threads"]
```

使える値は `"x"` / `"instagram"` / `"threads"` の3つです。並び順もこの配列の順になります。

---

## 11. 参加方法（ステップ）について

参加方法は応募条件（7章）と内容が重複するため、現在は非表示にしています。
JSONに `steps` の項目はありません。

もし再び表示したい場合は、`application` の中に次のように `steps` を追加します（省略可の項目です）。

```json
"steps": [
  "ヤマフレームを使って作品を出力する。",
  "指定ハッシュタグを付ける。",
  "指定アカウントをメンションする。",
  "X・Instagram・Threadsのいずれかへ投稿する。"
]
```

※ 表示に反映するには画面側の対応も必要です。文言だけでなく表示可否を変える場合は開発担当に相談してください。

---

## 12. 協賛ブランドの追加・削除・リンク設定

```json
"sponsors": [
  {
    "name": "hike junkies",
    "logo": null,
    "linkType": "instagram",
    "linkLabel": "Instagram",
    "url": null,
    "order": 1,
    "isPublished": true
  }
]
```

| キー | 意味 |
|---|---|
| `name` | ブランド名（ロゴ画像が無いときはこの文字が表示されます） |
| `logo` | ロゴ画像のパス。無ければ `null` |
| `linkType` | リンク種別。`"instagram"` / `"official"` / `"x"` / `"none"` |
| `linkLabel` | リンクの表示名（例 `"Instagram"` / `"Official Site"`） |
| `url` | リンク先URL。**未確定なら必ず `null`** |
| `order` | 表示順（小さいほど先。重複させない） |
| `isPublished` | `false` にするとそのブランドを非表示にできます |

- **追加**：`{ ... }` のかたまりをコピーして値を変え、`order` を重複しない数字にします。かたまりの間はカンマ `,` で区切ります。
- **削除**：不要な `{ ... }` のかたまりを（前後のカンマも含めて）消します。
- **リンクの有効化**：`url` に正しいURL（`https://…`）を入れると自動でリンクになり、スマホでは右向き矢印が付きます。
- **URLが未確定のとき**：`url` を `null` のままにします。リンクにはならず、名称とラベルだけが表示されます（後からURLを入れるだけで有効化できます）。
- **ロゴ画像を使うとき**：画像を `public/images/photo-contests/2026-01/announcement/` に置き、`logo` にそのパスを設定します（例 `/images/photo-contests/2026-01/announcement/sponsor-hike.png`）。高さ40px程度で表示されます。

---

## 13. SEO情報の変更

```json
"seo": {
  "title": "ヤマフレームフォトコンテスト 2026 開催のお知らせ | YAMA FRAME",
  "description": "…",
  "ogImage": "/images/photo-contests/2026-01/announcement/hero.jpg"
}
```

- `title`：ブラウザのタブやSNSシェア時のタイトル。
- `description`：検索結果やSNSシェア時の説明文。
- `ogImage`：SNSシェア時に出る画像。差し替え可能です。

---

## 14. 新しい開催回を追加する（例：2026年 第2回 / 2027年）

`.tsx` を編集せずに、次の作業だけで追加できます。

1. コンテンツファイルを新規作成します。ファイル名が識別子になります。
   - 例（同年2回目）：`public/data/photo-contests/announcements/2026-02.json`
   - 例（翌年）：`public/data/photo-contests/announcements/2027-01.json`
   - 既存の `2026-01.json` をコピーして中身を書き換えるのが簡単です。`id` と `slug` もファイル名に合わせて変更してください。
2. 画像フォルダを新規作成し、メイン画像を置きます。
   - 例：`public/images/photo-contests/2026-02/announcement/hero.jpg`
3. 一覧ページからの導線を設定します（→ 15章）。

公開URLは自動的に次になります。

- `2026-02.json` → `/photo-contest/2026-02/announcement`
- `2027-01.json` → `/photo-contest/2027-01/announcement`

---

## 15. 一覧ページ（/photo-contest）からのリンク設定

`public/data/photo-contests/archive.json` の各コンテストに `link` を付けると、
一覧のそのコンテストのリンク先とボタン文言を差し替えられます（未設定なら結果ページへ）。

```json
{
  "year": 2026,
  "title": "黎明の稜線",
  ...
  "link": { "href": "/photo-contest/2026-01/announcement", "cta": "開催概要を見る" }
}
```

状態に応じたおすすめ設定：

| コンテストの状態 | `href`（リンク先） | `cta`（ボタン文言）例 |
|---|---|---|
| 開催予告・受付中・受付終了 | `/photo-contest/<id>/announcement` | 開催概要を見る / 応募方法を見る |
| 結果公開後 | `/photo-contest/<year>`（結果ページ） | 結果を見る |

- 結果を公開したら、`link` を結果ページ側に変える（または `link` を削除して既定の結果ページへ戻す）と、一覧のボタンが結果ページへ向きます。
- `link` を削除しても告知ページの直接URL（`/photo-contest/2026-01/announcement`）は引き続き閲覧できます。

---

## 16. 結果公開後の切り替え手順（まとめ）

1. 告知コンテンツの `status.resultsPublished` を `true` にする（ヒーローが「結果公開済み」表示に変わります）。
2. `archive.json` の該当コンテストの `link` を結果ページ（`/photo-contest/<year>`）に向ける、または `link` を削除する。

---

## 17. 更新後の確認方法

### ローカルでの表示確認

```bash
npm run dev
```

表示されたURL（例 `http://localhost:5173/`）の後ろに `photo-contest/2026-01/announcement` を付けて開きます。
PC幅とスマホ幅（ブラウザの開発者ツールで幅 375px 程度）の両方を確認してください。

### 記述ミスのチェック（公開前に必ず）

```bash
npm run build
```

エラーが出なければOKです。JSONの書き間違い（カンマ抜け・括弧の不一致など）があると、
ページに「ページを表示できません」と出ます。その場合はブラウザの開発者ツールのコンソールに
`photo-contest content error in …` という具体的な原因が表示されるので、それを見て直してください。

### よくある間違い

- 最後の項目の後ろにカンマ `,` を付けてしまう（→ 付けない）。
- `"` を全角の「”」にしてしまう（→ 半角の `"` を使う）。
- 画像パスの打ち間違い（→ 実際のファイル名と一致させる）。
- URL未確定なのに `"#"` や `example.com` を入れてしまう（→ 必ず `null`）。
