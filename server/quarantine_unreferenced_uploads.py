import argparse
import datetime
import json
import os
import re
import shutil
import sqlite3

from security_utils import is_safe_public_upload_url, is_safe_stored_filename


SERVER_DIR = os.path.abspath(os.path.dirname(__file__))
BASE_DIR = os.path.abspath(os.path.join(SERVER_DIR, '..'))
DEFAULT_DB = os.path.join(SERVER_DIR, 'ecommerce.db')
DEFAULT_UPLOADS = os.path.join(BASE_DIR, 'uploads')
DEFAULT_QUARANTINE_BASE = os.path.join(SERVER_DIR, 'quarantined_uploads')
UPLOAD_REF_RE = re.compile(r'/uploads/([^"\'\s<>),]+)', re.IGNORECASE)


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def table_names(conn):
    return [
        row['name'] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]


def text_columns(conn, table):
    cols = []
    for row in conn.execute(f'PRAGMA table_info("{table}")').fetchall():
        decl = (row['type'] or '').upper()
        if any(kind in decl for kind in ('CHAR', 'CLOB', 'TEXT', 'JSON')) or not decl:
            cols.append(row['name'])
    return cols


def referenced_uploads(conn):
    refs = set()
    for table in table_names(conn):
        cols = text_columns(conn, table)
        if not cols:
            continue
        quoted = ', '.join(f'"{c}"' for c in cols)
        try:
            for row in conn.execute(f'SELECT {quoted} FROM "{table}"').fetchall():
                for col in cols:
                    value = row[col]
                    if value is None:
                        continue
                    text = str(value)
                    for match in UPLOAD_REF_RE.finditer(text):
                        refs.add(os.path.basename(match.group(1)))
                    if text.startswith('[') or text.startswith('{'):
                        try:
                            stack = [json.loads(text)]
                            while stack:
                                cur = stack.pop()
                                if isinstance(cur, dict):
                                    stack.extend(cur.values())
                                elif isinstance(cur, list):
                                    stack.extend(cur)
                                elif isinstance(cur, str) and cur.startswith('/uploads/'):
                                    refs.add(os.path.basename(cur))
                        except Exception:
                            pass
        except sqlite3.Error:
            continue
    return refs


def classify_uploads(upload_dir, refs, include_safe_unused=True):
    unsafe = []
    safe_unused = []
    safe_used = []
    if not os.path.isdir(upload_dir):
        return unsafe, safe_unused, safe_used
    for name in sorted(os.listdir(upload_dir)):
        full = os.path.join(upload_dir, name)
        if not os.path.isfile(full):
            continue
        safe_name = is_safe_stored_filename(name) and is_safe_public_upload_url(f'/uploads/{name}')
        if not safe_name:
            unsafe.append(name)
        elif name in refs:
            safe_used.append(name)
        elif include_safe_unused:
            safe_unused.append(name)
    return unsafe, safe_unused, safe_used


def move_to_quarantine(upload_dir, quarantine_dir, names):
    os.makedirs(quarantine_dir, exist_ok=True)
    moved = []
    errors = []
    for name in names:
        src = os.path.abspath(os.path.join(upload_dir, name))
        dst = os.path.abspath(os.path.join(quarantine_dir, name))
        try:
            if os.path.commonpath([os.path.abspath(upload_dir), src]) != os.path.abspath(upload_dir):
                raise ValueError('Upload path escaped upload directory')
            if not os.path.isfile(src):
                raise FileNotFoundError(name)
            if os.path.exists(dst):
                base, ext = os.path.splitext(name)
                dst = os.path.join(
                    quarantine_dir,
                    f'{base}-{datetime.datetime.now(datetime.UTC).strftime("%H%M%S")}{ext}',
                )
            shutil.move(src, dst)
            moved.append({'filename': name, 'to': dst})
        except Exception as exc:
            errors.append({'filename': name, 'error': str(exc)})
    return moved, errors


def main():
    parser = argparse.ArgumentParser(description='Quarantine unreferenced or unsafe public upload files.')
    parser.add_argument('--db', default=DEFAULT_DB)
    parser.add_argument('--uploads', default=DEFAULT_UPLOADS)
    parser.add_argument('--quarantine-base', default=DEFAULT_QUARANTINE_BASE)
    parser.add_argument('--commit', action='store_true', help='Move files. Omit for dry run.')
    parser.add_argument('--unsafe-only', action='store_true', help='Only quarantine unsafe filenames, not safe unused files.')
    args = parser.parse_args()

    db_path = os.path.abspath(args.db)
    upload_dir = os.path.abspath(args.uploads)
    stamp = datetime.datetime.now(datetime.UTC).strftime('%Y%m%d_%H%M%S')
    quarantine_dir = os.path.abspath(os.path.join(args.quarantine_base, stamp))

    with connect(db_path) as conn:
        refs = referenced_uploads(conn)

    unsafe, safe_unused, safe_used = classify_uploads(upload_dir, refs, include_safe_unused=not args.unsafe_only)
    candidates = unsafe + safe_unused

    print('Upload quarantine audit')
    print('=' * 72)
    print(f"Mode: {'COMMIT' if args.commit else 'DRY RUN'}")
    print(f'Database: {db_path}')
    print(f'Uploads: {upload_dir}')
    print(f'Quarantine: {quarantine_dir}')
    print(f'Referenced upload files: {len(refs)}')
    print(f'Safe referenced files kept: {len(safe_used)}')
    print(f'Unsafe filename candidates: {len(unsafe)}')
    print(f'Safe unused candidates: {len(safe_unused)}')
    print(f'Total candidates: {len(candidates)}')

    for label, names in (('Unsafe filename candidates', unsafe), ('Safe unused candidates', safe_unused)):
        print()
        print(label)
        print('-' * len(label))
        if not names:
            print('None')
        else:
            for name in names[:80]:
                print(f'- {name}')
            if len(names) > 80:
                print(f'... {len(names) - 80} more')

    if not args.commit:
        print()
        print('Dry run complete. Re-run with --commit to move candidates into quarantine.')
        return 0

    moved, errors = move_to_quarantine(upload_dir, quarantine_dir, candidates)
    print()
    print(f'Moved: {len(moved)}')
    print(f'Errors: {len(errors)}')
    if errors:
        for err in errors[:20]:
            print(f"ERROR {err['filename']}: {err['error']}")
        return 1
    print('Commit complete. Files are quarantined, not deleted.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
