#!/usr/bin/env python3
"""Optimize oversized product upload images.

Default mode is a dry run. With --commit, the script creates new optimized WebP
files for product images larger than the threshold and updates products.images
to reference the new files. Original files are kept unless --delete-originals is
also provided.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
DB_PATH = SERVER_DIR / "ecommerce.db"
UPLOADS_DIR = ROOT / "uploads"


def size_label(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / 1024:.0f} KB"


def load_images(value: str) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def unique_webp_path() -> Path:
    for _ in range(100):
        path = UPLOADS_DIR / f"{secrets.token_hex(16)}.webp"
        if not path.exists():
            return path
    raise RuntimeError("Could not allocate an output filename")


def optimize_one(src: Path, max_side: int, quality: int) -> tuple[Path, int, int, tuple[int, int]]:
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise RuntimeError("Pillow is required. Install pillow or run this on PythonAnywhere if it is installed.") from exc

    with Image.open(src) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        if max(image.size) > max_side:
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        out = unique_webp_path()
        image.save(out, "WEBP", quality=quality, method=6)
        return out, src.stat().st_size, out.stat().st_size, image.size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Actually write optimized files and update products.images")
    parser.add_argument("--delete-originals", action="store_true", help="Delete old files after successful DB update")
    parser.add_argument("--threshold-kb", type=int, default=900)
    parser.add_argument("--max-side", type=int, default=1400)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"FAIL database not found: {DB_PATH}")
        return 1
    if not UPLOADS_DIR.exists():
        print(f"FAIL uploads folder not found: {UPLOADS_DIR}")
        return 1

    threshold = max(100, args.threshold_kb) * 1024
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT id,name,images FROM products WHERE IFNULL(is_active,1)=1 ORDER BY name"
    ).fetchall()

    planned = []
    for row in rows:
        images = load_images(row["images"])
        for idx, url in enumerate(images):
            if not isinstance(url, str) or not url.startswith("/uploads/"):
                continue
            src = UPLOADS_DIR / os.path.basename(url)
            if not src.exists() or not src.is_file():
                continue
            size = src.stat().st_size
            if size > threshold:
                planned.append({"row": row, "images": images, "index": idx, "src": src, "url": url, "size": size})

    print("Product image optimizer")
    print("=" * 72)
    print("Mode:", "COMMIT" if args.commit else "DRY RUN")
    print("Threshold:", size_label(threshold))
    print("Oversized product image references:", len(planned))
    for item in planned[:30]:
        print(f"- {item['row']['name']} | {item['url']} | {size_label(item['size'])}")
    if len(planned) > 30:
        print(f"... and {len(planned) - 30} more")

    if not args.commit:
        print("Dry run complete. Re-run with --commit to optimize and update product image references.")
        return 0

    replacements_by_product: dict[str, list[tuple[int, str, Path, Path, int, int]]] = {}
    total_before = 0
    total_after = 0
    for item in planned:
        out, before, after, dims = optimize_one(item["src"], args.max_side, args.quality)
        new_url = f"/uploads/{out.name}"
        replacements_by_product.setdefault(item["row"]["id"], []).append(
            (item["index"], new_url, item["src"], out, before, after)
        )
        total_before += before
        total_after += after
        print(f"OPT {item['row']['name']} -> {new_url} {size_label(before)} to {size_label(after)} ({dims[0]}x{dims[1]})")

    for row in rows:
        reps = replacements_by_product.get(row["id"])
        if not reps:
            continue
        images = load_images(row["images"])
        for idx, new_url, *_rest in reps:
            if 0 <= idx < len(images):
                images[idx] = new_url
        db.execute("UPDATE products SET images=? WHERE id=?", (json.dumps(images), row["id"]))

    db.commit()

    if args.delete_originals:
        for reps in replacements_by_product.values():
            for _idx, _new_url, src, _out, _before, _after in reps:
                try:
                    src.unlink()
                except OSError:
                    pass

    print("=" * 72)
    print(f"Updated products: {len(replacements_by_product)}")
    print(f"Before: {size_label(total_before)}")
    print(f"After:  {size_label(total_after)}")
    if total_before:
        print(f"Saved:  {size_label(total_before - total_after)} ({(1 - total_after / total_before) * 100:.1f}%)")
    print("PASS: image optimization complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
