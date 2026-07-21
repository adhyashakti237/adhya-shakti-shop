#!/usr/bin/env python3
"""Read-only performance and asset health audit.

Checks the local/live deployment for image, sitemap, and static asset issues
that hurt customer experience or Google indexing. It never modifies files.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT / "server"
CLIENT_DIR = ROOT / "client"
UPLOADS_DIR = ROOT / "uploads"
DB_PATH = SERVER_DIR / "ecommerce.db"

MAX_UPLOAD_WARN = 900 * 1024
MAX_STATIC_IMAGE_WARN = 1_200 * 1024
MAX_SHELL_WARN = 260 * 1024
CODE_EXTENSIONS = {".html", ".js", ".css", ".py"}


def size_label(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / 1024:.0f} KB"


def status(label: str, ok: bool, detail: str, failures: list[str], *, fail: bool = False):
    level = "PASS" if ok else ("FAIL" if fail else "WARN")
    print(f"{level} {label}: {detail}")
    if fail and not ok:
        failures.append(f"{label}: {detail}")


def load_json_list(value: str) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def local_image_path(url: str) -> Path | None:
    text = str(url or "").strip()
    if text.startswith("/uploads/"):
        return UPLOADS_DIR / os.path.basename(text)
    if text.startswith("/images/"):
        rel = text.lstrip("/").replace("/", os.sep)
        return CLIENT_DIR / rel
    return None


def scan_code_for_asset(filename: str) -> bool:
    needle_options = {
        filename,
        f"/images/{filename}",
        f"images/{filename}",
    }
    for base in [CLIENT_DIR, SERVER_DIR, ROOT / "scripts"]:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in CODE_EXTENSIONS:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if any(needle in text for needle in needle_options):
                return True
    return False


def audit_database_assets(failures: list[str]) -> dict:
    report = {
        "active_products": 0,
        "products_without_images": [],
        "missing_product_image_files": [],
        "invalid_product_image_urls": [],
        "large_upload_images": [],
        "unused_public_uploads": [],
    }
    if not DB_PATH.exists():
        status("database", False, f"missing {DB_PATH}", failures, fail=True)
        return report
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT id,name,images,stock,is_active FROM products WHERE IFNULL(is_active,1)=1 ORDER BY name"
    ).fetchall()
    report["active_products"] = len(rows)
    no_image = []
    missing = []
    invalid = []
    used_uploads = set()
    upload_owners: dict[str, list[str]] = {}
    for row in rows:
        images = [str(x).strip() for x in load_json_list(row["images"]) if str(x).strip()]
        if not images:
            no_image.append(row["name"])
            continue
        for url in images:
            if url.startswith("/uploads/"):
                basename = os.path.basename(url)
                used_uploads.add(basename)
                upload_owners.setdefault(basename, []).append(row["name"])
            path = local_image_path(url)
            if path is None and not url.startswith(("http://", "https://")):
                invalid.append(f"{row['name']} -> {url}")
                continue
            if path is not None and not path.exists():
                missing.append(f"{row['name']} -> {url}")

    status("active products", True, str(len(rows)), failures)
    status("products without images", not no_image, str(len(no_image)), failures)
    if no_image[:8]:
        print("  sample:", "; ".join(no_image[:8]))
    status("missing product image files", not missing, str(len(missing)), failures, fail=bool(missing))
    if missing[:8]:
        print("  sample:", "; ".join(missing[:8]))
    status("invalid product image URLs", not invalid, str(len(invalid)), failures, fail=bool(invalid))
    if invalid[:8]:
        print("  sample:", "; ".join(invalid[:8]))
    report["products_without_images"] = no_image
    report["missing_product_image_files"] = missing
    report["invalid_product_image_urls"] = invalid

    large_uploads = []
    if UPLOADS_DIR.exists():
        for path in UPLOADS_DIR.iterdir():
            if not path.is_file():
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size > MAX_UPLOAD_WARN:
                owners = sorted(set(upload_owners.get(path.name, [])))
                large_uploads.append((path.name, size, owners))
    large_uploads.sort(key=lambda x: x[1], reverse=True)
    status("large upload images", not large_uploads, str(len(large_uploads)), failures)
    for name, size, owners in large_uploads[:8]:
        owner_text = f" | products: {'; '.join(owners[:2])}" if owners else " | unused or not tied to active products"
        more = f" (+{len(owners) - 2} more)" if len(owners) > 2 else ""
        print(f"  {name}: {size_label(size)}{owner_text}{more}")
    if large_uploads:
        print("  next safe step: python scripts/optimize_product_images.py --threshold-kb 900 --limit 10 --report-json /home/adhyashakti/image_opt_dry_run.json")
    report["large_upload_images"] = [
        {"file": name, "bytes": size, "products": owners}
        for name, size, owners in large_uploads
    ]

    unused_uploads = []
    if UPLOADS_DIR.exists():
        for path in UPLOADS_DIR.iterdir():
            if path.is_file() and path.name not in used_uploads:
                unused_uploads.append(path.name)
    status("unused public uploads", True, str(len(unused_uploads)), failures)
    if unused_uploads[:8]:
        print("  review sample:", "; ".join(unused_uploads[:8]))
    report["unused_public_uploads"] = unused_uploads
    return report


def audit_static_assets(failures: list[str]) -> dict:
    report = {
        "large_referenced_bundled_images": [],
        "large_unreferenced_bundled_images": [],
        "shell_sizes": {},
    }
    large_referenced = []
    large_unreferenced = []
    for base in [CLIENT_DIR / "images"]:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                size = path.stat().st_size
                if size > MAX_STATIC_IMAGE_WARN:
                    item = (str(path.relative_to(ROOT)), size)
                    if scan_code_for_asset(path.name):
                        large_referenced.append(item)
                    else:
                        large_unreferenced.append(item)
    large_referenced.sort(key=lambda x: x[1], reverse=True)
    large_unreferenced.sort(key=lambda x: x[1], reverse=True)
    status("large referenced bundled images", not large_referenced, str(len(large_referenced)), failures)
    for rel, size in large_referenced[:8]:
        print(f"  {rel}: {size_label(size)}")
    status("large unreferenced bundled images", True, str(len(large_unreferenced)), failures)
    for rel, size in large_unreferenced[:8]:
        print(f"  review only: {rel}: {size_label(size)}")
    report["large_referenced_bundled_images"] = [
        {"file": rel, "bytes": size} for rel, size in large_referenced
    ]
    report["large_unreferenced_bundled_images"] = [
        {"file": rel, "bytes": size} for rel, size in large_unreferenced
    ]

    for rel in ["client/index.html", "client/admin.html", "client/accounts/index.html"]:
        path = ROOT / rel
        if not path.exists():
            status(rel, False, "missing", failures, fail=True)
            continue
        size = path.stat().st_size
        status(rel, size <= MAX_SHELL_WARN, size_label(size), failures)
        report["shell_sizes"][rel] = size
    return report


def read_url(base: str, path: str, timeout: int) -> tuple[bytes, float]:
    req = urllib.request.Request(base.rstrip("/") + path, headers={"User-Agent": "AdhyaPerformanceAudit/1.0"})
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = res.read(1_500_000)
    return body, time.perf_counter() - start


def audit_live(base: str, timeout: int, warn_seconds: float, failures: list[str]) -> dict:
    report = {"base": base, "sitemap_urls": 0, "sitemap_images": 0, "routes": []}
    if not base:
        print("SKIP live checks: no --base supplied")
        return report
    try:
        sitemap, elapsed = read_url(base, "/sitemap.xml", timeout)
        root = ET.fromstring(sitemap)
        ns = {
            "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "image": "http://www.google.com/schemas/sitemap-image/1.1",
        }
        urls = root.findall("sm:url", ns)
        images = root.findall(".//image:image", ns)
        report["sitemap_urls"] = len(urls)
        report["sitemap_images"] = len(images)
        status("live sitemap URLs", bool(urls), str(len(urls)), failures, fail=not urls)
        status("live sitemap image entries", bool(images), str(len(images)), failures)
        status("live sitemap speed", elapsed <= warn_seconds, f"{elapsed:.2f}s", failures)
    except Exception as exc:
        status("live sitemap", False, str(exc), failures, fail=True)

    for path in [
        "/",
        "/products",
        "/jewelry",
        "/custom-printing",
        "/faq",
        "/contact",
        "/robots.txt",
        "/api/products?per_page=12",
        "/api/category-tree",
        "/api/settings",
    ]:
        try:
            body, elapsed = read_url(base, path, timeout)
            report["routes"].append({"path": path, "ok": True, "bytes": len(body), "seconds": elapsed})
            status(f"live {path}", bool(body), f"{len(body)} bytes", failures, fail=not body)
            status(f"live {path} speed", elapsed <= warn_seconds, f"{elapsed:.2f}s", failures)
        except urllib.error.HTTPError as exc:
            report["routes"].append({"path": path, "ok": False, "error": f"{exc.code} {exc.reason}"})
            status(f"live {path}", False, f"{exc.code} {exc.reason}", failures, fail=True)
        except Exception as exc:
            report["routes"].append({"path": path, "ok": False, "error": str(exc)})
            status(f"live {path}", False, str(exc), failures, fail=True)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="", help="Optional live/local base URL, e.g. https://adhyashaktishop.com")
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--warn-seconds", type=float, default=2.5, help="Warn when a live route/API is slower than this")
    parser.add_argument("--report-json", default="", help="Optional path for a machine-readable report")
    args = parser.parse_args()

    failures: list[str] = []
    report: dict = {"failures": failures}
    print("Performance and asset audit")
    print("=" * 72)
    report["database_assets"] = audit_database_assets(failures)
    print("-" * 72)
    report["static_assets"] = audit_static_assets(failures)
    print("-" * 72)
    report["live"] = audit_live(args.base, args.timeout, args.warn_seconds, failures)
    print("=" * 72)
    if args.report_json:
        Path(args.report_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Report written: {args.report_json}")
    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("PASS: performance and asset checks completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
