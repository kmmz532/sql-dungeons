# SQLダンジョン
SQLを学習するためのRPG風ゲームです。<br>
Webブラウザで動作します。バックエンドは不要です。

## 操作方法


## デバッグ
サンドボックスモードで`SELECT DEBUG PANEL`を実行すると、デバッグ用ページに遷移します。

## ディレクトリ構成
```
assets/js/
  constants.js         # 定数
  main.js              # エントリポイント
  core/                # ゲーム、状態管理（GameCoreなど）
  models/              # ドメインモデル（Item, Player, Floorなど）
  sql/                 # SQL関係
  ui/                  # UI操作・UIイベント・UI部品
  data/                # データローダーなど
  lang/                # i18n関係
assets/lang/           # 言語ファイル（ja_jp.json, en_us.jsonなど）
assets/data/           # ゲームデータ（dungeon-data.json, shop-items.jsonなど）
```

## 拡張について
- すべてのモデル（Item, Floor, SQLClauseなど）はクラス
- 各モデルは`getName({locale})`や`getTitle({locale})`等、i18n、言語取得メソッドを持つ
- 新しいアイテム、呪文、フロア、UI部品は「新クラス/ファイル追加」で容易に拡張
- UIテキストはi18n経由で取得し、JSONに追加するだけで多言語化
- SQLバリデーション・エミュレーションもクラス/メソッド追加で拡張

## 追加・拡張の手順例
### アイテムを追加する場合
1. `models/item.js`でクラスを定義（必要であれば継承する）
2. `assets/data/shop-items.json`などにデータ追加
3. `assets/lang/ja_jp.json`などにi18nキー（`item.sqldungeons.{id}`）を追加

### 新しいSQL句や呪文を追加する場合
1. `sql/sql-clause.js`で新クラスやインスタンスを追加
2. `assets/lang/ja_jp.json`等に`sql.keyword.{keyword}`や説明文を追加

### 新しいUI部品や画面を追加する場合
1. `ui/`配下に新ファイル・クラスを追加
2. 必要に応じて`main.js`や`core/game-core.js`で利用

### 多言語文言を追加・修正する場合
1. `assets/lang/`配下の各JSONにキーを追加・修正
2. コード側は`i18n.t('key')`で取得

## i18nの使い方
- `window.i18n`で現在のI18nインスタンスにアクセス (クラス内、引数にI18nインスタンスが存在するのであればそれを使うこと)
- 例: `item.getName({locale: 'en_us'})` で英名を取得
- 例: `i18n.t('message.save_success')` でメッセージ取得

## 開発方針
- 原則、直書きメッセージをせず、assets/lang/*.jsonの言語をi18n経由で取得すること

---

## 開発・拡張のヒント
- 主要な拡張ポイントはすべてクラス/メソッド/ファイル単位で独立
- テストやモックも`tests/`や`mock/`配下で管理可能な構成
- READMEや各ファイルのJSDocを参考に、安心して拡張・修正してください
