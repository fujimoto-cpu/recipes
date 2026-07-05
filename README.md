# レシピ図書館（プロトタイプ）

Obsidian Vaultに保存したレシピ（Instagram/Threads/YouTube由来）を画像・動画つきで一覧・検索できるサイト。

🌐 **公開URL**: https://fujimoto-cpu.github.io/recipes/

## 機能

- カード一覧（画像・動画サムネ＋料理名＋kcalバッジ）
- 食材チップでの絞り込み（複数選択可）
- カロリー順（低→高）ソート
- カードクリックで詳細（材料・手順・カロリー・元投稿リンク）

## データ

`data.json` は `build.py` が Obsidian Vault の LiteratureNote（frontmatterに `dish_name` / `ingredients` / `nutrition` を構造化済みのもの）から生成する。

```bash
python3 build.py
```

現在はプロトタイプとして10件のみ対象。カロリーはキャプションに明記されているもののみ採用（推測で埋めない）。

## 今後の拡張候補

- 残り約66件のレシピノートへの横展開
- `sns-save` → `wiki-ingest` → このビルドの自動連鎖化
- 買い物リスト連携・週次献立プランナー
