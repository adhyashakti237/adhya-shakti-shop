#!/usr/bin/env python3
"""
One-time jewelry product importer for Adhya Shakti Shop.

Default mode is dry-run. It validates the CSV and images without changing the
database. Add --commit to create products and copy images.
"""

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import uuid
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DEFAULT_DB = BASE_DIR / "ecommerce.db"
DEFAULT_CSV = BASE_DIR / "import_data" / "jewelry_products_import.csv"
DEFAULT_IMAGE_DIR = BASE_DIR / "import_data" / "jewelry_images"
DEFAULT_UPLOAD_DIR = PROJECT_DIR / "uploads"
SAFE_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


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
    slug = "".join(out).strip("-")
    return slug or "product"


def parse_money(value, field, row_number, required=False):
    text = clean_text(value)
    if not text:
        if required:
            raise ValueError(f"Row {row_number}: {field} is required")
        return None
    try:
        amount = float(text)
    except ValueError as exc:
        raise ValueError(f"Row {row_number}: {field} must be a number") from exc
    if amount < 0 or (required and amount <= 0):
        raise ValueError(f"Row {row_number}: {field} must be greater than 0")
    return round(amount, 2)


def parse_stock(value, row_number):
    text = clean_text(value)
    if not text:
        return 0
    try:
        stock = int(float(text))
    except ValueError as exc:
        raise ValueError(f"Row {row_number}: stock must be a whole number") from exc
    if stock < 0:
        raise ValueError(f"Row {row_number}: stock cannot be negative")
    return stock


def parse_bool(value):
    text = clean_text(value).lower()
    return 1 if text in {"1", "true", "yes", "y", "best", "bestseller"} else 0


def read_rows(csv_path, image_dir):
    required = {"name", "price", "stock", "description", "image_1", "image_2", "image_3"}
    rows = []
    errors = []
    seen_names = set()

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")
    if not image_dir.exists():
        raise FileNotFoundError(f"Image folder not found: {image_dir}")

    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        missing_headers = required - set(reader.fieldnames or [])
        if missing_headers:
            raise ValueError(f"CSV is missing columns: {', '.join(sorted(missing_headers))}")

        for csv_row in reader:
            row_number = clean_text(csv_row.get("row_number")) or "?"
            try:
                name = clean_text(csv_row.get("name"), 160)
                if not name:
                    raise ValueError(f"Row {row_number}: name is required")
                name_key = name.casefold()
                if name_key in seen_names:
                    raise ValueError(f"Row {row_number}: duplicate product name in CSV: {name}")
                seen_names.add(name_key)

                price = parse_money(csv_row.get("price"), "price", row_number, required=True)
                compare_price = parse_money(csv_row.get("compare_price"), "compare_price", row_number)
                stock = parse_stock(csv_row.get("stock"), row_number)
                sku = clean_text(csv_row.get("sku"), 80)
                description = clean_text(csv_row.get("description"), 5000)
                is_bestseller = parse_bool(csv_row.get("is_bestseller"))
                image_files = []
                for field in ("image_1", "image_2", "image_3"):
                    image_name = clean_text(csv_row.get(field))
                    if not image_name:
                        continue
                    src = image_dir / image_name
                    if src.suffix.lower() not in SAFE_IMAGE_EXTENSIONS:
                        raise ValueError(f"Row {row_number}: unsafe image type: {image_name}")
                    if not src.exists():
                        raise ValueError(f"Row {row_number}: image not found: {image_name}")
                    image_files.append(src)

                rows.append({
                    "row_number": row_number,
                    "name": name,
                    "price": price,
                    "compare_price": compare_price,
                    "stock": stock,
                    "sku": sku,
                    "description": description,
                    "is_bestseller": is_bestseller,
                    "image_files": image_files,
                })
            except ValueError as exc:
                errors.append(str(exc))

    if errors:
        raise ValueError("\n".join(errors))
    return rows


def table_columns(db, table):
    return {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}


def find_or_create_category(db, category_name, commit):
    row = db.execute(
        """SELECT id FROM categories
           WHERE lower(name)=lower(?)
           ORDER BY CASE WHEN is_active=1 THEN 0 ELSE 1 END,
                    CASE WHEN kind='catalog' THEN 0 ELSE 1 END,
                    sort_order,
                    name
           LIMIT 1""",
        (category_name,),
    ).fetchone()
    if row:
        return row[0], False

    category_id = str(uuid.uuid4())
    if commit:
        cols = table_columns(db, "categories")
        values = {
            "id": category_id,
            "name": category_name,
            "description": "Jewelry products",
            "parent_id": None,
            "is_active": 1,
            "sort_order": 3,
            "kind": "catalog",
        }
        insert_cols = [c for c in values if c in cols]
        placeholders = ",".join("?" for _ in insert_cols)
        db.execute(
            f"INSERT INTO categories ({','.join(insert_cols)}) VALUES ({placeholders})",
            [values[c] for c in insert_cols],
        )
    return category_id, True


def existing_products(db):
    return {
        row["name"].casefold(): dict(row)
        for row in db.execute("SELECT id,name,stock FROM products").fetchall()
    }


def make_upload_name(row_index, product_name, image_index, src):
    seed = f"jewelry:{row_index}:{product_name}:{image_index}:{src.name}".encode("utf-8")
    return f"{hashlib.sha256(seed).hexdigest()[:32]}{src.suffix.lower()}"


def unique_upload_path(upload_dir, filename):
    target = upload_dir / filename
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    for idx in range(2, 1000):
        candidate = upload_dir / f"{stem}-{idx}{suffix}"
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Could not create unique upload filename for {filename}")


def backup_database(db_path):
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"before_jewelry_import_{stamp}.db"
    shutil.copy2(db_path, backup_path)
    return backup_path


def insert_product(db, product, category_id, image_urls):
    product_id = str(uuid.uuid4())
    cols = table_columns(db, "products")
    values = {
        "id": product_id,
        "name": product["name"],
        "description": product["description"],
        "price": product["price"],
        "compare_price": product["compare_price"],
        "category_id": category_id,
        "stock": product["stock"],
        "sku": product["sku"],
        "images": json.dumps(image_urls),
        "variations": json.dumps([]),
        "is_active": 1,
        "allow_custom_print": 0,
        "is_bestseller": product["is_bestseller"],
        "cost_price": 0,
        "low_stock_threshold": 5,
    }
    insert_cols = [c for c in values if c in cols]
    placeholders = ",".join("?" for _ in insert_cols)
    db.execute(
        f"INSERT INTO products ({','.join(insert_cols)}) VALUES ({placeholders})",
        [values[c] for c in insert_cols],
    )
    return product_id


def run_import(args):
    db_path = Path(args.db).resolve()
    csv_path = Path(args.csv).resolve()
    image_dir = Path(args.image_dir).resolve()
    upload_dir = Path(args.upload_dir).resolve()
    commit = bool(args.commit)

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    rows = read_rows(csv_path, image_dir)
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row

    try:
        category_id, category_created = find_or_create_category(db, args.category, commit)
        existing = existing_products(db)
        to_import = []
        skipped = []

        for row in rows:
            existing_row = existing.get(row["name"].casefold())
            if existing_row:
                skipped.append((row, existing_row))
            else:
                to_import.append(row)

        print("=" * 72)
        print("Jewelry bulk import")
        print("=" * 72)
        print(f"Mode: {'COMMIT' if commit else 'DRY RUN'}")
        print(f"CSV: {csv_path}")
        print(f"Images: {image_dir}")
        print(f"Database: {db_path}")
        print(f"Upload folder: {upload_dir}")
        print(f"Category: {args.category} ({'will create' if category_created else 'found'})")
        print(f"Rows in CSV: {len(rows)}")
        print(f"New products to import: {len(to_import)}")
        print(f"Existing products skipped: {len(skipped)}")
        print("")

        if skipped:
            print("Skipped existing products:")
            for row, existing_row in skipped:
                print(f"  - {row['name']} (existing stock {existing_row.get('stock')})")
            print("")

        if to_import:
            print("Products ready:")
            for row in to_import:
                print(f"  - {row['name']} | ${row['price']:.2f} | stock {row['stock']} | images {len(row['image_files'])}")
            print("")

        if not commit:
            print("Dry run complete. No database or image files were changed.")
            print("Run again with --commit to import these products.")
            return 0

        backup_path = backup_database(db_path)
        upload_dir.mkdir(parents=True, exist_ok=True)
        print(f"Backup created: {backup_path}")

        imported = 0
        for row_index, product in enumerate(to_import, start=1):
            image_urls = []
            for image_index, src in enumerate(product["image_files"], start=1):
                filename = make_upload_name(row_index, product["name"], image_index, src)
                target = unique_upload_path(upload_dir, filename)
                shutil.copy2(src, target)
                image_urls.append(f"/uploads/{target.name}")
            insert_product(db, product, category_id, image_urls)
            imported += 1

        db.commit()
        print(f"Imported products: {imported}")
        print(f"Skipped existing products: {len(skipped)}")
        print("Done.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Import jewelry products from CSV into the shop database.")
    parser.add_argument("--commit", action="store_true", help="Actually import products. Without this, only validates.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to ecommerce.db")
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="Path to jewelry import CSV")
    parser.add_argument("--image-dir", default=str(DEFAULT_IMAGE_DIR), help="Folder containing images from the CSV")
    parser.add_argument("--upload-dir", default=str(DEFAULT_UPLOAD_DIR), help="Website uploads folder")
    parser.add_argument("--category", default="Jewelry", help="Product category name")
    args = parser.parse_args()
    try:
        return run_import(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
