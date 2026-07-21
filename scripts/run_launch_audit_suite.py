#!/usr/bin/env python3
"""Run the read-only launch audit suite in one command.

This is the after-upload confidence check. It runs syntax checks, public smoke
checks, performance/asset checks, and launch-critical database/route checks,
then writes one summary JSON plus the raw output from every step.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def count_markers(text: str) -> dict:
    lines = text.splitlines()
    warnings = [line for line in lines if line.startswith("WARN") or line.startswith("- slow ")]
    failures = [line for line in lines if line.startswith("FAIL") or line.startswith("- route ") or line.startswith("- api ") or line.startswith("- static ") or line.startswith("- login ")]
    return {
        "warnings": len(warnings),
        "failures": len(failures),
        "warning_lines": warnings[:30],
        "failure_lines": failures[:30],
    }


def run_step(name: str, command: list[str], out_dir: Path, env: dict) -> dict:
    started = dt.datetime.now()
    print(f"RUN {name}")
    print("  " + " ".join(command))
    proc = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    elapsed = (dt.datetime.now() - started).total_seconds()
    output = proc.stdout or ""
    output_path = out_dir / f"{name}.txt"
    output_path.write_text(output, encoding="utf-8", errors="replace")
    markers = count_markers(output)
    ok = proc.returncode == 0
    print(f"{'PASS' if ok else 'FAIL'} {name}: exit {proc.returncode}, {elapsed:.1f}s, warnings {markers['warnings']}, failures {markers['failures']}")
    return {
        "name": name,
        "command": command,
        "returncode": proc.returncode,
        "ok": ok,
        "seconds": elapsed,
        "output_file": rel(output_path),
        **markers,
    }


def script_supports_arg(script: str, option: str) -> bool:
    try:
        proc = subprocess.run(
            [sys.executable, script, "--help"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=10,
        )
    except Exception:
        return False
    return option in (proc.stdout or "")


def discover_js_targets() -> list[str]:
    targets = []
    for base in [ROOT / "client" / "js", ROOT / "client" / "accounts" / "js"]:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.js")):
            targets.append(rel(path))
    return targets


def run_js_syntax_step(out_dir: Path, env: dict) -> dict:
    name = "javascript_syntax"
    output_path = out_dir / f"{name}.txt"
    node = shutil.which("node")
    targets = discover_js_targets()
    started = dt.datetime.now()
    print(f"RUN {name}")
    if not node:
        output = "WARN node executable not found; skipped JavaScript syntax checks.\n"
        output_path.write_text(output, encoding="utf-8")
        markers = count_markers(output)
        print(f"WARN {name}: node not found, skipped {len(targets)} files")
        return {
            "name": name,
            "command": ["node", "--check", "<client js files>"],
            "returncode": 0,
            "ok": True,
            "seconds": (dt.datetime.now() - started).total_seconds(),
            "output_file": rel(output_path),
            "checked_files": 0,
            "skipped_files": len(targets),
            **markers,
        }

    lines = [f"Node: {node}", f"Files: {len(targets)}"]
    failures = []
    for target in targets:
        proc = subprocess.run(
            [node, "--check", target],
            cwd=ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        if proc.returncode == 0:
            lines.append(f"PASS {target}")
        else:
            lines.append(f"FAIL {target}")
            if proc.stdout:
                lines.append(proc.stdout.rstrip())
            failures.append(target)
    if failures:
        lines.append("FAILURES:")
        lines.extend(f"- {target}" for target in failures)
    output = "\n".join(lines) + "\n"
    output_path.write_text(output, encoding="utf-8", errors="replace")
    markers = count_markers(output)
    ok = not failures
    elapsed = (dt.datetime.now() - started).total_seconds()
    print(f"{'PASS' if ok else 'FAIL'} {name}: checked {len(targets)} files, {len(failures)} failures, {elapsed:.1f}s")
    return {
        "name": name,
        "command": [node, "--check", "<client js files>"],
        "returncode": 0 if ok else 1,
        "ok": ok,
        "seconds": elapsed,
        "output_file": rel(output_path),
        "checked_files": len(targets),
        "skipped_files": 0,
        **markers,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:5000", help="Local or live base URL to audit")
    parser.add_argument("--timeout", type=int, default=12)
    parser.add_argument("--warn-seconds", type=float, default=2.5)
    parser.add_argument("--out-dir", default="", help="Folder for suite output. Default: audit_reports/launch_suite_TIMESTAMP")
    parser.add_argument("--skip-js", action="store_true", help="Skip JavaScript syntax checks")
    parser.add_argument("--skip-smoke", action="store_true", help="Skip public website smoke checks")
    parser.add_argument("--skip-performance", action="store_true", help="Skip performance/asset checks")
    parser.add_argument("--skip-launch", action="store_true", help="Skip launch confidence checks")
    args = parser.parse_args()

    out_dir = Path(args.out_dir) if args.out_dir else ROOT / "audit_reports" / f"launch_suite_{now_stamp()}"
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    summary = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "base": args.base,
        "out_dir": rel(out_dir),
        "steps": [],
    }

    print("Launch audit suite")
    print("=" * 72)
    print("Base:", args.base)
    print("Output:", out_dir)

    syntax_targets = [
        "server/app.py",
        "server/accounts_module.py",
        "server/security_utils.py",
        "scripts/website_smoke_audit.py",
        "scripts/performance_asset_audit.py",
        "scripts/launch_confidence_audit.py",
        "scripts/frontend_asset_integrity.py",
        "scripts/cleanup_historical_data_warnings.py",
        "scripts/update_product_costs_from_csv.py",
        "scripts/optimize_product_images.py",
    ]
    existing_targets = [target for target in syntax_targets if (ROOT / target).exists()]
    summary["steps"].append(run_step(
        "python_compile",
        [sys.executable, "-m", "py_compile", *existing_targets],
        out_dir,
        env,
    ))

    if not args.skip_js:
        summary["steps"].append(run_js_syntax_step(out_dir, env))

    summary["steps"].append(run_step(
        "frontend_assets",
        [
            sys.executable,
            "scripts/frontend_asset_integrity.py",
            "--report-json",
            str(out_dir / "frontend_assets.json"),
        ],
        out_dir,
        env,
    ))

    if not args.skip_smoke:
        smoke_cmd = [
            sys.executable,
            "scripts/website_smoke_audit.py",
            "--base",
            args.base,
            "--timeout",
            str(args.timeout),
        ]
        if script_supports_arg("scripts/website_smoke_audit.py", "--warn-seconds"):
            smoke_cmd.extend(["--warn-seconds", str(args.warn_seconds)])
        else:
            print("WARN website_smoke_audit.py does not support --warn-seconds; running without timing warning option")
        summary["steps"].append(run_step(
            "website_smoke",
            smoke_cmd,
            out_dir,
            env,
        ))

    if not args.skip_performance:
        summary["steps"].append(run_step(
            "performance_assets",
            [
                sys.executable,
                "scripts/performance_asset_audit.py",
                "--base",
                args.base,
                "--timeout",
                str(args.timeout),
                "--warn-seconds",
                str(args.warn_seconds),
                "--report-json",
                str(out_dir / "performance_assets.json"),
            ],
            out_dir,
            env,
        ))

    if not args.skip_launch:
        summary["steps"].append(run_step(
            "launch_confidence",
            [
                sys.executable,
                "scripts/launch_confidence_audit.py",
                "--report-json",
                str(out_dir / "launch_confidence.json"),
            ],
            out_dir,
            env,
        ))

    summary["failed_steps"] = [step["name"] for step in summary["steps"] if not step["ok"]]
    summary["warning_count"] = sum(step["warnings"] for step in summary["steps"])
    summary["failure_count"] = sum(step["failures"] for step in summary["steps"])
    summary["passed"] = not summary["failed_steps"]

    summary_path = out_dir / "launch_audit_suite_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("=" * 72)
    print(f"Summary: {summary_path}")
    print(f"Warnings: {summary['warning_count']}")
    print(f"Failed steps: {', '.join(summary['failed_steps']) if summary['failed_steps'] else 'none'}")
    if summary["passed"]:
        print("PASS: launch audit suite completed.")
        return 0
    print("FAIL: one or more launch audit suite steps failed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
