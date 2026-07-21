#!/usr/bin/env python3
"""Read-only frontend asset integrity audit.

Checks that local scripts/styles/images referenced by the storefront, admin,
and accounts HTML shells exist, and catches severe CSS structure issues that can
break mobile layouts without producing a Python or JavaScript error.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / "client"
LOCAL_URL_RE = re.compile(r"url\((['\"]?)(/[^)'\"\s]+)\1\)")


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[dict] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key.lower(): value or "" for key, value in attrs}
        if tag == "script" and data.get("src"):
            self.refs.append({"tag": tag, "attr": "src", "url": data["src"]})
        elif tag == "link" and data.get("href"):
            rel = data.get("rel", "")
            if any(part in rel.lower().split() for part in ["stylesheet", "icon", "manifest"]):
                self.refs.append({"tag": tag, "attr": "href", "url": data["href"]})
        elif tag == "img" and data.get("src"):
            self.refs.append({"tag": tag, "attr": "src", "url": data["src"]})


def local_path_from_url(url: str) -> Path | None:
    text = str(url or "").strip()
    if not text or text.startswith(("http://", "https://", "data:", "mailto:", "tel:")):
        return None
    path = urlparse(text).path
    if not path.startswith("/"):
        return None
    return CLIENT_DIR.joinpath(*path.lstrip("/").split("/"))


def audit_html_assets() -> tuple[list[dict], list[dict]]:
    checked = []
    missing = []
    for html in [CLIENT_DIR / "index.html", CLIENT_DIR / "admin.html", CLIENT_DIR / "accounts" / "index.html"]:
        if not html.exists():
            missing.append({"file": str(html), "url": "", "reason": "html shell missing"})
            continue
        parser = AssetParser()
        parser.feed(html.read_text(encoding="utf-8", errors="replace"))
        for ref in parser.refs:
            path = local_path_from_url(ref["url"])
            if path is None:
                continue
            item = {"file": str(html.relative_to(ROOT)), "url": ref["url"], "path": str(path.relative_to(ROOT))}
            checked.append(item)
            if not path.exists():
                missing.append({**item, "reason": "referenced file missing"})
    return checked, missing


def strip_css_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def css_brace_report(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    no_comments = strip_css_comments(text)
    stack = []
    line = 1
    in_string: str | None = None
    escape = False
    for char in no_comments:
        if char == "\n":
            line += 1
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if in_string:
            if char == in_string:
                in_string = None
            continue
        if char in ("'", '"'):
            in_string = char
            continue
        if char == "{":
            stack.append(line)
        elif char == "}":
            if not stack:
                return {"file": str(path.relative_to(ROOT)), "ok": False, "reason": f"extra closing brace near line {line}"}
            stack.pop()
    if in_string:
        return {"file": str(path.relative_to(ROOT)), "ok": False, "reason": "unterminated string"}
    if stack:
        return {"file": str(path.relative_to(ROOT)), "ok": False, "reason": f"unclosed opening brace near line {stack[-1]}"}
    if "/*" in no_comments or "*/" in no_comments:
        return {"file": str(path.relative_to(ROOT)), "ok": False, "reason": "unterminated CSS comment"}
    return {"file": str(path.relative_to(ROOT)), "ok": True, "reason": ""}


def audit_css() -> tuple[list[dict], list[dict], list[dict]]:
    reports = []
    broken = []
    missing_urls = []
    for css in sorted(CLIENT_DIR.rglob("*.css")):
        report = css_brace_report(css)
        reports.append(report)
        if not report["ok"]:
            broken.append(report)
        text = css.read_text(encoding="utf-8", errors="replace")
        for match in LOCAL_URL_RE.finditer(text):
            url = match.group(2)
            if url.startswith(("/uploads/", "/api/")):
                continue
            path = local_path_from_url(url)
            if path is not None and not path.exists():
                missing_urls.append({"file": str(css.relative_to(ROOT)), "url": url, "path": str(path.relative_to(ROOT))})
    return reports, broken, missing_urls


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-json", default="", help="Optional path for a machine-readable report")
    args = parser.parse_args()

    checked_refs, missing_refs = audit_html_assets()
    css_reports, broken_css, missing_css_urls = audit_css()
    failures = []
    failures.extend(f"missing html asset {item['file']} -> {item['url']}" for item in missing_refs)
    failures.extend(f"css structure {item['file']}: {item['reason']}" for item in broken_css)
    failures.extend(f"missing css url {item['file']} -> {item['url']}" for item in missing_css_urls)
    report = {
        "checked_html_refs": checked_refs,
        "missing_html_refs": missing_refs,
        "css_files": css_reports,
        "broken_css": broken_css,
        "missing_css_urls": missing_css_urls,
        "failures": failures,
    }

    print("Frontend asset integrity audit")
    print("=" * 72)
    print(f"Checked HTML local asset refs: {len(checked_refs)}")
    print(f"{'PASS' if not missing_refs else 'FAIL'} missing HTML assets: {len(missing_refs)}")
    print(f"Checked CSS files: {len(css_reports)}")
    print(f"{'PASS' if not broken_css else 'FAIL'} CSS structure issues: {len(broken_css)}")
    print(f"{'PASS' if not missing_css_urls else 'FAIL'} missing CSS local urls: {len(missing_css_urls)}")
    if args.report_json:
        Path(args.report_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Report written: {args.report_json}")
    if failures:
        print("=" * 72)
        print("FAILURES:")
        for failure in failures[:50]:
            print(f"- {failure}")
        if len(failures) > 50:
            print(f"... and {len(failures) - 50} more")
        return 1
    print("=" * 72)
    print("PASS: frontend asset integrity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
