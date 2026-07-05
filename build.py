#!/usr/bin/env python3
import re
import json
import shutil
import hashlib
import unicodedata
from pathlib import Path

import yaml

VAULT = Path("/Users/yuriko/Documents/corin")
LIT = VAULT / "20_📂 zettelkasten" / "LiteratureNote"
ASSETS = Path(__file__).parent / "assets"

# Auto-discovery: any LiteratureNote whose frontmatter has been structured
# with `dish_name` (CORIN / wiki-ingest's recipe format marker) is picked up
# automatically. This is what makes "save a recipe -> site updates itself"
# possible without hand-editing a file list each time.
# See .claude/skills/wiki-ingest/SKILL.md (recipe format) and
# .claude/skills/recipe-site/SKILL.md (this build + publish step) in the
# corin vault for how new recipes flow in.
def discover_recipe_files():
    names = []
    for path in sorted(LIT.glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        fm, _ = parse_frontmatter(text)
        if fm.get("dish_name"):
            names.append(path.name)
    return names

EMBED_RE = re.compile(r"!\[\[(.+?)\]\]")
YT_ID_RE = re.compile(r"(?:v=|youtu\.be/)([\w-]+)")
STEPS_HEADER_RE = re.compile(r"^>\s*\[![\w-]+\][+-]?\s*.*手順")
NUM_ITEM_RE = re.compile(r"^\d+\.\s*(.+)$")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
LOOSE_STEP_RE = re.compile(r"^[" + CIRCLED + r"]\s*(.+)$|^\d+[.．]\s*(.+)$")
TRANSCRIPT_HEADER_RE = re.compile(r"文字起こし")


def parse_frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not m:
        return {}, text
    fm = yaml.safe_load(m.group(1)) or {}
    return fm, m.group(2)


def find_embed(body):
    m = EMBED_RE.search(body)
    return m.group(1) if m else None


def slugify_id(name):
    # Normalize first: macOS/APFS glob() can return NFD-decomposed Japanese
    # filenames while a hand-typed string literal is NFC, and those hash
    # differently even though they're "the same" filename on disk.
    normalized = unicodedata.normalize("NFC", name)
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:10]


def extract_steps(body):
    lines = body.split("\n")
    steps = []
    in_block = False
    for line in lines:
        if STEPS_HEADER_RE.match(line.strip()):
            in_block = True
            continue
        if in_block:
            if not line.startswith(">"):
                break
            content = line.lstrip(">").strip()
            m = NUM_ITEM_RE.match(content)
            if m:
                steps.append(m.group(1).strip())
            elif content == "":
                break
    if steps:
        return steps

    # Fallback: some captions list steps as loose numbered/circled lines
    # (①②③... or "1. ") outside of a callout block. Skip transcript quotes.
    in_transcript = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(">") and TRANSCRIPT_HEADER_RE.search(stripped):
            in_transcript = True
            continue
        if in_transcript:
            if stripped.startswith(">"):
                continue
            in_transcript = False
        m = LOOSE_STEP_RE.match(stripped)
        if m:
            steps.append((m.group(1) or m.group(2)).strip())
    return steps


def extract_caption(body):
    m = re.search(r"##\s*📝\s*(?:キャプション|投稿内容)\s*\n(.*?)(?:\n##|\Z)", body, re.DOTALL)
    if not m:
        return ""
    text = m.group(1).strip()
    lines = [l for l in text.split("\n") if not l.strip().startswith("#")]
    text = " ".join(l.strip() for l in lines if l.strip())
    return text[:150]


def resolve_source(fm, body=""):
    source = fm.get("source", "unknown")
    url = fm.get("url", "")
    if not url:
        m = re.search(r"https://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)[\w-]+", body)
        if m:
            url = m.group(0)
    if "youtube.com" in url or "youtu.be" in url:
        source = "youtube"
    elif source == "threads":
        source = "threads"
    elif source == "instagram":
        source = "instagram"
    handle = fm.get("username") or fm.get("channel") or fm.get("author") or ""
    return {"type": source, "url": url, "handle": handle}


def resolve_vault_path(embed_path):
    """Obsidian allows bare-filename wikilinks that resolve via vault-wide
    index; we don't have that index, so fall back to a filename search."""
    direct = VAULT / embed_path
    if direct.exists():
        return direct
    basename = Path(embed_path).name
    matches = list(VAULT.rglob(basename))
    return matches[0] if matches else None


def build_media(embed_path, source_info, rid, body=""):
    if embed_path:
        src = resolve_vault_path(embed_path)
        if src is not None:
            ext = src.suffix
            dest_name = f"{rid}{ext}"
            shutil.copy2(src, ASSETS / dest_name)
            mtype = "video" if ext.lower() in (".mp4", ".mov") else "image"
            return {"type": mtype, "file": f"assets/{dest_name}"}
    yt_source = source_info["url"] if source_info["type"] == "youtube" else body
    m = YT_ID_RE.search(yt_source)
    if m:
        yid = m.group(1)
        return {"type": "youtube", "thumb": f"https://img.youtube.com/vi/{yid}/hqdefault.jpg", "youtube_id": yid}
    return {"type": "none", "file": None}


def main():
    ASSETS.mkdir(exist_ok=True)
    recipes = []
    for fname in discover_recipe_files():
        path = LIT / fname
        text = path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)

        rid = slugify_id(fname)
        source_info = resolve_source(fm, body)
        embed_path = find_embed(body)
        media = build_media(embed_path, source_info, rid, body)

        recipes.append({
            "id": rid,
            "title": fm.get("dish_name", fname.replace(".md", "")),
            "source": source_info,
            "media": media,
            "ingredients": fm.get("ingredients", []) or [],
            "tags": fm.get("tags", []) or [],
            "nutrition": fm.get("nutrition"),
            "steps": extract_steps(body),
            "caption_excerpt": extract_caption(body),
        })

    out = Path(__file__).parent / "data.json"
    out.write_text(json.dumps(recipes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(recipes)} recipes to {out}")
    for r in recipes:
        print(f"  - {r['title']}: media={r['media']['type']}, ingredients={len(r['ingredients'])}, steps={len(r['steps'])}, kcal={r['nutrition']}")


if __name__ == "__main__":
    main()
