#!/usr/bin/env python3
"""Read-only launch confidence audit.

This local/server-side audit checks launch-critical behavior that should not
require placing a paid order. It imports the Flask app, uses the current
database, and proves cart validation rejects stock quantities customers should
not be able to buy.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
sys.path.insert(0, str(SERVER_DIR))


def csrf(client):
    res = client.get("/api/auth/csrf")
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()["csrf_token"]


def post_json(client, path: str, payload: dict, token: str):
    return client.post(path, json=payload, headers={"X-CSRF-Token": token})


def find_stock_cases(db):
    simple_over = db.execute(
        """
        SELECT p.id,p.name,IFNULL(p.stock,0) AS stock
        FROM products p
        WHERE p.is_active=1
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id)
        ORDER BY IFNULL(p.stock,0) ASC, p.name ASC
        LIMIT 1
        """
    ).fetchone()
    variant_over = db.execute(
        """
        SELECT p.id,p.name,v.color,v.size,IFNULL(v.stock,0) AS stock
        FROM products p
        JOIN product_variants v ON v.product_id=p.id
        WHERE p.is_active=1
        ORDER BY IFNULL(v.stock,0) ASC, p.name ASC, v.color ASC, v.size ASC
        LIMIT 1
        """
    ).fetchone()
    return simple_over, variant_over


def main() -> int:
    failures: list[str] = []
    print("Launch confidence audit")
    print("=" * 72)

    if not os.environ.get("JWT_SECRET"):
        os.environ["JWT_SECRET"] = "launch-confidence-local-only"

    from app import app, get_db  # noqa: E402

    with app.app_context():
        db = get_db()
        product_count = db.execute("SELECT COUNT(*) FROM products WHERE is_active=1").fetchone()[0]
        order_count = db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        negative_products = db.execute("SELECT COUNT(*) FROM products WHERE IFNULL(stock,0)<0").fetchone()[0]
        negative_variants = db.execute("SELECT COUNT(*) FROM product_variants WHERE IFNULL(stock,0)<0").fetchone()[0]
        print(f"INFO active products: {product_count}")
        print(f"INFO orders: {order_count}")
        print(f"{'PASS' if negative_products == 0 else 'FAIL'} negative product stock: {negative_products}")
        print(f"{'PASS' if negative_variants == 0 else 'FAIL'} negative variant stock: {negative_variants}")
        if negative_products:
            failures.append(f"{negative_products} products have negative stock")
        if negative_variants:
            failures.append(f"{negative_variants} variants have negative stock")
        simple_case, variant_case = find_stock_cases(db)

    with app.test_client() as client:
        token = csrf(client)
        if simple_case:
            qty = int(simple_case["stock"] or 0) + 1
            payload = {"items": [{"id": simple_case["id"], "qty": qty}]}
            res = post_json(client, "/api/cart/validate", payload, token)
            error = (res.get_json(silent=True) or {}).get("error", "")
            ok = res.status_code == 400 and "left in stock" in error
            print(f"{'PASS' if ok else 'FAIL'} simple stock overbuy blocked: {simple_case['name']} qty {qty}")
            if not ok:
                failures.append("simple stock overbuy was not blocked")
        else:
            print("SKIP simple stock overbuy: no active non-variant products found")

        if variant_case:
            qty = int(variant_case["stock"] or 0) + 1
            variation = f"{variant_case['color']} / {variant_case['size']}"
            payload = {"items": [{"id": variant_case["id"], "qty": qty, "variation": variation}]}
            res = post_json(client, "/api/cart/validate", payload, token)
            error = (res.get_json(silent=True) or {}).get("error", "")
            ok = res.status_code == 400 and "left in stock" in error
            print(f"{'PASS' if ok else 'FAIL'} variant stock overbuy blocked: {variant_case['name']} {variation} qty {qty}")
            if not ok:
                failures.append("variant stock overbuy was not blocked")
        else:
            print("SKIP variant stock overbuy: no active variant products found")

        for path in ["/", "/products", "/cart", "/wishlist", "/login", "/admin"]:
            res = client.get(path)
            ok = res.status_code < 500
            print(f"{'PASS' if ok else 'FAIL'} route {path}: {res.status_code}")
            if not ok:
                failures.append(f"{path} returned {res.status_code}")

    if failures:
        print("=" * 72)
        print("FAILURES:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("=" * 72)
    print("PASS: launch-critical read-only checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
