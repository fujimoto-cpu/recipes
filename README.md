# レシピ図書館（プロトタイプ）

Obsidian Vaultに保存したレシピ（Instagram/Threads/YouTube由来）を画像・動画つきで一覧・検索できるサイト。

🌐 **公開URL**: https://fujimoto-cpu.github.io/recipes/

## 機能

- カード一覧（画像・動画サムネ＋料理名＋kcalバッジ、低/中/高で色分け）
- 食材チップでの絞り込み（複数選択可・よく出る食材だけ最初に表示＋もっと見るで展開）
- カロリー順（低→高）ソート
- カードクリックで詳細（材料・手順・カロリー・元投稿リンク）
- 買い物リスト（複数レシピの材料をブラウザ内でまとめてコピーできる。ブラウザのlocalStorageに保存・端末内のみ）

## データ

`data.json` は `build.py` が Obsidian Vault の LiteratureNote を**自動スキャン**して生成する。frontmatterに `dish_name` があるノートを自動検出するので、`wiki-ingest` が新しいレシピを構造化するたびに対象へ増える（ファイルリストの手動編集は不要）。

```bash
python3 build.py
```

カロリーはキャプションに明記されているもののみ採用（推測で埋めない）。41件中、実際にkcalが明記されていたのは8件のみ（正直に反映）。

## 自動更新パイプライン

`sns-save`（レシピ保存）→ `wiki-ingest`（🛒材料/dish_name構造化）→ `/recipe-site`（このビルド＋git push）が夜間バッチ（`nightly-vault-build`）から自動で回る。手動更新したい時も `Skill /recipe-site` または `python3 build.py && git add -A && git commit -m "update" && git push` でOK。

## 買い物リストの今後（Notion連携について）

Vault内に「レシピ・買い物リストを連携して管理する」というNotionテンプレートのメモがあるが、これは**他の人のテンプレート紹介記事のブックマーク**で、ゆりこ自身の買い物リストDBではない。実際にNotionへ書き込む連携をするなら、対象のNotionデータベースをまず指定してもらう必要がある（無いものを勝手に作らない）。それまでの間はブラウザ内カート＋コピペで運用。

## 今後の拡張候補

- 残り分の新規レシピノートへの継続取り込み（自動）
- Notion買い物リストDBが決まったら直接連携
- 週次献立プランナー・実食ログ連携
