#!/usr/bin/env python3
"""Clean up safe historical data-quality warnings.

Default mode is a dry run. With --commit, this script backfills only fields that
can be inferred safely:

- cancelled orders missing cancelled_by / cancelled_at
- customer accounts missing first_name / last_name when the full name is clear

It does not delete records, change money totals, change stock, or touch payment
statuses.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
DB_PATH = SERVER_DIR / "ecommerce.db"
BACKUP_DIR = SERVER_DIR / "backups"


def backup_database() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"before_historical_data_cleanup_{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return target


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


def load_cancelled_order_candidates(db: sqlite3.Connection, cancelled_by: str) -> list[dict]:
    rows = db.execute(
        """
        SELECT id,order_number,status,payment_status,cancelled_by,cancelled_at,created_at,updated_at
        FROM orders
        WHERE status='cancelled'
          AND (IFNULL(TRIM(cancelled_by),'')='' OR IFNULL(TRIM(cancelled_at),'')='')
        ORDER BY COALESCE(updated_at,created_at), order_number
        """
    ).fetchall()
    candidates = []
    for row in rows:
        current_by = str(row["cancelled_by"] or "").strip()
        current_at = str(row["cancelled_at"] or "").strip()
        inferred_at = str(row["updated_at"] or row["created_at"] or "").strip()
        candidates.append(
            {
                "id": row["id"],
                "order_number": row["order_number"],
                "payment_status": row["payment_status"],
                "set_cancelled_by": current_by or cancelled_by,
                "set_cancelled_at": current_at or inferred_at,
                "current_cancelled_by": current_by,
                "current_cancelled_at": current_at,
            }
        )
    return candidates


def load_customer_name_candidates(db: sqlite3.Connection) -> list[dict]:
    rows = db.execute(
        """
        SELECT id,name,email,first_name,last_name,created_at
        FROM users
        WHERE role='customer'
          AND (IFNULL(TRIM(first_name),'')='' OR IFNULL(TRIM(last_name),'')='')
        ORDER BY created_at,email
        """
    ).fetchall()
    candidates = []
    for row in rows:
        parsed = parse_customer_name(row["name"])
        if not parsed:
            continue
        first, last = parsed
        candidates.append(
            {
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "set_first_name": str(row["first_name"] or "").strip() or first,
                "set_last_name": str(row["last_name"] or "").strip() or last,
                "current_first_name": str(row["first_name"] or "").strip(),
                "current_last_name": str(row["last_name"] or "").strip(),
            }
        )
    return candidates


def write_report(path: str, report: dict) -> None:
    if not path:
        return
    Path(path).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Report written: {path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Actually update safely inferred historical fields")
    parser.add_argument("--no-backup", action="store_true", help="Do not create a DB copy before --commit")
    parser.add_argument("--cancelled-by", default="admin", help="Value to use for legacy cancelled orders missing cancelled_by")
    parser.add_argument("--report-json", default="", help="Optional path for a JSON report")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"FAIL database not found: {DB_PATH}")
        return 1

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    cancelled_by = " ".join(str(args.cancelled_by or "admin").strip().split()) or "admin"
    cancelled_candidates = load_cancelled_order_candidates(db, cancelled_by)
    customer_candidates = load_customer_name_candidates(db)
    report = {
        "mode": "commit" if args.commit else "dry_run",
        "cancelled_order_candidates": cancelled_candidates,
        "customer_name_candidates": customer_candidates,
        "updated_cancelled_orders": 0,
        "updated_customers": 0,
        "backup": "",
    }

    print("Historical data warning cleanup")
    print("=" * 72)
    print("Mode:", "COMMIT" if args.commit else "DRY RUN")
    print("Cancelled order audit candidates:", len(cancelled_candidates))
    for item in cancelled_candidates[:12]:
        print(f"- {item['order_number']}: cancelled_by -> {item['set_cancelled_by']}, cancelled_at -> {item['set_cancelled_at']}")
    if len(cancelled_candidates) > 12:
        print(f"... and {len(cancelled_candidates) - 12} more")
    print("Customer name candidates:", len(customer_candidates))
    for item in customer_candidates[:12]:
        print(f"- {item['email']}: {item['set_first_name']} {item['set_last_name']}")
    if len(customer_candidates) > 12:
        print(f"... and {len(customer_candidates) - 12} more")

    if not args.commit:
        write_report(args.report_json, report)
        print("Dry run complete. Re-run with --commit to apply these safe backfills.")
        return 0

    if not args.no_backup:
        backup = backup_database()
        report["backup"] = str(backup)
        print(f"Database backup: {backup}")

    for item in cancelled_candidates:
        db.execute(
            """
            UPDATE orders
               SET cancelled_by=CASE WHEN IFNULL(TRIM(cancelled_by),'')='' THEN ? ELSE cancelled_by END,
                   cancelled_at=CASE WHEN IFNULL(TRIM(cancelled_at),'')='' THEN ? ELSE cancelled_at END
             WHERE id=?
            """,
            (item["set_cancelled_by"], item["set_cancelled_at"], item["id"]),
        )
    for item in customer_candidates:
        db.execute(
            """
            UPDATE users
               SET first_name=CASE WHEN IFNULL(TRIM(first_name),'')='' THEN ? ELSE first_name END,
                   last_name=CASE WHEN IFNULL(TRIM(last_name),'')='' THEN ? ELSE last_name END
             WHERE id=?
            """,
            (item["set_first_name"], item["set_last_name"], item["id"]),
        )
    db.commit()

    report["updated_cancelled_orders"] = len(cancelled_candidates)
    report["updated_customers"] = len(customer_candidates)
    write_report(args.report_json, report)
    print("=" * 72)
    print(f"Updated cancelled orders: {len(cancelled_candidates)}")
    print(f"Updated customers: {len(customer_candidates)}")
    print("PASS: historical data warning cleanup complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
