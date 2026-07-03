#!/usr/bin/env python3
"""
Repair image URLs for jewelry products imported from the bulk jewelry CSV.

Default mode is dry-run. Add --commit to copy images into /uploads and update
the products.images JSON field. This script does not change stock, price,
description, category, or any product text.
"""

import argparse
import csv
import datetime as dt
import hashlib
import json
import shutil
import sqlite3
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DEFAULT_DB = BASE_DIR / "ecommerce.db"
DEFAULT_CSV = BASE_DIR / "import_data" / "jewelry_products_import.csv"
DEFAULT_IMAGE_DIR = BASE_DIR / "import_data" / "jewelry_images"
DEFAULT_UPLOAD_DIR = PROJECT_DIR / "uploads"
SAFE_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PRODUCT_NAME_ALIASES = {
    "Golden Figaro Link Bracelet": ["Golden Figaro Link Vracelet"],
}


def clean_text(value, limit=None):
    text = "" if value is None else str(value).strip()
    if limit and len(text) > limit:
        return text[:limit].strip()
    return text


def slugify(value):
    out = []
    last_dash = False
    for ch in value.lower():
        if ch.isalnum():
            out.append(ch)
            last_dash = False
        elif not last_dash:
            out.append("-")
            last_dash = True
    return "".join(out).strip("-") or "product"


def read_csv_rows(csv_path, image_dir):
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")
    if not image_dir.exists():
        raise FileNotFoundError(f"Image folder not found: {image_dir}")

    rows = []
    errors = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        required = {"name", "image_1", "image_2", "image_3"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV is missing columns: {', '.join(sorted(missing))}")

        for idx, row in enumerate(reader, start=1):
            row_number = clean_text(row.get("row_number")) or str(idx + 1)
            name = clean_text(row.get("name"), 160)
            if not name:
                errors.append(f"Row {row_number}: product name is missing")
                continue

            image_files = []
            for field in ("image_1", "image_2", "image_3"):
                image_name = clean_text(row.get(field))
                if not image_name:
                    continue
                src = image_dir / image_name
                if src.suffix.lower() not in SAFE_IMAGE_EXTENSIONS:
                    errors.append(f"Row {row_number}: unsafe image type: {image_name}")
                    continue
                if not src.exists():
                    errors.append(f"Row {row_number}: image not found: {image_name}")
                    continue
                image_files.append(src)

            if not image_files:
                errors.append(f"Row {row_number}: no valid images found for {name}")
                continue

            rows.append({
                "index": idx,
                "row_number": row_number,
                "name": name,
                "image_files": image_files,
            })

    if errors:
        raise ValueError("\n".join(errors))
    return rows


def backup_database(db_path):
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"before_jewelry_image_repair_{stamp}.db"
    shutil.copy2(db_path, backup_path)
    return backup_path


def make_upload_name(row_index, product_name, image_index, src):
    seed = f"jewelry:{row_index}:{product_name}:{image_index}:{src.name}".encode("utf-8")
    return f"{hashlib.sha256(seed).hexdigest()[:32]}{src.suffix.lower()}"


def copy_or_reuse(src, target):
    if not target.exists():
        shutil.copy2(src, target)
    return f"/uploads/{target.name}"


def find_product(db, name):
    names_to_try = [name] + PRODUCT_NAME_ALIASES.get(name, [])
    for candidate in names_to_try:
        product = db.execute(
            "SELECT id,name,images FROM products WHERE lower(name)=lower(?) LIMIT 1",
            (candidate,),
        ).fetchone()
        if product:
            return product
    return None


def run(args):
    db_path = Path(args.db).resolve()
    csv_path = Path(args.csv).resolve()
    image_dir = Path(args.image_dir).resolve()
    upload_dir = Path(args.upload_dir).resolve()
    commit = bool(args.commit)

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    rows = read_csv_rows(csv_path, image_dir)
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row

    try:
        matched = []
        missing_products = []
        for row in rows:
            product = find_product(db, row["name"])
            if not product:
                missing_products.append(row["name"])
                continue
            matched.append((row, product))

        print("=" * 72)
        print("Jewelry image repair")
        print("=" * 72)
        print(f"Mode: {'COMMIT' if commit else 'DRY RUN'}")
        print(f"CSV: {csv_path}")
        print(f"Images: {image_dir}")
        print(f"Database: {db_path}")
        print(f"Upload folder: {upload_dir}")
        print(f"CSV products: {len(rows)}")
        print(f"Matched existing products: {len(matched)}")
        print(f"Missing products: {len(missing_products)}")
        print("")

        if missing_products:
            print("Products not found:")
            for name in missing_products:
                print(f"  - {name}")
            print("")

        for row, product in matched:
            current_images = []
            try:
                current_images = json.loads(product["images"] or "[]")
            except Exception:
                current_images = []
            print(
                f"  - {row['name']} | current images {len(current_images)} "
                f"| repair images {len(row['image_files'])}"
            )

        if not commit:
            print("")
            print("Dry run complete. No database or image files were changed.")
            print("Run again with --commit to copy images and update products.")
            return 0

        backup_path = backup_database(db_path)
        upload_dir.mkdir(parents=True, exist_ok=True)
        updated = 0
        copied_or_reused = 0

        for row, product in matched:
            image_urls = []
            for image_index, src in enumerate(row["image_files"], start=1):
                target_name = make_upload_name(row["index"], row["name"], image_index, src)
                target = upload_dir / target_name
                image_urls.append(copy_or_reuse(src, target))
                copied_or_reused += 1

            db.execute(
                "UPDATE products SET images=? WHERE id=?",
                (json.dumps(image_urls), product["id"]),
            )
            updated += 1

        db.commit()
        print("")
        print(f"Backup created: {backup_path}")
        print(f"Products updated: {updated}")
        print(f"Image files copied/reused: {copied_or_reused}")
        print("Done.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Repair jewelry product image URLs.")
    parser.add_argument("--commit", action="store_true", help="Actually copy images and update products.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to ecommerce.db")
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="Path to jewelry import CSV")
    parser.add_argument("--image-dir", default=str(DEFAULT_IMAGE_DIR), help="Folder containing jewelry images")
    parser.add_argument("--upload-dir", default=str(DEFAULT_UPLOAD_DIR), help="Website uploads folder")
    args = parser.parse_args()

    try:
        return run(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
