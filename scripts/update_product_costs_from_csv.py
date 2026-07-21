#!/usr/bin/env python3
"""Safely update product cost prices from a CSV.

Default mode is a dry run. The script updates only products.cost_price. It does
not change retail price, stock, images, categories, descriptions, or variants.

Typical workflow:

1. Generate a template:
   python scripts/update_product_costs_from_csv.py --write-template product_costs.csv

2. Fill in cost_price in Excel.

3. Dry run:
   python scripts/update_product_costs_from_csv.py --csv product_costs.csv

4. Commit after reviewing:
   python scripts/update_product_costs_from_csv.py --csv product_costs.csv --commit
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import shutil
import sqlite3
from decimal import Decimal, InvalidOperation
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
DB_PATH = SERVER_DIR / "ecommerce.db"
BACKUP_DIR = SERVER_DIR / "backups"


def backup_database() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"before_product_cost_update_{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return target


def csv_safe(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r", " ").replace("\n", " ").strip()
    if text[:1] in ("=", "+", "-", "@"):
        return "'" + text
    return text


def money_value(value) -> float | None:
    text = str(value or "").strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    if amount < 0:
        return None
    return float(amount.quantize(Decimal("0.01")))


def load_products(db: sqlite3.Connection) -> tuple[dict[str, sqlite3.Row], dict[str, list[sqlite3.Row]], dict[str, list[sqlite3.Row]]]:
    rows = db.execute(
        """
        SELECT p.id,p.name,p.sku,p.price,p.cost_price,p.stock,p.is_active,c.name AS category
        FROM products p
        LEFT JOIN categories c ON c.id=p.category_id
        ORDER BY p.name COLLATE NOCASE
        """
    ).fetchall()
    by_id = {row["id"]: row for row in rows}
    by_sku: dict[str, list[sqlite3.Row]] = {}
    by_name: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        sku = str(row["sku"] or "").strip().lower()
        if sku:
            by_sku.setdefault(sku, []).append(row)
        by_name.setdefault(str(row["name"] or "").strip().lower(), []).append(row)
    return by_id, by_sku, by_name


def write_template(db: sqlite3.Connection, path: Path, include_all: bool) -> int:
    where = "" if include_all else "WHERE p.is_active=1 AND IFNULL(p.cost_price,0)<=0"
    rows = db.execute(
        f"""
        SELECT p.id,p.name,p.sku,p.price,p.cost_price,p.stock,c.name AS category
        FROM products p
        LEFT JOIN categories c ON c.id=p.category_id
        {where}
        ORDER BY p.name COLLATE NOCASE
        """
    ).fetchall()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "name", "sku", "price", "cost_price", "stock", "category", "notes"])
        for row in rows:
            writer.writerow([
                csv_safe(row["id"]),
                csv_safe(row["name"]),
                csv_safe(row["sku"]),
                csv_safe(row["price"]),
                "" if float(row["cost_price"] or 0) <= 0 else csv_safe(row["cost_price"]),
                csv_safe(row["stock"]),
                csv_safe(row["category"]),
                "",
            ])
    return len(rows)


def resolve_product(row: dict, by_id: dict, by_sku: dict, by_name: dict) -> tuple[sqlite3.Row | None, str]:
    product_id = str(row.get("id") or "").strip()
    sku = str(row.get("sku") or "").strip().lower()
    name = str(row.get("name") or "").strip().lower()
    if product_id:
        product = by_id.get(product_id)
        return (product, "" if product else "product id not found")
    if sku:
        matches = by_sku.get(sku, [])
        if len(matches) == 1:
            return matches[0], ""
        if len(matches) > 1:
            return None, "sku matches multiple products"
    if name:
        matches = by_name.get(name, [])
        if len(matches) == 1:
            return matches[0], ""
        if len(matches) > 1:
            return None, "name matches multiple products"
    return None, "missing usable id, unique sku, or unique name"


def load_cost_updates(path: Path, db: sqlite3.Connection, overwrite_existing: bool) -> tuple[list[dict], list[dict]]:
    by_id, by_sku, by_name = load_products(db)
    updates = []
    skipped = []
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return [], [{"row": 0, "reason": "CSV has no header row"}]
        lower_fields = {name.lower().strip(): name for name in reader.fieldnames}
        cost_col = lower_fields.get("cost_price") or lower_fields.get("new_cost_price") or lower_fields.get("unit_cost")
        if not cost_col:
            return [], [{"row": 0, "reason": "CSV must include cost_price, new_cost_price, or unit_cost column"}]
        for index, raw in enumerate(reader, start=2):
            row = {str(k or "").lower().strip(): v for k, v in raw.items()}
            product, reason = resolve_product(row, by_id, by_sku, by_name)
            if not product:
                skipped.append({"row": index, "reason": reason, "input": row})
                continue
            new_cost = money_value(raw.get(cost_col))
            if new_cost is None:
                skipped.append({"row": index, "product": product["name"], "reason": "missing or invalid cost_price"})
                continue
            old_cost = float(product["cost_price"] or 0)
            if old_cost > 0 and not overwrite_existing:
                skipped.append({"row": index, "product": product["name"], "reason": "existing cost_price kept; use --overwrite-existing to replace it", "old_cost": old_cost, "new_cost": new_cost})
                continue
            if old_cost == new_cost:
                skipped.append({"row": index, "product": product["name"], "reason": "cost_price already matches", "old_cost": old_cost, "new_cost": new_cost})
                continue
            updates.append({
                "row": index,
                "id": product["id"],
                "name": product["name"],
                "sku": product["sku"] or "",
                "old_cost": old_cost,
                "new_cost": new_cost,
                "price": float(product["price"] or 0),
            })
    return updates, skipped


def write_report(path: str, report: dict) -> None:
    if not path:
        return
    Path(path).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Report written: {path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", dest="csv_path", default="", help="CSV containing id/name/sku and cost_price")
    parser.add_argument("--write-template", default="", help="Write a cost update template CSV and exit")
    parser.add_argument("--template-all", action="store_true", help="Include all products in template, not only missing costs")
    parser.add_argument("--commit", action="store_true", help="Actually update product cost_price")
    parser.add_argument("--overwrite-existing", action="store_true", help="Allow replacing non-zero existing cost prices")
    parser.add_argument("--no-backup", action="store_true", help="Do not create a DB backup before --commit")
    parser.add_argument("--report-json", default="", help="Optional path for a JSON report")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"FAIL database not found: {DB_PATH}")
        return 1

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    if args.write_template:
        count = write_template(db, Path(args.write_template), args.template_all)
        print(f"PASS: wrote {count} product rows to {args.write_template}")
        return 0

    if not args.csv_path:
        print("FAIL provide --csv path or --write-template path")
        return 1
    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        print(f"FAIL CSV not found: {csv_path}")
        return 1

    updates, skipped = load_cost_updates(csv_path, db, args.overwrite_existing)
    report = {
        "mode": "commit" if args.commit else "dry_run",
        "csv": str(csv_path),
        "updates": updates,
        "skipped": skipped,
        "backup": "",
    }

    print("Product cost updater")
    print("=" * 72)
    print("Mode:", "COMMIT" if args.commit else "DRY RUN")
    print("Updates:", len(updates))
    for item in updates[:20]:
        print(f"- {item['name']}: {item['old_cost']:.2f} -> {item['new_cost']:.2f}")
    if len(updates) > 20:
        print(f"... and {len(updates) - 20} more")
    print("Skipped:", len(skipped))
    for item in skipped[:10]:
        print(f"- row {item.get('row')}: {item.get('product', '')} {item.get('reason')}")
    if len(skipped) > 10:
        print(f"... and {len(skipped) - 10} more")

    if not args.commit:
        write_report(args.report_json, report)
        print("Dry run complete. Re-run with --commit to apply the cost updates.")
        return 0

    if not args.no_backup:
        backup = backup_database()
        report["backup"] = str(backup)
        print(f"Database backup: {backup}")

    for item in updates:
        db.execute("UPDATE products SET cost_price=? WHERE id=?", (item["new_cost"], item["id"]))
    db.commit()

    write_report(args.report_json, report)
    print("=" * 72)
    print(f"Updated product cost prices: {len(updates)}")
    print("PASS: product cost update complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
