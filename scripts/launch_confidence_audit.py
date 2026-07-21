#!/usr/bin/env python3
"""Read-only launch confidence audit.

This local/server-side audit checks launch-critical behavior that should not
require placing a paid order. It imports the Flask app, uses the current
database, and proves cart validation rejects stock quantities customers should
not be able to buy.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
UPLOAD_DIR = ROOT / "uploads"
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


def upload_filename_from_url(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    path = urlparse(text).path if text.startswith(("http://", "https://")) else text
    marker = "/uploads/"
    if marker not in path:
        return ""
    return path.split(marker, 1)[1].split("?", 1)[0].split("#", 1)[0]


def decode_images(value: str) -> list[str]:
    try:
        data = json.loads(value or "[]")
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [str(x or "").strip() for x in data if str(x or "").strip()]


def check_product_integrity(db, is_safe_public_upload_url) -> tuple[list[str], list[str], dict]:
    failures: list[str] = []
    warnings: list[str] = []
    report = {
        "checked": 0,
        "missing_images": [],
        "missing_cost_price": [],
        "bad_image_refs": [],
        "missing_files": [],
        "bad_categories": [],
        "stock_mismatches": [],
    }
    products = db.execute(
        """
        SELECT p.id,p.name,p.images,p.category_id,p.stock,p.is_active,p.cost_price,c.id AS cat_exists
        FROM products p
        LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.is_active=1
        ORDER BY p.name
        """
    ).fetchall()
    report["checked"] = len(products)
    missing_images = 0
    missing_cost = 0
    bad_refs: list[str] = []
    missing_files: list[str] = []
    bad_categories: list[str] = []
    stock_mismatches: list[str] = []
    for p in products:
        images = decode_images(p["images"])
        if not images:
            missing_images += 1
            report["missing_images"].append(p["name"])
        if float(p["cost_price"] or 0) <= 0:
            missing_cost += 1
            report["missing_cost_price"].append(p["name"])
        for img in images:
            if img.startswith("/uploads/") or "/uploads/" in img:
                if not is_safe_public_upload_url(img):
                    bad_refs.append(f"{p['name']}: unsafe image URL {img}")
                    continue
                filename = upload_filename_from_url(img)
                if filename and not (UPLOAD_DIR / filename).exists():
                    missing_files.append(f"{p['name']}: missing upload file {filename}")
        if p["category_id"] and not p["cat_exists"]:
            bad_categories.append(f"{p['name']}: missing category {p['category_id']}")
        variants = db.execute(
            "SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=?",
            (p["id"],),
        ).fetchone()[0]
        variant_count = db.execute(
            "SELECT COUNT(*) FROM product_variants WHERE product_id=?",
            (p["id"],),
        ).fetchone()[0]
        if variant_count and int(variants or 0) != int(p["stock"] or 0):
            stock_mismatches.append(f"{p['name']}: product stock {p['stock']} != variant sum {variants}")

    if missing_images:
        warnings.append(f"{missing_images} active product(s) have no image")
    if missing_cost:
        warnings.append(f"{missing_cost} active product(s) have no cost price")
    if bad_refs:
        failures.extend(bad_refs[:20])
        if len(bad_refs) > 20:
            failures.append(f"{len(bad_refs) - 20} more unsafe image references")
    if missing_files:
        failures.extend(missing_files[:20])
        if len(missing_files) > 20:
            failures.append(f"{len(missing_files) - 20} more missing upload files")
    if bad_categories:
        failures.extend(bad_categories[:20])
        if len(bad_categories) > 20:
            failures.append(f"{len(bad_categories) - 20} more missing category links")
    if stock_mismatches:
        failures.extend(stock_mismatches[:20])
        if len(stock_mismatches) > 20:
            failures.append(f"{len(stock_mismatches) - 20} more variant stock mismatches")
    report["bad_image_refs"] = bad_refs
    report["missing_files"] = missing_files
    report["bad_categories"] = bad_categories
    report["stock_mismatches"] = stock_mismatches
    if not failures:
        print(f"PASS product image/category/variant integrity: checked {len(products)} active products")
    return failures, warnings, report


def check_order_integrity(db) -> tuple[list[str], list[str], dict]:
    failures: list[str] = []
    warnings: list[str] = []
    report = {}
    counts = dict(db.execute(
        """
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN payment_status='paid' AND status='pending' THEN 1 ELSE 0 END) AS paid_pending,
          SUM(CASE WHEN status='shipped' AND IFNULL(TRIM(tracking_number),'')='' THEN 1 ELSE 0 END) AS shipped_missing_tracking,
          SUM(CASE WHEN status='cancelled' AND IFNULL(TRIM(cancelled_by),'')='' THEN 1 ELSE 0 END) AS cancelled_missing_by,
          SUM(CASE WHEN status='cancelled' AND IFNULL(TRIM(cancelled_at),'')='' THEN 1 ELSE 0 END) AS cancelled_missing_time,
          SUM(CASE WHEN payment_status='refund_pending' AND status NOT IN ('cancelled','return_received') THEN 1 ELSE 0 END) AS invalid_refund_pending,
          SUM(CASE WHEN payment_status='refunded' AND status NOT IN ('cancelled','return_received') THEN 1 ELSE 0 END) AS invalid_refunded,
          SUM(CASE WHEN total < 0 OR subtotal < 0 OR discount < 0 OR shipping_charge < 0 THEN 1 ELSE 0 END) AS negative_money,
          SUM(CASE WHEN IFNULL(TRIM(customer_email),'')='' THEN 1 ELSE 0 END) AS missing_customer_email
        FROM orders
        """
    ).fetchone())
    report.update({k: int(v or 0) for k, v in counts.items()})

    if report["invalid_refund_pending"]:
        failures.append(f"{report['invalid_refund_pending']} order(s) have refund_pending outside cancelled/return flow")
    if report["invalid_refunded"]:
        failures.append(f"{report['invalid_refunded']} order(s) are refunded outside cancelled/return flow")
    if report["negative_money"]:
        failures.append(f"{report['negative_money']} order(s) have negative money fields")
    if report["missing_customer_email"]:
        failures.append(f"{report['missing_customer_email']} order(s) are missing customer email")
    if report["shipped_missing_tracking"]:
        warnings.append(f"{report['shipped_missing_tracking']} shipped order(s) have no tracking number")
    if report["cancelled_missing_by"]:
        warnings.append(f"{report['cancelled_missing_by']} cancelled order(s) are missing cancelled_by")
    if report["cancelled_missing_time"]:
        warnings.append(f"{report['cancelled_missing_time']} cancelled order(s) are missing cancellation time")

    dupes = db.execute(
        """
        SELECT payment_intent_id,COUNT(*) AS count
        FROM orders
        WHERE IFNULL(TRIM(payment_intent_id),'')!=''
        GROUP BY payment_intent_id
        HAVING COUNT(*)>1
        """
    ).fetchall()
    report["duplicate_payment_intents"] = [dict(row) for row in dupes]
    if dupes:
        failures.append(f"{len(dupes)} duplicate Stripe payment_intent_id value(s)")

    print(f"PASS order/payment state scan: checked {report['total']} orders")
    return failures, warnings, report


def check_user_integrity(db) -> tuple[list[str], list[str], dict]:
    failures: list[str] = []
    warnings: list[str] = []
    rows = db.execute(
        """
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN role NOT IN ('customer','staff','admin') THEN 1 ELSE 0 END) AS bad_roles,
          SUM(CASE WHEN IFNULL(TRIM(email),'')='' THEN 1 ELSE 0 END) AS missing_email,
          SUM(CASE WHEN IFNULL(TRIM(password),'')='' THEN 1 ELSE 0 END) AS missing_password,
          SUM(CASE WHEN role='customer' AND (IFNULL(TRIM(first_name),'')='' OR IFNULL(TRIM(last_name),'')='') THEN 1 ELSE 0 END) AS customer_missing_names
        FROM users
        """
    ).fetchone()
    report = {k: int(rows[k] or 0) for k in rows.keys()}
    if report["bad_roles"]:
        failures.append(f"{report['bad_roles']} user(s) have invalid roles")
    if report["missing_email"]:
        failures.append(f"{report['missing_email']} user(s) are missing email")
    if report["missing_password"]:
        failures.append(f"{report['missing_password']} user(s) are missing password hash")
    if report["customer_missing_names"]:
        warnings.append(f"{report['customer_missing_names']} customer account(s) are missing first/last name")
    print(f"PASS user account scan: checked {report['total']} users")
    return failures, warnings, report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-json", default="", help="Optional path for a machine-readable report")
    args = parser.parse_args()

    failures: list[str] = []
    warnings: list[str] = []
    report: dict = {"failures": failures, "warnings": warnings}
    print("Launch confidence audit")
    print("=" * 72)

    if not os.environ.get("JWT_SECRET"):
        os.environ["JWT_SECRET"] = "launch-confidence-local-only"

    from app import app, get_db  # noqa: E402
    from security_utils import is_safe_public_upload_url  # noqa: E402

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
        report["database"] = {
            "active_products": int(product_count or 0),
            "orders": int(order_count or 0),
            "negative_product_stock": int(negative_products or 0),
            "negative_variant_stock": int(negative_variants or 0),
        }
        if negative_products:
            failures.append(f"{negative_products} products have negative stock")
        if negative_variants:
            failures.append(f"{negative_variants} variants have negative stock")
        product_failures, product_warnings, product_report = check_product_integrity(db, is_safe_public_upload_url)
        for warning in product_warnings:
            print(f"WARN {warning}")
        warnings.extend(product_warnings)
        failures.extend(product_failures)
        report["products"] = product_report
        order_failures, order_warnings, order_report = check_order_integrity(db)
        for warning in order_warnings:
            print(f"WARN {warning}")
        failures.extend(order_failures)
        warnings.extend(order_warnings)
        report["orders"] = order_report
        user_failures, user_warnings, user_report = check_user_integrity(db)
        for warning in user_warnings:
            print(f"WARN {warning}")
        failures.extend(user_failures)
        warnings.extend(user_warnings)
        report["users"] = user_report
        simple_case, variant_case = find_stock_cases(db)

    route_results = []
    with app.test_client() as client:
        token = csrf(client)
        if simple_case:
            qty = int(simple_case["stock"] or 0) + 1
            payload = {"items": [{"id": simple_case["id"], "qty": qty}]}
            res = post_json(client, "/api/cart/validate", payload, token)
            error = (res.get_json(silent=True) or {}).get("error", "")
            ok = res.status_code == 400 and "left in stock" in error
            print(f"{'PASS' if ok else 'FAIL'} simple stock overbuy blocked: {simple_case['name']} qty {qty}")
            route_results.append({"check": "simple_stock_overbuy", "ok": ok, "status": res.status_code})
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
            route_results.append({"check": "variant_stock_overbuy", "ok": ok, "status": res.status_code})
            if not ok:
                failures.append("variant stock overbuy was not blocked")
        else:
            print("SKIP variant stock overbuy: no active variant products found")

        for path in ["/", "/products", "/cart", "/wishlist", "/login", "/admin", "/admin/categories", "/admin/accounts/inventory"]:
            res = client.get(path)
            ok = res.status_code < 500
            print(f"{'PASS' if ok else 'FAIL'} route {path}: {res.status_code}")
            route_results.append({"path": path, "ok": ok, "status": res.status_code})
            if not ok:
                failures.append(f"{path} returned {res.status_code}")

        for path in ["/api/products?per_page=6", "/api/category-tree", "/api/settings"]:
            res = client.get(path)
            ok = res.status_code == 200 and res.is_json
            print(f"{'PASS' if ok else 'FAIL'} api {path}: {res.status_code}")
            route_results.append({"path": path, "ok": ok, "status": res.status_code, "json": bool(res.is_json)})
            if not ok:
                failures.append(f"{path} returned {res.status_code} or non-json")
    report["routes"] = route_results

    if args.report_json:
        Path(args.report_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Report written: {args.report_json}")
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
