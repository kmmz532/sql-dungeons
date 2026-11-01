# SQLダンジョン 調査レポート（不具合・改善・設計）

- 調査日: 2026-11-01
- 対象: `main` ブランチ（コミット `b6ba460`）
- 方法: ソースコード・データファイルの静的解析（実行環境に JS ランタイムが無いため、ブラウザ/Node での実行確認は未実施）
- 確度表記: **確定** = コード上で一意に再現経路が追える / **高** = 複数ファイルを跨いだ推論で、実行確認を推奨

---

## 修正状況（2026-11-01 対応）

> 実行環境に JS ランタイムが無いため、ブラウザでの動作確認は未実施です。括弧の対応は簡易チェック済みです。実プレイでの確認を推奨します。

### 報告の訂正
- **P0-4 は誤りでした。** IN フェーズは `prop` が `null` のため、もともと実行されていませんでした（到達不能）。このため IN フェーズと `parsed.in` は削除しました（挙動は変わりません）。`IN (SELECT ...)` が実際に空結果になるかは未確認で、ブラウザでの確認が必要です。
- **P2 の i18n 欠落** は、フォールバック先が ja_jp ではなく en_us であるため、実害は限定的です。ja 基準の比較で欠落に見えていた分を含みます。

### 対応済み
| 項目 | 内容 |
|---|---|
| P0-1 | クリア判定をダンジョン単位のキー（`dungeon:フロア番号`）に統一。ステージ選択へ遷移するようにした |
| P0-2 | 11/12/14/15階に `databases: ["fruit"]` を追加。13階は `user.json` の `users` / `types` を使うよう変更。重複していた `user2.json` と旧統合DB `mock-database.json`（およびそのフォールバック処理）を削除 |
| P0-3 | `HavingClause` を default export に修正。レジストリはクラス以外を登録しない。HAVING は MAX/MIN、`<>`/`!=` に対応 |
| P0-4 | 上記の訂正参照 |
| P0-5 | 正解側の結果が空のときは不正解にし、データ不備としてログ出力 |
| P0-6 | `NOT IN` / `NOT LIKE` / `NOT BETWEEN` の後置 NOT と TRUE/FALSE リテラルに対応 |
| P1-1 | ヒント本文を `Floor.getHint()`（i18n）から取得 |
| P1-2 | ヒント購入状況をダンジョン単位で管理。旧セーブの数値キーは読込時に変換 |
| P1-3 | 正解時、クエリで使われた消費アイテムを1つ消費（習得済み・借用中は対象外） |
| P1-4 | ORDER BY の `e.price` など修飾列に対応。LIMIT・セミコロンより前で切る |
| P1-5 | 集約関数は修飾列の完全一致を優先（`resolveAggregateValue`）。LEFT JOIN の NULL を数えない |
| P1-6 | LIMIT 句に対応 |
| P1-7 | 存在しないファイル名を修正。ファイル単位で cache.add。古いキャッシュを削除。キャッシュ名を v2 に |
| P1-8 | 確認済みデプロイ時刻を localStorage に保存し、新しいデプロイがあったときだけ確認。文言は i18n |
| P1-9 | `countOpen` / `countClose` を `let` に変更 |
| P2 | `SQLParser.DEBUG` を無効化。結果メッセージを textContent で描画（XSS 対策）。句ネクストの文言を i18n 化。ダンジョン順序のハードコードを解消。診断メッセージを i18n 化。旧セーブのフロア番号を読込時に正規化 |

### 新機能: ダンジョン（ステージ）選択画面
- 「新しくプレイ」は先頭ダンジョン（チュートリアル）の先頭フロアから開始します。
- 最終フロアをクリアすると、クリア表示付きでステージ選択画面へ遷移します。
- タイトル画面の「ダンジョン選択」から、いつでも選択画面を開けます。
- 一覧は `assets/data/dungeons/manifest.json` から動的に読み込みます。名前・説明は i18n の `stage.<キー>.name` / `stage.<キー>.desc` から取得し、未定義なら JSON の `title`、さらにキー名を表示します。
- クリア済みのステージには印を表示します。ステージのロックはしていません。

### 未対応（今回のスコープ外）
- §4-1 SQL エンジンの AST 化、§4-3 テスト基盤、§4-7 HTML 4重複の解消
- condition-util.js のデッドコード（トークナイザが必ず return するため到達しない正規表現分岐）の削除
- セーブインポート時のスキーマ検証
- ウィンドウ関数の `OVER (ORDER BY ...)` が、ORDER BY の正規表現に誤って拾われる（表示順のみに影響。採点は行をソートして比較するため影響なし）

---

## 0. サマリ

| 優先度 | 件数 | 主な内容 |
|---|---|---|
| P0（進行不能・採点崩壊） | 6 | 次ダンジョンへ進めない / チュートリアル11〜15階のDB未指定 / HAVING が無効 / IN サブクエリで結果が空 / 空結果どうしで正解扱い / NOT IN が逆転 |
| P1（機能不全） | 9 | ヒント本文が表示されない / 消費アイテムが消費されない / ORDER BY の修飾列 / 集約関数の修飾列無視 / SW キャッシュが空 / 更新チェックが機能しない ほか |
| P2（品質・UX） | 多数 | i18n 漏れ・直書き文言、デバッグログ常時出力、エネルギーの課金順序 など |
| 設計 | 7 | SQLエンジンの正規表現パース依存、パース結果の破壊的変更、HTML 4重複 など |

最優先は **P0-1〜P0-6**。いずれも「正しいクエリが不正解になる」か「誤ったクエリが正解になる」、または「ゲームが先に進めない」問題です。

---

## 1. 不具合（P0: 進行不能・採点崩壊）

### P0-1. チュートリアルをクリアしても初級ダンジョンへ進めない【確定】
[query-executor.js:381-397](../assets/js/ui/query-executor.js#L381-L397)

```js
const candidates = [`floor:${canonicalFloorNum}`];
return ... candidates.some(c => game.player.clearedFloors.has(c));
```

`clearedFloors` には数値（`clearedFloors.add(keyNumeric)`）が入るのに、判定は旧形式の文字列 `"floor:15"` で行っています。`isCleared` は常に `false` になり、最終フロアでは必ず `else` 分岐に入ってエンド画面が出ます。「次のダンジョンへ」ボタンは表示されません。

- **影響**: `beginner` ダンジョンには通常プレイで到達できない（`startGame` は常に先頭の `tutorial` から始まる）。
- **修正案**: `game.player.clearedFloors.has(Number(canonicalFloorNum))` にする。直前で同じフロアをクリア済みにしているので、判定そのものを省いてもよい。

### P0-2. チュートリアル11〜15階に `databases` が無く、テーブルが存在しない【確定】
[tutorial.json:94-131](../assets/data/dungeons/tutorial.json#L94)

11〜15階には `databases` フィールドがありません。そのため [game-core.js `getCurrentMockDatabase`](../assets/js/core/game-core.js) は既定 DB（manifest の先頭 = `tutorial.json`。`table001` / `table002` しか持たない）を返します。

| 階 | 必要なテーブル | 状態 |
|---|---|---|
| 11, 12, 14, 15 | `fruits`, `fruits2`, `colors` | `fruit` DB を指定すれば解決 |
| 13 | `users2`, `usertypes` | **どの分割DBにも存在しない**（旧 `mock-database.json` にのみ存在。`user2.json` のテーブル名は `users` / `types`） |

- **影響**: スキーマ欄が空になる。正解クエリも空結果になり、P0-5 と組み合わさって「空を返す任意のクエリが正解」になる。
- **修正案**: 11/12/14/15階に `"databases": ["fruit"]` を追加する。13階は `user2.json` のテーブル名を `users2` / `usertypes` に揃えるか、問題文と answer を `user2` の実テーブル名に合わせる。加えて、ロード時に「answer の実行結果が空」「参照テーブルが存在しない」を検出するデータ検証を入れる（§4-3）。

### P0-3. HAVING 句がレジストリに正しく登録されず、常に無視される【確定】
[having-clause.js:50](../assets/js/sql/clause/having-clause.js#L50) / [register.js](../assets/js/register.js)

```js
export default { HavingClause };   // ← クラスではなくオブジェクト
```

Registry は `mod.default || mod[key] || ...` の順で取り出すため、オブジェクト `{ HavingClause }` が `HAVING` として登録されます。この結果、次の2つが起きます。

1. `Cls.apply` が存在しないので HAVING フェーズが黙ってスキップされる（[sql-parser.js:539-547](../assets/js/sql/sql-parser.js#L539-L547)）。
2. `validateQuery` は `new c(...)` に失敗し、`keyword` が undefined になる。そのため HAVING の所持チェックが行われない。

- **影響**: 初級9・14・15階（HAVING の学習フロア）で、HAVING を書かなくても正解になる。ショップの「HAVING（消耗品）」も買う意味がない。
- **修正案**: `export default HavingClause;` に修正する。さらに Registry 登録時に `typeof ctor === 'function'` を検証し、違反したら警告を出す。

### P0-4. `IN (SELECT ...)` を含むクエリが空結果になる【訂正あり: 下記参照】
[sql-parser.js:860-878](../assets/js/sql/sql-parser.js#L860-L878) と [sql-parser.js:549-557](../assets/js/sql/sql-parser.js#L549-L557)

`parseSQL` はパース時に WHERE 内の `col IN ( ... )` を正規表現 `\(([^)]+)\)` で `parsed.in` に格納します。サブクエリの場合は `"SELECT emp_id FROM sales WHERE quantity > 5"` という**文字列そのもの**が items になります。後段の emulate はサブクエリを評価して `parsed.where` だけを書き換え、`parsed.in` は元のまま残します。そのうえで IN フェーズ（Registry に `IN` があるため実行される）がこのゴミ items で再フィルタし、全行を落とします。

- **影響**: 初級10・11階の正解クエリが空結果になる（10階は SUM が 0 の1行）。P0-5 により「空を返すクエリなら何でも正解」になる。
- **付随**: IN フェーズは ORDER BY の後（GROUP BY の後）に実行されるため、GROUP BY と IN を併用すると、グループ化後の行に元の列が無く全行が消える。
- **修正案**: WHERE で IN を評価済みなので、IN フェーズ（`parsed.in`）を廃止する。残す場合でも、サブクエリ置換後に `parsed.in` を再計算する。

### P0-5. 正解の結果が空のとき、ユーザーの結果も空なら無条件に正解【確定】
[sql-parser.js:52-54](../assets/js/sql/sql-parser.js#L52-L54)

```js
if (Array.isArray(answerResult) && answerResult.length === 0) {
    return Array.isArray(userResult) && userResult.length === 0;
}
```

`emulate` はパース失敗・テーブル不存在・例外のいずれでも `[]` を返します。そのため answer が（P0-2/P0-4 などで）空になるフロアでは、`SELECT x FROM nothing` のような**壊れたクエリでもクリア**できます。

- **修正案**: emulate のエラーと空結果を区別する（例: `{ ok, rows, error }` を返す）。answer がエラーまたは空ならデータ不備としてログに出し、ユーザー側がエラーなら不正解にする。列構成（ヘッダ）も比較対象に含める。

### P0-6. `NOT IN` / `NOT LIKE` / `NOT BETWEEN` が正しく評価されない【確定】
[condition-util.js:126-190](../assets/js/sql/util/condition-util.js#L126-L190)

トークナイザ方式の `parsePrimary` は、`NOT` を式の先頭（`NOT expr`）でしか解釈しません。`col NOT IN (...)` では `col` の直後が `NOT` なので、どの分岐にも当たらず `return !!v`（列値の真偽）を返し、残りのトークンは捨てられます。さらに P0-4 の `parsed.in` は `NOT IN` の中の `IN (...)` も拾うため、IN フェーズで**肯定の IN として再フィルタされ、結果が反転**します。

- 関数後半の正規表現ベースの分岐（`NOT IN`、`BETWEEN`、`true/false` リテラル、集約比較など。[condition-util.js:231-397](../assets/js/sql/util/condition-util.js#L231-L397)）は、try 内で必ず return するため例外時以外は**到達しないデッドコード**です。
- **派生不具合**: 非相関 `EXISTS` は WHERE を `'true'` / `'false'` に置換します（[sql-parser.js:417](../assets/js/sql/sql-parser.js#L417)）。しかし `true` は IDENT として列参照扱いになり undefined → false と評価されるので、**`EXISTS (...)` は常に0件**になります。
- その他: 負数リテラル（`-1`）は `-` が不明トークンになり評価できない。`IS NOT NULL` 以外の `NOT` 後置にはすべて同じ問題がある。
- **修正案**: `parsePrimary` で IDENT の後に `NOT` を受け付け、`IN`/`LIKE`/`BETWEEN` の否定に対応する。`TRUE`/`FALSE` をキーワード化し、単項マイナスにも対応する。デッドコードは削除する。

---

## 2. 不具合（P1: 機能不全）

| # | 内容 | 場所 | 確度 |
|---|---|---|---|
| P1-1 | **ヒント購入後に本文が出ない**。`showHintModal` に生の `floorData.hint`（初級は `true`、チュートリアルは `undefined`）を渡しており、i18n の `dungeon.*.floorN.hint` を使っていない。モーダルに「true」と表示される | [hint.js:8](../assets/js/ui/hint.js#L8) | 確定 |
| P1-2 | ヒント購入済みかどうかを**フロアのインデックス**で管理しているため、ダンジョンを跨ぐと購入済み扱いが別フロアに引き継がれる。また `loadGame` 後はヒントボタンが常に非表示になる | [hint.js:7](../assets/js/ui/hint.js#L7), [game-state.js](../assets/js/core/game-state.js) | 確定 |
| P1-3 | 消費アイテム（`consumableItems`）が一度も消費されない。`useConsumableItem` の呼び出し元が存在しない | [player.js](../assets/js/models/player.js) | 確定 |
| P1-4 | `ORDER BY e.price` が列 `e` として扱われ、ソートされない（`(\w+)` が `.` の前で止まる）。複数キーで、最初の列以外の ASC/DESC も正規表現の構造上取りこぼす場合がある | [sql-parser.js:793-808](../assets/js/sql/sql-parser.js#L793-L808) | 確定 |
| P1-5 | 集約関数がテーブル修飾を無視する。`COUNT(fruits2.id)` は末尾 `id` で最初に一致したキー（`colors.id`）を数えるため、LEFT JOIN で該当なしのグループが 0 ではなく 1 になる（チュートリアル14階は誤った SQL 知識を教える） | [count-function.js](../assets/js/sql/aggregate/count-function.js) ほか SUM/AVG/MIN/MAX | 確定 |
| P1-6 | `LIMIT` 未対応。チュートリアル15階の answer は LIMIT 3 だが無視されるため、LIMIT を書かなくても正解になる | [sql-parser.js `parseSQL`](../assets/js/sql/sql-parser.js#L736) | 確定 |
| P1-7 | Service Worker のプリキャッシュに存在しない `fruits.json`（実ファイル名は `fruit.json`）が含まれている。`cache.addAll` はアトミックなので**全体が失敗**し、`catch(() => {})` で握り潰される。結果としてオフライン用キャッシュが作られない。フォールバックの `'/index.html'` は絶対パスなので、GitHub Pages のサブパス（`/sql-dungeons/`）で外れる | [sw.js:10](../sw.js#L10), [sw.js:90](../sw.js#L90) | 確定 |
| P1-8 | 更新チェックが機能しない。`version.json` を2回取得して比較しているが、SW はネットワーク優先なので両方とも最新が返り、常に等しくなる。更新ダイアログが日本語の直書き。`location.reload(true)` は非推奨 | [main.js:87-112](../assets/js/main.js#L87-L112) | 確定 |
| P1-9 | `SelectClause.apply` で `const countOpen/countClose` に再代入している。括弧やクォートの対応が崩れた列指定（例: 奇数個の `'` を含む文字列リテラル）で `TypeError` になり、emulate 全体が `[]` を返す | [select-clause.js:27-37](../assets/js/sql/clause/select-clause.js#L27-L37) | 確定 |

### その他のSQLエンジン不具合（P1〜P2）
- **複数行クエリ**: `whereMatch` / `havingMatch` の `.` が改行にマッチしないため、WHERE を改行して書くと条件が途中で切れる（[sql-parser.js:791](../assets/js/sql/sql-parser.js#L791)）。
- **句境界の誤認**: `where` / `order by` などに `\b` が無いので、`somewhere` のような識別子や文字列リテラル内の単語でも句として切り出される。
- **UNION 分割**: サブクエリや文字列内の `union` でも分割される（[sql-parser.js:748](../assets/js/sql/sql-parser.js#L748)）。
- **HAVING**: `SUM|COUNT|AVG` しか対応せず、`MAX/MIN`、`<>`/`!=`、`AND` を含む条件では**フィルタせず全行を返す**（P0-3 修正後に表面化する）。
- **GROUP BY 結果**: キーを `'||'` で連結して分割し直すため、値が文字列化される（数値の型が失われる）。値に `||` を含む場合や NULL の場合に壊れる。
- **`_validateJoinQuery`**: テンプレート文字列内の `\s` が `s` になり、正規表現が壊れている（[sql-parser.js:939-941](../assets/js/sql/sql-parser.js#L939-L941)）。ただし answer があるフロアでは呼ばれないためデッドコード。
- **未定義参照**: `getFallbackClauseClasses` は未定義（typeof ガードにより実害なし）。
- **INSERT**: 値に `,` や `)` を含むと分割が壊れる。結果は返すが DB は変更しない（仕様として明記が必要）。

---

## 3. 不具合・改善（P2: 品質・UX）

### ゲーム進行・経済
- **エネルギーを先に消費する**: [query-executor.js:24-43](../assets/js/ui/query-executor.js#L24-L43) で消費した後に `validateQuery`（未習得呪文チェック）が走るため、未習得の呪文によるエラーや空クエリ以外の入力ミスでもエネルギーが減る。チェックを先に行うべき。
- **ソフトロック**: エネルギー 0 かつゴールドがショップ最安値（50G）未満になると詰む。ショップは `opensShop` のフロアをクリアしないと開かない。救済策（タイトルに戻る以外）が無い。
- **セーブ時の legacy 正規化**: [game-state.js:44-53](../assets/js/core/game-state.js#L44-L53) で `currentFloor` を設定する**前**に `saveGame()` を呼ぶため、旧形式のセーブを読み込むと現在フロアが 0 で上書き保存される。さらに `Player.fromJSON` は `"floor:N"` を数値に変換しないので、正規化自体が行われていない。
- **ダンジョン順序のハードコード**: `advanceToNextDungeon` は `['tutorial','beginner']` に固定されている（[game-lifecycle.js:332](../assets/js/core/game-lifecycle.js#L332)）。dungeons/manifest.json の順序を使うべき。
- **セーブのインポート**: スキーマを検証しないため、不正な JSON でも `localStorage` を上書きする。`loadGame` は async なのに await していない。

### i18n
- 直書き文言: `句ネクスト (x..)`（[game-lifecycle.js:385](../assets/js/core/game-lifecycle.js#L385)）、`'不明'`、更新確認ダイアログ、`diagnoseEmptyResult` のテーブル不存在メッセージ、セーブのインポート/エクスポート関連メッセージ一式。README の開発方針に反する。
- 言語ファイルの欠落（ja_jp を基準に比較）:
  - en_us: `ui.energy/execute/gold/save`, `dungeon.beginner.floor1.story/hint` が無い
  - ko_kr: `confirm.unsaved_changes`, `ui.*` が無い
  - zh_cn: **48キー不足**（`button.*` のほぼ全部、チュートリアル6〜15階）。また旧形式の `dungeon.floorN.*` が残っている
- `index.html` / `en.html` / `ko.html` / `zh.html` がほぼ同一内容の4重複で、差分（manifest リンク、設定ボタン、aria-label など）が既にずれ始めている。

### セキュリティ（低）
- `showResult` は `innerHTML` で描画する（[dom-manager.js:484](../assets/js/ui/dom-manager.js#L484)）。タイプミス補正メッセージや属性名エラーにはユーザー入力が混ざるため、self-XSS が成立する。`textContent` と `<br>` 要素による組み立てに変えるべき。結果テーブルは `textContent` なので問題ない。

### パフォーマンス・ログ
- `SQLParser.DEBUG = true` が本番でも有効。行ごとに `console.debug` を出す（`_getColumnValue` は**1セルごと**）。`parseSQL` と window 関数には DEBUG ガードの無い console 出力もある。
- `getCurrentMockDatabase()` は呼ばれるたびに DB をマージし直す。1回のクエリ実行で3〜4回呼ばれる。フロア単位でキャッシュできる。
- JOIN は単純なネストループで、結合条件を毎回トークナイズしている（データ量が小さいので現状は許容範囲）。

### ドキュメント
- README のディレクトリ構成に `users.json` とあるが、実ファイルは `user2.json`。テーブル名の重複処理の例も実態と合っていない。
- `mock-database.json`（旧統合DB）はフォールバック専用になったが、新しい分割DBとテーブル構成が食い違っている（`users2` / `usertypes` 等）。

---

## 4. 設計改善の提案

### 4-1. SQLエンジンを「字句解析 → 構文解析(AST) → 実行」に作り直す（最重要）
現在は句ごとに独立した正規表現でクエリ全体から部分文字列を抜き出しています。P0-4/P0-6、複数行、`\b` 抜け、UNION の分割誤り、ORDER BY の修飾列は、すべてこの構造に起因します。

- トークナイザは [condition-util.js](../assets/js/sql/util/condition-util.js) に既に原型があります。これを SQL 全体に広げ、再帰下降パーサで `SelectStatement { columns, from, joins, where(Expr), groupBy, having(Expr), orderBy, limit }` という AST を作ります。
- 式評価（WHERE / HAVING / ON / CASE / SELECT 式）を **1つの Expr 評価器**に統一します。いまは `evaluateCondition`、`HavingClause` の独自正規表現、`SelectClause` 内の COALESCE / CASE 独自処理の3系統に分かれています。
- サブクエリは AST のノードとして保持し、文字列置換（`parsed.where = ...`）を廃止します。相関サブクエリは外側の行をスコープとして渡します。
- 列解決は「エイリアス/テーブル名 → 列」のスコープ解決を1か所にまとめ、`endsWith('.'+col)` による曖昧マッチは廃止します（P1-5 の根本原因）。曖昧な列は SQL と同様にエラーにします。

### 4-2. 実行結果の型を `Result` にする
`emulate` が `[]` を「エラー」と「0件」の両方の意味で返すことが P0-5 の原因です。`{ ok: true, columns, rows } | { ok: false, error: { code, message } }` を返すようにすれば、`diagnoseEmptyResult` の推測ロジックも不要になり、エラーメッセージ（i18n キー）をパーサが直接返せます。

### 4-3. データ駆動のテストと検証を導入する
- `node --test` などで、**全フロアの answer を実行して非空になること・参照テーブルが存在すること**を CI で検証します。これだけで P0-2/P0-4 は検出できていました。
- SQL エンジン単体のテーブル駆動テスト（クエリ → 期待結果）を用意し、本物の SQLite（`sql.js` 等）の結果と突き合わせます。
- i18n キーの欠落チェック（本調査で用いた比較処理）も CI に入れます。

### 4-4. Registry の役割を見直す
- 句の実行順序が「Registry に何が登録されているか」と、ソート用のハードコード配列の両方に依存しており、`IN`/`INNER JOIN`/`UNION` など**実行されないのに登録されている句**が混在しています。実行順序はエンジン側で固定し、Registry は「呪文（学習要素）のメタ情報: keyword・説明・必要アイテム」に限定するのが自然です。
- 登録時に型を検証する（P0-3 の再発防止）。

### 4-5. 呪文（使用可能構文）の判定を AST ベースにする
`validateQuery` は Registry の keyword を単語分割して照合しています。しかし HAVING は機能していない（P0-3）、COUNT/SUM などの集約関数や LIKE / BETWEEN / LIMIT / LEFT JOIN は判定対象外、`borrowed` には `"LEFT JOIN"` という複合語と `"GROUP","BY"` という分割語が混在、といった問題があります。AST から使用構文の集合を取り出し、フロア定義の `borrowed` と統一した識別子（例: `GROUP_BY`, `LEFT_JOIN`, `FN_COUNT`）で照合する方式にします。

### 4-6. 状態管理と UI の分離
- `GameCore` は委譲メソッドが大半で、実処理は `GameLifecycle` / `GameState` / `query-executor` に散っています。`window.game` によるグローバル公開や、`dom.elements[...]` を各所で直接操作している点も含め、「状態（Player, 進行）→ イベント → View 更新」の一方向フローにすると、P0-1 のような判定の食い違いが起きにくくなります。
- クリア済みフロアのキーは `"<dungeon>:<floor>"` に統一します。いまは数値のみなので、ダンジョンを跨いだ衝突を避けるために `advanceToNextDungeon` で `clearedFloors` を全消去しており、前のダンジョンへ戻るとクリア状況が失われます。ヒント購入状況（P1-2）も同じキーで管理します。
- セーブデータに `version` を持たせ、マイグレーション関数を用意します。

### 4-7. 静的ファイル構成
- 言語別 HTML の4重複は、`index.html?lang=en` と i18n 適用で1枚にまとめられます（SEO 用に残すならビルド時に生成）。
- SW のプリキャッシュ一覧は手書きをやめ、ビルドスクリプトで生成するか、manifest.json 群から導出します。キャッシュ名にバージョンを含め、`activate` で古いキャッシュを削除します。

---

## 5. 推奨対応順

1. **即日（1行〜数行の修正）**: P0-1（`isCleared` 判定）、P0-3（HAVING の default export）、P1-1（ヒントに `getHint` を使う）、P1-7（`fruit.json` と相対パス）、P1-9（`const` → `let`）、`SQLParser.DEBUG = false`
2. **データ修正**: P0-2（チュートリアル11〜15階の `databases`、13階のテーブル名）
3. **エンジン局所修正**: P0-4（IN フェーズ廃止）、P0-5（エラーと空結果の区別）、P0-6（NOT 後置・TRUE/FALSE）、P1-4、P1-5、P1-6（LIMIT）
4. **テスト基盤**: §4-3 を導入し、3. の修正を回帰テストで固める
5. **中期**: §4-1（AST 化）→ §4-5（構文判定）→ §4-6（状態管理）
