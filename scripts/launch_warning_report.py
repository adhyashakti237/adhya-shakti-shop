#!/usr/bin/env python3
"""Write actionable CSVs for non-blocking launch audit warnings.

This is intentionally read-only. It turns the warnings from the launch and
performance audits into small review files that can be opened in Excel before
using the separate cleanup/update scripts.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
DB_PATH = SERVER_DIR / "ecommerce.db"
UPLOADS_DIR = ROOT / "uploads"


def stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def csv_safe(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r", " ").replace("\n", " ").strip()
    if text[:1] in ("=", "+", "-", "@"):
        return "'" + text
    return text


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: csv_safe(row.get(field, "")) for field in fields})


def decode_images(value: str) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item or "").strip() for item in parsed if str(item or "").strip()]


def image_filename(url: str) -> str:
    text = str(url or "").strip()
    if "/uploads/" not in text:
        return ""
    return os.path.basename(text.split("/uploads/", 1)[1].split("?", 1)[0].split("#", 1)[0])


def size_label(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / 1024:.0f} KB"


def parse_customer_name(name: str) -> tuple[str, str] | None:
    clean = " ".join(str(name or "").strip().split())
    if not clean or "@" in clean:
        return None
    parts = clean.split(" ")
    if len(parts) < 2:
        return None
    first = parts[0].strip()
    last = " ".join(parts[1:]).strip()
    if not first or not last:
        return None
    return first, last


def product_rows(db: sqlite3.Connection, threshold_bytes: int) -> tuple[list[dict], list[dict], list[dict]]:
    rows = db.execute(
        """
        SELECT p.id,p.name,p.sku,p.price,p.cost_price,p.stock,p.images,c.name AS category
        FROM products p
        LEFT JOIN categories c ON c.id=p.category_id
        WHERE IFNULL(p.is_active,1)=1
        ORDER BY p.name COLLATE NOCASE
        """
    ).fetchall()
    missing_images: list[dict] = []
    missing_costs: list[dict] = []
    large_images: list[dict] = []
    for row in rows:
        images = decode_images(row["images"])
        if not images:
            missing_images.append({
                "id": row["id"],
                "name": row["name"],
                "sku": row["sku"] or "",
                "stock": row["stock"] or 0,
                "price": row["price"] or 0,
                "category": row["category"] or "",
                "suggested_action": "Add product image or deactivate until ready",
            })
        if float(row["cost_price"] or 0) <= 0:
            missing_costs.append({
                "id": row["id"],
                "name": row["name"],
                "sku": row["sku"] or "",
                "price": row["price"] or 0,
                "cost_price": "",
                "stock": row["stock"] or 0,
                "category": row["category"] or "",
                "notes": "Enter wholesale/unit cost for accurate profit reports",
            })
        for url in images:
            filename = image_filename(url)
            if not filename:
                continue
            path = UPLOADS_DIR / filename
            if not path.exists() or not path.is_file():
                continue
            size = path.stat().st_size
            if size > threshold_bytes:
                large_images.append({
                    "product_id": row["id"],
                    "product_name": row["name"],
                    "sku": row["sku"] or "",
                    "image_url": url,
                    "filename": filename,
                    "bytes": size,
                    "size": size_label(size),
                })
    return missing_images, missing_costs, large_images


def historical_rows(db: sqlite3.Connection, cancelled_by: str) -> tuple[list[dict], list[dict]]:
    cancelled = []
    for row in db.execute(
        """
        SELECT id,order_number,payment_status,cancelled_by,cancelled_at,created_at,updated_at
        FROM orders
        WHERE status='cancelled'
          AND (IFNULL(TRIM(cancelled_by),'')='' OR IFNULL(TRIM(cancelled_at),'')='')
        ORDER BY COALESCE(updated_at,created_at), order_number
        """
    ).fetchall():
        cancelled.append({
            "id": row["id"],
            "order_number": row["order_number"],
            "payment_status": row["payment_status"] or "",
            "current_cancelled_by": row["cancelled_by"] or "",
            "current_cancelled_at": row["cancelled_at"] or "",
            "suggested_cancelled_by": row["cancelled_by"] or cancelled_by,
            "suggested_cancelled_at": row["cancelled_at"] or row["updated_at"] or row["created_at"] or "",
            "suggested_action": "Run cleanup_historical_data_warnings.py after review",
        })

    customers = []
    for row in db.execute(
        """
        SELECT id,name,email,first_name,last_name,created_at
        FROM users
        WHERE role='customer'
          AND (IFNULL(TRIM(first_name),'')='' OR IFNULL(TRIM(last_name),'')='')
        ORDER BY created_at,email
        """
    ).fetchall():
        parsed = parse_customer_name(row["name"])
        customers.append({
            "id": row["id"],
            "email": row["email"] or "",
            "name": row["name"] or "",
            "current_first_name": row["first_name"] or "",
            "current_last_name": row["last_name"] or "",
            "suggested_first_name": (parsed[0] if parsed else ""),
            "suggested_last_name": (parsed[1] if parsed else ""),
            "auto_fixable": "yes" if parsed else "no",
            "suggested_action": "Run cleanup_historical_data_warnings.py for auto-fixable names; manually review the rest",
        })
    return cancelled, customers


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="", help="Folder to write CSV reports")
    parser.add_argument("--threshold-kb", type=int, default=900)
    parser.add_argument("--cancelled-by", default="admin", help="Suggested cancelled_by value for legacy cancelled orders")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"FAIL database not found: {DB_PATH}")
        return 1
    if not UPLOADS_DIR.exists():
        print(f"WARN uploads folder not found: {UPLOADS_DIR}")

    out_dir = Path(args.out_dir) if args.out_dir else ROOT / "audit_reports" / f"launch_warning_report_{stamp()}"
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    threshold_bytes = max(100, int(args.threshold_kb or 900)) * 1024

    missing_images, missing_costs, large_images = product_rows(db, threshold_bytes)
    cancelled, customers = historical_rows(db, " ".join(str(args.cancelled_by or "admin").split()) or "admin")

    files = {
        "missing_product_images": out_dir / "missing_product_images.csv",
        "missing_product_costs": out_dir / "missing_product_costs.csv",
        "large_product_images": out_dir / "large_product_images.csv",
        "cancelled_order_metadata": out_dir / "cancelled_order_metadata.csv",
        "customer_name_cleanup": out_dir / "customer_name_cleanup.csv",
    }
    write_csv(files["missing_product_images"], ["id", "name", "sku", "stock", "price", "category", "suggested_action"], missing_images)
    write_csv(files["missing_product_costs"], ["id", "name", "sku", "price", "cost_price", "stock", "category", "notes"], missing_costs)
    write_csv(files["large_product_images"], ["product_id", "product_name", "sku", "image_url", "filename", "bytes", "size"], large_images)
    write_csv(files["cancelled_order_metadata"], ["id", "order_number", "payment_status", "current_cancelled_by", "current_cancelled_at", "suggested_cancelled_by", "suggested_cancelled_at", "suggested_action"], cancelled)
    write_csv(files["customer_name_cleanup"], ["id", "email", "name", "current_first_name", "current_last_name", "suggested_first_name", "suggested_last_name", "auto_fixable", "suggested_action"], customers)

    summary = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "out_dir": str(out_dir),
        "threshold_kb": args.threshold_kb,
        "counts": {
            "missing_product_images": len(missing_images),
            "missing_product_costs": len(missing_costs),
            "large_product_images": len(large_images),
            "cancelled_order_metadata": len(cancelled),
            "customer_name_cleanup": len(customers),
            "customer_name_auto_fixable": sum(1 for row in customers if row["auto_fixable"] == "yes"),
        },
        "files": {key: str(path) for key, path in files.items()},
        "next_commands": [
            "python scripts/update_product_costs_from_csv.py --csv <filled missing_product_costs.csv>",
            "python scripts/update_product_costs_from_csv.py --csv <filled missing_product_costs.csv> --commit",
            "python scripts/cleanup_historical_data_warnings.py --report-json /home/adhyashakti/historical_cleanup_dry_run.json",
            "python scripts/cleanup_historical_data_warnings.py --commit --report-json /home/adhyashakti/historical_cleanup_commit.json",
            "python scripts/optimize_product_images.py --threshold-kb 900 --limit 10 --report-json /home/adhyashakti/image_opt_dry_run.json",
        ],
    }
    summary_path = out_dir / "launch_warning_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("Launch warning report")
    print("=" * 72)
    print("Output:", out_dir)
    for key, count in summary["counts"].items():
        status = "PASS" if int(count) == 0 else "TODO"
        print(f"{status} {key}: {count}")
    print("Summary:", summary_path)
    print("CSV files:")
    for path in files.values():
        print("-", path)
    print("=" * 72)
    print("PASS: launch warning report written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
