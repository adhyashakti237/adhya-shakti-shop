#!/usr/bin/env python3
"""Public website smoke audit for Adhya Shakti Shop.

This script is intentionally read-only. It checks that important public pages,
public APIs, and critical customer-side JavaScript markers are present after a
deployment. It can run against local dev or the live site:

    python scripts/website_smoke_audit.py
    python scripts/website_smoke_audit.py --base https://adhyashaktishop.com

Optional login checks use environment variables so credentials are never saved
in code:

    ADHYA_ADMIN_EMAIL=... ADHYA_ADMIN_PASSWORD=... python scripts/website_smoke_audit.py --base https://adhyashaktishop.com
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

PUBLIC_ROUTES = [
    "/",
    "/products",
    "/cart",
    "/wishlist",
    "/login",
    "/about",
    "/contact",
    "/refund",
    "/faq",
    "/track-order",
    "/bulk-orders",
    "/robots.txt",
    "/sitemap.xml",
]

PUBLIC_APIS = [
    "/api/products?per_page=1",
    "/api/products?per_page=6&sort=newest",
    "/api/category-tree",
    "/api/categories",
    "/api/settings",
]

STATIC_ASSETS = [
    "/css/style.css",
    "/js/components.js",
    "/js/pages/home.js",
    "/js/pages/products.js",
    "/js/pages/product-detail.js",
    "/js/pages/checkout.js",
    "/images/logo-main.png",
]

STATIC_MARKERS = {
    "client/js/router.js": [
        "Keep them out of this cleanup list",
        "confirmCancelOrder",
    ],
    "client/js/csp-actions.js": [
        "confirmCancelOrder",
        "doCancelOrder",
        "confirmRequestReturn",
        "openWriteReview",
    ],
    "client/js/pages/customer-dashboard.js": [
        "Cancel Order & Refund",
        "confirmCancelOrder",
        "doCancelOrder",
        "refund_result",
    ],
    "client/js/pages/products.js": [
        "cat-pill-flyout-all",
        "cat-pill-flyout",
        "CollectionPage",
    ],
    "client/js/pages/product-detail.js": [
        "hasMerchantReturnPolicy",
        "BreadcrumbList",
    ],
    "client/js/pages/static-pages.js": [
        "FAQPage",
    ],
}


def make_opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request_url(
    base: str,
    path: str,
    timeout: int,
    opener: urllib.request.OpenerDirector | None = None,
    warn_seconds: float = 0,
) -> tuple[bool, str, bool]:
    url = base.rstrip("/") + path
    req = urllib.request.Request(url, headers={"User-Agent": "AdhyaSmokeAudit/1.0"})
    started = time.perf_counter()
    try:
        open_url = opener.open if opener else urllib.request.urlopen
        with open_url(req, timeout=timeout) as res:
            body = res.read(200_000)
            status = getattr(res, "status", 0)
            ctype = res.headers.get("content-type", "")
            elapsed = time.perf_counter() - started
            if status >= 400:
                return False, f"{status} {ctype} ({elapsed:.2f}s)", False
            if path.startswith("/api/"):
                try:
                    json.loads(body.decode("utf-8", "replace"))
                except json.JSONDecodeError as exc:
                    return False, f"{status} invalid json: {exc} ({elapsed:.2f}s)", False
            slow = bool(warn_seconds and elapsed > warn_seconds)
            return True, f"{status} {ctype} ({elapsed:.2f}s)", slow
    except urllib.error.HTTPError as exc:
        return False, f"{exc.code} {exc.reason}", False
    except Exception as exc:
        return False, str(exc), False


def get_json(base: str, path: str, timeout: int, opener: urllib.request.OpenerDirector) -> tuple[int, dict]:
    url = base.rstrip("/") + path
    req = urllib.request.Request(url, headers={"User-Agent": "AdhyaSmokeAudit/1.0"})
    with opener.open(req, timeout=timeout) as res:
        raw = res.read(200_000).decode("utf-8", "replace")
        return getattr(res, "status", 0), json.loads(raw or "{}")


def post_json(base: str, path: str, payload: dict, timeout: int, opener: urllib.request.OpenerDirector, csrf: str) -> tuple[int, dict]:
    url = base.rstrip("/") + path
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "User-Agent": "AdhyaSmokeAudit/1.0",
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
        },
        method="POST",
    )
    with opener.open(req, timeout=timeout) as res:
        raw = res.read(200_000).decode("utf-8", "replace")
        return getattr(res, "status", 0), json.loads(raw or "{}")


def check_login(base: str, label: str, email: str, password: str, portal: str, expected_roles: set[str], timeout: int) -> tuple[bool, str]:
    opener = make_opener()
    try:
        status, csrf_data = get_json(base, "/api/auth/csrf", timeout, opener)
        csrf = csrf_data.get("csrf_token")
        if status != 200 or not csrf:
            return False, f"{label}: csrf failed ({status})"
        status, data = post_json(
            base,
            "/api/auth/login",
            {"email": email, "password": password, "portal": portal},
            timeout,
            opener,
            csrf,
        )
        if status != 200:
            return False, f"{label}: login failed ({status}) {data.get('error', '')}"
        user = data.get("user") or {}
        role = user.get("role")
        if role not in expected_roles:
            return False, f"{label}: unexpected role {role!r}"
        me_status, me = get_json(base, "/api/auth/me", timeout, opener)
        if me_status != 200 or me.get("email", "").lower() != email.lower():
            return False, f"{label}: /api/auth/me mismatch ({me_status})"
        if role == "admin":
            stats_status, _stats = get_json(base, "/api/admin/stats", timeout, opener)
            if stats_status != 200:
                return False, f"{label}: admin stats failed ({stats_status})"
        elif role == "staff":
            orders_status, _orders = get_json(base, "/api/admin/orders", timeout, opener)
            if orders_status != 200:
                return False, f"{label}: staff orders failed ({orders_status})"
        else:
            orders_status, _orders = get_json(base, "/api/orders/my", timeout, opener)
            if orders_status != 200:
                return False, f"{label}: customer orders failed ({orders_status})"
        return True, f"{label}: login ok as {role}"
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8", "replace") or "{}").get("error", "")
        except Exception:
            detail = exc.reason
        return False, f"{label}: {exc.code} {detail}"
    except Exception as exc:
        return False, f"{label}: {exc}"


def check_static_markers() -> list[str]:
    failures: list[str] = []
    for rel, markers in STATIC_MARKERS.items():
        path = ROOT / rel
        if not path.exists():
            failures.append(f"{rel}: missing file")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for marker in markers:
            if marker not in text:
                failures.append(f"{rel}: missing marker {marker!r}")
    return failures


def check_sitemap(base: str, timeout: int) -> tuple[bool, str]:
    try:
        req = urllib.request.Request(base.rstrip("/") + "/sitemap.xml", headers={"User-Agent": "AdhyaSmokeAudit/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read(1_500_000)
        root = ET.fromstring(raw)
        ns = {
            "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "image": "http://www.google.com/schemas/sitemap-image/1.1",
        }
        urls = root.findall("sm:url", ns)
        images = root.findall(".//image:image", ns)
        if not urls:
            return False, "sitemap has no URL entries"
        return True, f"{len(urls)} URLs, {len(images)} image entries"
    except Exception as exc:
        return False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:5000", help="Base URL to audit")
    parser.add_argument("--timeout", type=int, default=12, help="HTTP timeout in seconds")
    parser.add_argument("--warn-seconds", type=float, default=2.5, help="Warn when a route/API/static request is slower than this many seconds")
    parser.add_argument("--admin-email", default=os.environ.get("ADHYA_ADMIN_EMAIL", ""))
    parser.add_argument("--admin-password", default=os.environ.get("ADHYA_ADMIN_PASSWORD", ""))
    parser.add_argument("--staff-email", default=os.environ.get("ADHYA_STAFF_EMAIL", ""))
    parser.add_argument("--staff-password", default=os.environ.get("ADHYA_STAFF_PASSWORD", ""))
    parser.add_argument("--customer-email", default=os.environ.get("ADHYA_CUSTOMER_EMAIL", ""))
    parser.add_argument("--customer-password", default=os.environ.get("ADHYA_CUSTOMER_PASSWORD", ""))
    args = parser.parse_args()

    failures: list[str] = []
    warnings: list[str] = []
    print(f"Website smoke audit: {args.base}")
    print("=" * 72)

    for path in PUBLIC_ROUTES:
        ok, detail, slow = request_url(args.base, path, args.timeout, warn_seconds=args.warn_seconds)
        print(f"{'PASS' if ok else 'FAIL'} route {path}: {detail}{' SLOW' if slow else ''}")
        if not ok:
            failures.append(f"route {path}: {detail}")
        elif slow:
            warnings.append(f"slow route {path}: {detail}")

    for path in PUBLIC_APIS:
        ok, detail, slow = request_url(args.base, path, args.timeout, warn_seconds=args.warn_seconds)
        print(f"{'PASS' if ok else 'FAIL'} api {path}: {detail}{' SLOW' if slow else ''}")
        if not ok:
            failures.append(f"api {path}: {detail}")
        elif slow:
            warnings.append(f"slow api {path}: {detail}")

    for path in STATIC_ASSETS:
        ok, detail, slow = request_url(args.base, path, args.timeout, warn_seconds=args.warn_seconds)
        print(f"{'PASS' if ok else 'FAIL'} static {path}: {detail}{' SLOW' if slow else ''}")
        if not ok:
            failures.append(f"static {path}: {detail}")
        elif slow:
            warnings.append(f"slow static {path}: {detail}")

    for failure in check_static_markers():
        print(f"FAIL static {failure}")
        failures.append(f"static {failure}")

    ok, detail = check_sitemap(args.base, args.timeout)
    print(f"{'PASS' if ok else 'FAIL'} sitemap xml: {detail}")
    if not ok:
        failures.append(f"sitemap xml: {detail}")

    login_checks = [
        ("admin", args.admin_email, args.admin_password, "staff", {"admin"}),
        ("staff", args.staff_email, args.staff_password, "staff", {"staff", "admin"}),
        ("customer", args.customer_email, args.customer_password, "customer", {"customer"}),
    ]
    for label, email, password, portal, roles in login_checks:
        if not email and not password:
            print(f"SKIP login {label}: credentials not provided")
            continue
        if not email or not password:
            print(f"SKIP login {label}: incomplete credentials; provide both email and password to test this login")
            continue
        ok, detail = check_login(args.base, label, email, password, portal, roles, args.timeout)
        print(f"{'PASS' if ok else 'FAIL'} login {detail}")
        if not ok:
            failures.append(f"login {detail}")

    if warnings:
        print("=" * 72)
        print("WARNINGS:")
        for warning in warnings:
            print(f"- {warning}")

    if not failures:
        print("=" * 72)
        print("PASS: public pages, public APIs, and critical JS markers look good.")
        return 0

    print("=" * 72)
    print("FAILURES:")
    for failure in failures:
        print(f"- {failure}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
