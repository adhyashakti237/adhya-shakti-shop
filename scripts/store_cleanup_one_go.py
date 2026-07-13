#!/usr/bin/env python3
"""One-go storefront cleanup.

Default mode is a dry run. With --commit, it:
- deactivates active products that have no images, so customers do not see
  unfinished placeholder cards;
- optimizes oversized product upload images to WebP and updates products.images;
- runs the local readiness audits after the cleanup.

It does not delete products, orders, or original images unless explicitly asked.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "server" / "ecommerce.db"


def run(cmd: list[str]) -> int:
    print("$", " ".join(cmd))
    return subprocess.call(cmd, cwd=str(ROOT))


def load_images(value: str) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def product_has_images(value: str) -> bool:
    return bool([str(x).strip() for x in load_images(value) if str(x).strip()])


def no_image_products(db: sqlite3.Connection) -> list[sqlite3.Row]:
    return db.execute(
        """
        SELECT id,name,sku,stock,price
        FROM products
        WHERE IFNULL(is_active,1)=1
          AND (images IS NULL OR images='' OR images='[]')
        ORDER BY name COLLATE NOCASE
        """
    ).fetchall()


def deactivate_no_image_products(db: sqlite3.Connection, products: list[sqlite3.Row]):
    for row in products:
        db.execute("UPDATE products SET is_active=0 WHERE id=?", (row["id"],))
    db.commit()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Actually apply cleanup changes")
    parser.add_argument("--keep-no-image-products", action="store_true", help="Do not deactivate products missing images")
    parser.add_argument("--skip-image-optimization", action="store_true", help="Do not run product image optimizer")
    parser.add_argument("--delete-original-images", action="store_true", help="Delete original oversized upload images after successful optimization")
    parser.add_argument("--threshold-kb", type=int, default=900)
    parser.add_argument("--base", default="", help="Optional base URL for post-cleanup live checks")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"FAIL database not found: {DB_PATH}")
        return 1

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    missing = no_image_products(db)

    print("Store cleanup one-go")
    print("=" * 72)
    print("Mode:", "COMMIT" if args.commit else "DRY RUN")
    print("Products without images:", len(missing))
    for row in missing:
        print(f"- {row['name']} | SKU {row['sku'] or '-'} | stock {row['stock'] or 0} | ${row['price'] or 0:.2f}")

    if args.keep_no_image_products:
        print("No-image product action: skipped by flag")
    elif args.commit:
        deactivate_no_image_products(db, missing)
        print(f"Deactivated products without images: {len(missing)}")
    else:
        print("Dry run: these products would be deactivated unless --keep-no-image-products is used.")

    if args.skip_image_optimization:
        print("Image optimization: skipped by flag")
    else:
        opt_cmd = [
            sys.executable,
            "scripts/optimize_product_images.py",
            "--threshold-kb",
            str(args.threshold_kb),
        ]
        if args.commit:
            opt_cmd.append("--commit")
        if args.delete_original_images:
            opt_cmd.append("--delete-originals")
        rc = run(opt_cmd)
        if rc != 0:
            return rc

    if args.commit:
        checks = [
            [sys.executable, "scripts/performance_asset_audit.py"] + (["--base", args.base] if args.base else []),
            [sys.executable, "scripts/launch_confidence_audit.py"],
        ]
        if args.base:
            checks.insert(0, [sys.executable, "scripts/website_smoke_audit.py", "--base", args.base])
        for cmd in checks:
            rc = run(cmd)
            if rc != 0:
                return rc
    else:
        print("Dry run complete. Re-run with --commit to apply cleanup.")

    print("=" * 72)
    print("PASS: store cleanup one-go finished.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
