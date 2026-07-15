#!/usr/bin/env python3
"""Completely delete one product and every trace of it.

Removes: the product row, its variants, reviews, wishlist entries,
back-in-stock requests, bookkeeping purchase lines (and any purchase that
becomes empty, including its bill attachments), stock movement history, and
the product's image files in uploads/.

SAFETY: refuses to run if the product appears in any customer order or in any
bookkeeping SALE — deleting those would corrupt order/sales history. (Archive
the product instead in that case.)

Default is a DRY RUN that only reports what would be deleted:

    python3 scripts/delete_product_completely.py --name "Exact Product Name"
    python3 scripts/delete_product_completely.py --name "Exact Product Name" --commit
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "server" / "ecommerce.db"
UPLOADS_DIR = ROOT / "uploads"
BILLS_DIR = ROOT / "private_bills"


def load_images(value):
    try:
        parsed = json.loads(value or "[]")
        return [str(x) for x in parsed if isinstance(x, str)] if isinstance(parsed, list) else []
    except Exception:
        return []


def main() -> int:
    ap = argparse.ArgumentParser()
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--name", help="Exact product name (case-insensitive)")
    group.add_argument("--id", help="Product id")
    ap.add_argument("--commit", action="store_true", help="Actually delete. Omit for dry run.")
    args = ap.parse_args()

    if not DB_PATH.exists():
        print(f"FAIL database not found: {DB_PATH}")
        return 1

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    if args.id:
        rows = db.execute("SELECT * FROM products WHERE id=?", (args.id,)).fetchall()
    else:
        rows = db.execute("SELECT * FROM products WHERE name=? COLLATE NOCASE", (args.name,)).fetchall()
    if not rows:
        print("FAIL: no product matches. Nothing deleted.")
        return 1
    if len(rows) > 1:
        print(f"FAIL: {len(rows)} products match — re-run with --id to pick one:")
        for r in rows:
            print(f"  {r['id']}  {r['name']}  active={r['is_active']}")
        return 1

    p = rows[0]
    pid = p["id"]
    print("Delete product completely")
    print("=" * 72)
    print("Mode:", "COMMIT" if args.commit else "DRY RUN")
    print(f"Product: {p['name']}  (id {pid}, active={p['is_active']}, stock={p['stock']})")

    # ── Safety: order / sales history must never lose rows ──────────────────
    order_hits = 0
    for o in db.execute("SELECT items FROM orders").fetchall():
        try:
            if any(isinstance(i, dict) and i.get("id") == pid for i in json.loads(o["items"] or "[]")):
                order_hits += 1
        except Exception:
            continue
    sale_hits = db.execute("SELECT COUNT(*) c FROM acc_sale_items WHERE item_id=?", (pid,)).fetchone()["c"]
    if order_hits or sale_hits:
        print(f"ABORT: referenced by {order_hits} customer order(s) and {sale_hits} sale line(s).")
        print("Deleting would corrupt order/sales history. Archive the product instead.")
        return 1

    # ── Collect everything that will go ─────────────────────────────────────
    counts = {
        "variants": db.execute("SELECT COUNT(*) c FROM product_variants WHERE product_id=?", (pid,)).fetchone()["c"],
        "reviews": db.execute("SELECT COUNT(*) c FROM reviews WHERE product_id=?", (pid,)).fetchone()["c"],
        "wishlist entries": db.execute("SELECT COUNT(*) c FROM user_wishlist WHERE product_id=?", (pid,)).fetchone()["c"],
        "back-in-stock requests": db.execute("SELECT COUNT(*) c FROM back_in_stock_requests WHERE product_id=?", (pid,)).fetchone()["c"],
        "stock movements": db.execute("SELECT COUNT(*) c FROM acc_stock_moves WHERE item_id=?", (pid,)).fetchone()["c"],
        "purchase lines": db.execute("SELECT COUNT(*) c FROM acc_purchase_items WHERE item_id=?", (pid,)).fetchone()["c"],
    }

    # Purchases that will become empty once this product's lines are removed
    empty_purchases = [r["id"] for r in db.execute(
        """SELECT DISTINCT pi.purchase_id AS id FROM acc_purchase_items pi
           WHERE pi.item_id=?
             AND NOT EXISTS (SELECT 1 FROM acc_purchase_items o
                             WHERE o.purchase_id=pi.purchase_id AND o.item_id IS NOT ?)""",
        (pid, pid)).fetchall()]
    attachments = []
    if empty_purchases:
        marks = ",".join("?" * len(empty_purchases))
        attachments = db.execute(
            f"SELECT id, stored_name FROM acc_attachments WHERE parent_type='purchase' AND parent_id IN ({marks})",  # nosec B608
            empty_purchases).fetchall()

    image_files = []
    for url in load_images(p["images"]):
        fname = os.path.basename(url)
        full = UPLOADS_DIR / fname
        if fname and full.is_file():
            image_files.append(full)

    for label, n in counts.items():
        print(f"  {label}: {n}")
    print(f"  whole purchases removed (contained only this product): {len(empty_purchases)}")
    print(f"  purchase bill attachments removed: {len(attachments)}")
    print(f"  image files deleted from uploads/: {len(image_files)}")
    for f in image_files:
        print(f"    - {f.name}")

    if not args.commit:
        print("-" * 72)
        print("Dry run complete. Re-run with --commit to delete everything above.")
        return 0

    # ── Delete (single transaction) ──────────────────────────────────────────
    cur = db.cursor()
    cur.execute("BEGIN IMMEDIATE")
    cur.execute("DELETE FROM product_variants WHERE product_id=?", (pid,))
    cur.execute("DELETE FROM reviews WHERE product_id=?", (pid,))
    cur.execute("DELETE FROM user_wishlist WHERE product_id=?", (pid,))
    cur.execute("DELETE FROM back_in_stock_requests WHERE product_id=?", (pid,))
    cur.execute("DELETE FROM acc_stock_moves WHERE item_id=?", (pid,))
    cur.execute("DELETE FROM acc_purchase_items WHERE item_id=?", (pid,))
    if empty_purchases:
        marks = ",".join("?" * len(empty_purchases))
        cur.execute(f"DELETE FROM acc_attachments WHERE parent_type='purchase' AND parent_id IN ({marks})", empty_purchases)  # nosec B608
        cur.execute(f"DELETE FROM acc_purchases WHERE id IN ({marks})", empty_purchases)  # nosec B608
    cur.execute("DELETE FROM products WHERE id=?", (pid,))
    db.commit()

    removed_files = 0
    for f in image_files:
        try:
            f.unlink()
            removed_files += 1
        except OSError as exc:
            print(f"  WARN could not delete {f.name}: {exc}")
    for a in attachments:
        bill = BILLS_DIR / os.path.basename(a["stored_name"] or "")
        try:
            if bill.is_file():
                bill.unlink()
        except OSError as exc:
            print(f"  WARN could not delete bill {bill.name}: {exc}")

    left = db.execute("SELECT COUNT(*) c FROM products WHERE id=?", (pid,)).fetchone()["c"]
    print("-" * 72)
    print(f"PASS: product deleted (rows remaining for id: {left}); image files removed: {removed_files}/{len(image_files)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
