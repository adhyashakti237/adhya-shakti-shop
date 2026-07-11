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


def audit_database_assets(failures: list[str]):
    if not DB_PATH.exists():
        status("database", False, f"missing {DB_PATH}", failures, fail=True)
        return
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT id,name,images,stock,is_active FROM products WHERE IFNULL(is_active,1)=1 ORDER BY name"
    ).fetchall()
    no_image = []
    missing = []
    invalid = []
    used_uploads = set()
    for row in rows:
        images = [str(x).strip() for x in load_json_list(row["images"]) if str(x).strip()]
        if not images:
            no_image.append(row["name"])
            continue
        for url in images:
            if url.startswith("/uploads/"):
                used_uploads.add(os.path.basename(url))
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
                large_uploads.append((path.name, size))
    large_uploads.sort(key=lambda x: x[1], reverse=True)
    status("large upload images", not large_uploads, str(len(large_uploads)), failures)
    for name, size in large_uploads[:8]:
        print(f"  {name}: {size_label(size)}")

    unused_uploads = []
    if UPLOADS_DIR.exists():
        for path in UPLOADS_DIR.iterdir():
            if path.is_file() and path.name not in used_uploads:
                unused_uploads.append(path.name)
    status("unused public uploads", True, str(len(unused_uploads)), failures)
    if unused_uploads[:8]:
        print("  review sample:", "; ".join(unused_uploads[:8]))


def audit_static_assets(failures: list[str]):
    large_static = []
    for base in [CLIENT_DIR / "images"]:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                size = path.stat().st_size
                if size > MAX_STATIC_IMAGE_WARN:
                    large_static.append((str(path.relative_to(ROOT)), size))
    large_static.sort(key=lambda x: x[1], reverse=True)
    status("large bundled images", not large_static, str(len(large_static)), failures)
    for rel, size in large_static[:8]:
        print(f"  {rel}: {size_label(size)}")

    for rel in ["client/index.html", "client/admin.html", "client/accounts/index.html"]:
        path = ROOT / rel
        if not path.exists():
            status(rel, False, "missing", failures, fail=True)
            continue
        size = path.stat().st_size
        status(rel, size <= MAX_SHELL_WARN, size_label(size), failures)


def read_url(base: str, path: str, timeout: int) -> bytes:
    req = urllib.request.Request(base.rstrip("/") + path, headers={"User-Agent": "AdhyaPerformanceAudit/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read(1_500_000)


def audit_live(base: str, timeout: int, failures: list[str]):
    if not base:
        print("SKIP live checks: no --base supplied")
        return
    try:
        sitemap = read_url(base, "/sitemap.xml", timeout)
        root = ET.fromstring(sitemap)
        ns = {
            "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "image": "http://www.google.com/schemas/sitemap-image/1.1",
        }
        urls = root.findall("sm:url", ns)
        images = root.findall(".//image:image", ns)
        status("live sitemap URLs", bool(urls), str(len(urls)), failures, fail=not urls)
        status("live sitemap image entries", bool(images), str(len(images)), failures)
    except Exception as exc:
        status("live sitemap", False, str(exc), failures, fail=True)

    for path in ["/", "/products", "/faq", "/robots.txt"]:
        try:
            body = read_url(base, path, timeout)
            status(f"live {path}", bool(body), f"{len(body)} bytes", failures, fail=not body)
        except urllib.error.HTTPError as exc:
            status(f"live {path}", False, f"{exc.code} {exc.reason}", failures, fail=True)
        except Exception as exc:
            status(f"live {path}", False, str(exc), failures, fail=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="", help="Optional live/local base URL, e.g. https://adhyashaktishop.com")
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args()

    failures: list[str] = []
    print("Performance and asset audit")
    print("=" * 72)
    audit_database_assets(failures)
    print("-" * 72)
    audit_static_assets(failures)
    print("-" * 72)
    audit_live(args.base, args.timeout, failures)
    print("=" * 72)
    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("PASS: performance and asset checks completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
