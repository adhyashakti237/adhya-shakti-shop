import argparse
import datetime
import hashlib
import json
import os
import sqlite3
import tempfile
import zipfile


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SERVER_DIR = os.path.join(BASE_DIR, 'server')
DEFAULT_DB = os.path.join(SERVER_DIR, 'ecommerce.db')
DEFAULT_BACKUP_DIR = os.path.join(SERVER_DIR, 'backups')
DEFAULT_UPLOADS = os.path.join(BASE_DIR, 'uploads')
DEFAULT_PRIVATE_BILLS = os.path.join(BASE_DIR, 'private_bills')
DEFAULT_CLIENT = os.path.join(BASE_DIR, 'client')
DEFAULT_RETENTION_DAYS = 7
SOURCE_ROOT_FILES = ('requirements.txt', 'package.json', 'DEPLOY_README.txt')
SOURCE_SERVER_FILES = ('app.py', 'accounts_module.py', 'backup_database.py', 'security_utils.py')
REQUIRED_TABLES = {
    'users', 'products', 'product_variants', 'orders', 'categories',
    'coupons', 'reviews', 'user_wishlist', 'settings',
    'acc_sales', 'acc_expenses', 'acc_purchases', 'acc_vendors', 'acc_attachments',
}


def add_tree(zf, root, arc_prefix):
    if not os.path.isdir(root):
        return 0
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('__pycache__', '.git')]
        for name in filenames:
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, root).replace(os.sep, '/')
            zf.write(path, f'{arc_prefix}/{rel}')
            count += 1
    return count


def dir_stats(root):
    count = 0
    size = 0
    if not os.path.isdir(root):
        return {'exists': False, 'count': 0, 'bytes': 0}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('__pycache__', '.git')]
        for name in filenames:
            path = os.path.join(dirpath, name)
            if os.path.isfile(path):
                count += 1
                size += os.path.getsize(path)
    return {'exists': True, 'count': count, 'bytes': size}


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def tree_stats(root):
    count = 0
    size = 0
    tree_hash = hashlib.sha256()
    if not os.path.isdir(root):
        return {'exists': False, 'count': 0, 'bytes': 0, 'sha256': ''}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in ('__pycache__', '.git'))
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            if not os.path.isfile(path):
                continue
            rel = os.path.relpath(path, root).replace(os.sep, '/')
            file_size = os.path.getsize(path)
            digest = file_sha256(path)
            tree_hash.update(rel.encode('utf-8') + b'\0')
            tree_hash.update(str(file_size).encode('ascii') + b'\0')
            tree_hash.update(digest.encode('ascii') + b'\0')
            count += 1
            size += file_size
    return {'exists': True, 'count': count, 'bytes': size, 'sha256': tree_hash.hexdigest()}


def _walk_tree_entries(root, arc_prefix):
    entries = []
    if not os.path.isdir(root):
        return entries
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in ('__pycache__', '.git', '.pytest_cache'))
        for name in sorted(filenames):
            if name.endswith(('.log', '.pyc', '.pyo')):
                continue
            path = os.path.join(dirpath, name)
            if not os.path.isfile(path):
                continue
            rel = os.path.relpath(path, root).replace(os.sep, '/')
            entries.append((path, f'{arc_prefix}/{rel}'))
    return entries


def source_file_entries(client_dir=DEFAULT_CLIENT):
    entries = []
    entries.extend(_walk_tree_entries(client_dir, 'client'))
    for name in SOURCE_SERVER_FILES:
        path = os.path.join(SERVER_DIR, name)
        if os.path.isfile(path):
            entries.append((path, f'server/{name}'))
    for subdir in ('middleware', 'routes'):
        entries.extend(_walk_tree_entries(os.path.join(SERVER_DIR, subdir), f'server/{subdir}'))
    for name in SOURCE_ROOT_FILES:
        path = os.path.join(BASE_DIR, name)
        if os.path.isfile(path):
            entries.append((path, name))
    seen = set()
    unique = []
    for path, arcname in sorted(entries, key=lambda item: item[1]):
        if arcname not in seen:
            seen.add(arcname)
            unique.append((path, arcname))
    return unique


def add_file_entries(zf, entries):
    count = 0
    for path, arcname in entries:
        zf.write(path, arcname)
        count += 1
    return count


def file_entries_stats(entries):
    count = 0
    size = 0
    tree_hash = hashlib.sha256()
    for path, arcname in entries:
        if not os.path.isfile(path):
            continue
        file_size = os.path.getsize(path)
        digest = file_sha256(path)
        tree_hash.update(arcname.encode('utf-8') + b'\0')
        tree_hash.update(str(file_size).encode('ascii') + b'\0')
        tree_hash.update(digest.encode('ascii') + b'\0')
        count += 1
        size += file_size
    return {'exists': bool(entries), 'count': count, 'bytes': size, 'sha256': tree_hash.hexdigest() if entries else ''}


def sqlite_backup(src_db, dest_db):
    src = sqlite3.connect(src_db)
    try:
        dest = sqlite3.connect(dest_db)
        try:
            src.backup(dest)
        finally:
            dest.close()
    finally:
        src.close()


def verify_sqlite_db(db_path):
    conn = sqlite3.connect(db_path)
    try:
        integrity = conn.execute('PRAGMA integrity_check').fetchone()[0]
        if integrity != 'ok':
            raise RuntimeError(f'SQLite integrity check failed: {integrity}')
        required_tables = {'users', 'products', 'orders', 'categories'}
        existing = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        missing = sorted(required_tables - existing)
        if missing:
            raise RuntimeError('Backup database is missing table(s): ' + ', '.join(missing))
        return True
    finally:
        conn.close()


def sqlite_integrity_report(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    report = {
        'database': os.path.abspath(db_path),
        'integrity_check': 'unknown',
        'foreign_key_issues': [],
        'missing_tables': [],
        'table_counts': {},
        'consistency': {},
        'ok': False,
    }
    try:
        report['integrity_check'] = conn.execute('PRAGMA integrity_check').fetchone()[0]
        tables = {
            row['name']
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        report['missing_tables'] = sorted(REQUIRED_TABLES - tables)
        for table in sorted(tables & REQUIRED_TABLES):
            report['table_counts'][table] = conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()['n']  # nosec B608

        report['foreign_key_issues'] = [
            dict(row)
            for row in conn.execute('PRAGMA foreign_key_check').fetchall()
        ]

        checks = {
            'products_missing_category': """
                SELECT COUNT(*) AS n FROM products p
                WHERE p.category_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id=p.category_id)
            """,
            'categories_missing_parent': """
                SELECT COUNT(*) AS n FROM categories c
                WHERE c.parent_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM categories p WHERE p.id=c.parent_id)
            """,
            'variants_missing_product': """
                SELECT COUNT(*) AS n FROM product_variants v
                WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id=v.product_id)
            """,
            'wishlist_missing_user_or_product': """
                SELECT COUNT(*) AS n FROM user_wishlist w
                WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=w.user_id)
                OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id=w.product_id)
            """,
            'reviews_missing_user_or_product': """
                SELECT COUNT(*) AS n FROM reviews r
                WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.user_id)
                OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id=r.product_id)
            """,
            'sale_items_missing_sale': """
                SELECT COUNT(*) AS n FROM acc_sale_items i
                WHERE NOT EXISTS (SELECT 1 FROM acc_sales s WHERE s.id=i.sale_id)
            """,
            'purchase_items_missing_purchase': """
                SELECT COUNT(*) AS n FROM acc_purchase_items i
                WHERE NOT EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id=i.purchase_id)
            """,
            'stock_moves_missing_product': """
                SELECT COUNT(*) AS n FROM acc_stock_moves m
                WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id=m.item_id)
            """,
            'attachments_missing_parent_record': """
                SELECT COUNT(*) AS n FROM acc_attachments a
                WHERE
                  (a.parent_type='sale' AND NOT EXISTS (SELECT 1 FROM acc_sales s WHERE s.id=a.parent_id))
                  OR (a.parent_type='expense' AND NOT EXISTS (SELECT 1 FROM acc_expenses e WHERE e.id=a.parent_id))
                  OR (a.parent_type='purchase' AND NOT EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id=a.parent_id))
                  OR a.parent_type NOT IN ('sale','expense','purchase')
            """,
        }
        for name, sql in checks.items():
            try:
                report['consistency'][name] = conn.execute(sql).fetchone()['n']
            except sqlite3.Error as exc:
                report['consistency'][name] = f'check_failed: {exc}'

        report['ok'] = (
            report['integrity_check'] == 'ok'
            and not report['missing_tables']
            and not report['foreign_key_issues']
            and all(value == 0 for value in report['consistency'].values())
        )
        return report
    finally:
        conn.close()


def verify_backup_zip(zip_path):
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            names = set(zf.namelist())
            if 'server/ecommerce.db' not in names:
                raise RuntimeError('Backup zip does not contain server/ecommerce.db')
            if 'backup_manifest.json' not in names and 'BACKUP_MANIFEST.txt' not in names:
                raise RuntimeError('Backup zip does not contain a backup manifest')
            if 'BACKUP_INTEGRITY.json' not in names:
                raise RuntimeError('Backup zip does not contain BACKUP_INTEGRITY.json')
            zf.extract('server/ecommerce.db', tmp)
        restored_db = os.path.join(tmp, 'server', 'ecommerce.db')
        verify_sqlite_db(restored_db)
        report = sqlite_integrity_report(restored_db)
        if not report['ok']:
            raise RuntimeError('Backup restore integrity report failed: ' + json.dumps(report, sort_keys=True))
    return True


def _read_zip_json(zf, name):
    try:
        with zf.open(name) as f:
            return json.loads(f.read().decode('utf-8'))
    except Exception as exc:
        return {'_parse_error': str(exc)}


def restore_drill_report(zip_path):
    report = {
        'schema': 'adhya-restore-drill-v1',
        'backup_file': os.path.basename(zip_path),
        'zip_bytes': os.path.getsize(zip_path) if os.path.exists(zip_path) else 0,
        'checked_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'ok': False,
        'checks': [],
        'archive': {},
        'database': {},
        'manifest': {},
    }

    def add_check(name, status, message, details=None):
        report['checks'].append({
            'name': name,
            'status': status,
            'message': message,
            'details': details or {},
        })

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            names = set(zf.namelist())
            file_names = [name for name in names if not name.endswith('/')]
            report['archive'] = {
                'zip_entries': len(names),
                'files': len(file_names),
                'upload_files': sum(1 for name in file_names if name.startswith('uploads/')),
                'private_bill_files': sum(1 for name in file_names if name.startswith('private_bills/')),
                'source_files': sum(
                    1 for name in file_names
                    if name.startswith('client/')
                    or (name.startswith('server/') and name != 'server/ecommerce.db')
                    or name in ('requirements.txt', 'package.json', 'DEPLOY_README.txt')
                ),
            }

            bad_file = zf.testzip()
            if bad_file:
                add_check('zip_crc', 'critical', 'Backup archive has a corrupted file', {'file': bad_file})
            else:
                add_check('zip_crc', 'ok', 'Backup archive passed ZIP integrity check')

            if 'server/ecommerce.db' in names:
                add_check('database_file', 'ok', 'Backup contains server/ecommerce.db')
                zf.extract('server/ecommerce.db', tmp)
            else:
                add_check('database_file', 'critical', 'Backup does not contain server/ecommerce.db')

            if 'backup_manifest.json' in names:
                manifest = _read_zip_json(zf, 'backup_manifest.json')
                report['manifest'] = manifest
                if manifest.get('_parse_error'):
                    add_check('manifest', 'critical', 'Backup manifest JSON could not be read', {'error': manifest['_parse_error'][:300]})
                else:
                    add_check('manifest', 'ok', 'Backup manifest JSON is readable')
            elif 'BACKUP_MANIFEST.txt' in names:
                add_check('manifest', 'ok', 'Backup has a legacy text manifest')
            else:
                add_check('manifest', 'critical', 'Backup does not contain a manifest')

            if 'BACKUP_INTEGRITY.json' in names:
                integrity = _read_zip_json(zf, 'BACKUP_INTEGRITY.json')
                if integrity.get('_parse_error'):
                    add_check('backup_integrity_file', 'critical', 'Backup integrity report could not be read', {'error': integrity['_parse_error'][:300]})
                else:
                    add_check('backup_integrity_file', 'ok', 'Backup integrity report is readable')
            else:
                add_check('backup_integrity_file', 'critical', 'Backup does not contain BACKUP_INTEGRITY.json')

        restored_db = os.path.join(tmp, 'server', 'ecommerce.db')
        if os.path.exists(restored_db):
            try:
                verify_sqlite_db(restored_db)
                db_report = sqlite_integrity_report(restored_db)
                report['database'] = {
                    'integrity_check': db_report['integrity_check'],
                    'foreign_key_issue_count': len(db_report['foreign_key_issues']),
                    'missing_tables': db_report['missing_tables'],
                    'table_counts': db_report['table_counts'],
                    'consistency': db_report['consistency'],
                    'ok': db_report['ok'],
                }
                if db_report['ok']:
                    add_check('database_restore', 'ok', 'Database copy restored in a temporary folder and passed integrity checks')
                else:
                    add_check('database_restore', 'critical', 'Restored database copy has integrity or consistency issues', {
                        'integrity_check': db_report['integrity_check'],
                        'missing_tables': db_report['missing_tables'],
                        'foreign_key_issues': len(db_report['foreign_key_issues']),
                        'consistency': db_report['consistency'],
                    })
            except Exception as exc:
                add_check('database_restore', 'critical', 'Restored database copy failed validation', {'error': str(exc)[:500]})

    report['ok'] = not any(check['status'] == 'critical' for check in report['checks'])
    return report


def prune_old_backups(out_dir, keep):
    if not keep or keep <= 0 or not os.path.isdir(out_dir):
        return 0
    backups = [
        os.path.join(out_dir, name)
        for name in os.listdir(out_dir)
        if name.startswith('adhya_backup_') and name.endswith('.zip')
        and os.path.isfile(os.path.join(out_dir, name))
    ]
    backups.sort(key=os.path.getmtime, reverse=True)
    removed = 0
    for path in backups[keep:]:
        try:
            os.remove(path)
            removed += 1
        except OSError:
            pass
    return removed


def prune_expired_backups(out_dir, retention_days=DEFAULT_RETENTION_DAYS):
    if not retention_days or retention_days <= 0 or not os.path.isdir(out_dir):
        return 0
    backup_root = os.path.abspath(out_dir)
    backups = [
        os.path.abspath(os.path.join(out_dir, name))
        for name in os.listdir(out_dir)
        if name.startswith('adhya_backup_') and name.endswith('.zip')
        and os.path.isfile(os.path.join(out_dir, name))
    ]
    if not backups:
        return 0
    newest = max(backups, key=os.path.getmtime)
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=int(retention_days))
    removed = 0
    for path in backups:
        if os.path.abspath(path) == os.path.abspath(newest):
            continue
        try:
            if os.path.commonpath([backup_root, os.path.abspath(path)]) != backup_root:
                continue
            modified_at = datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc)
            if modified_at < cutoff:
                os.remove(path)
                removed += 1
        except OSError:
            pass
    return removed


def create_backup(
    db=DEFAULT_DB,
    out_dir=DEFAULT_BACKUP_DIR,
    uploads=DEFAULT_UPLOADS,
    private_bills=DEFAULT_PRIVATE_BILLS,
    skip_files=False,
    skip_source=False,
    verify=False,
    keep=30,
    retention_days=DEFAULT_RETENTION_DAYS,
):
    if not os.path.exists(db):
        raise FileNotFoundError(f'Database not found: {db}')

    os.makedirs(out_dir, exist_ok=True)
    created = datetime.datetime.now(datetime.timezone.utc)
    stamp = created.strftime('%Y%m%d_%H%M%S')
    zip_path = os.path.join(out_dir, f'adhya_backup_{stamp}.zip')

    with tempfile.TemporaryDirectory() as tmp:
        db_copy = os.path.join(tmp, 'ecommerce.db')
        sqlite_backup(db, db_copy)
        report = sqlite_integrity_report(db_copy)
        if not report['ok']:
            raise RuntimeError('Database integrity failed; backup was not written: ' + json.dumps(report, sort_keys=True))

        upload_stats = {'exists': os.path.isdir(uploads), 'count': 0, 'bytes': 0, 'sha256': ''}
        bill_stats = {'exists': os.path.isdir(private_bills), 'count': 0, 'bytes': 0, 'sha256': ''}
        if not skip_files:
            upload_stats = tree_stats(uploads)
            bill_stats = tree_stats(private_bills)
        source_entries = [] if skip_source else source_file_entries()
        source_stats = file_entries_stats(source_entries)

        db_stats = {
            'path': os.path.abspath(db),
            'bytes': os.path.getsize(db_copy),
            'sha256': file_sha256(db_copy),
            'integrity_check': report['integrity_check'],
            'foreign_key_issue_count': len(report['foreign_key_issues']),
            'missing_tables': report['missing_tables'],
        }
        manifest_json = {
            'schema': 'adhya-backup-manifest-v1',
            'created_utc': created.isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'backup_file': os.path.basename(zip_path),
            'database': db_stats,
            'uploads': upload_stats,
            'private_bills': bill_stats,
            'source_files': source_stats,
            'included_paths': (
                ['server/ecommerce.db']
                + ([] if skip_files else ['uploads/', 'private_bills/'])
                + ([] if skip_source else ['client/', 'server/*.py', 'server/middleware/', 'server/routes/', 'requirements.txt', 'package.json'])
            ),
            'excluded': ['environment files', 'secrets', '__pycache__', '.git', 'logs', 'cache'],
            'skip_files': bool(skip_files),
            'skip_source': bool(skip_source),
        }

        with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_copy, 'server/ecommerce.db')
            upload_count = 0 if skip_files else add_tree(zf, uploads, 'uploads')
            bill_count = 0 if skip_files else add_tree(zf, private_bills, 'private_bills')
            source_count = 0 if skip_source else add_file_entries(zf, source_entries)
            report['uploads'] = upload_stats
            report['private_bills'] = bill_stats
            report['source_files'] = source_stats
            report['skip_files'] = bool(skip_files)
            report['skip_source'] = bool(skip_source)
            manifest = (
                f'created_utc={manifest_json["created_utc"]}\n'
                f'database={os.path.abspath(db)}\n'
                f'database_sha256={db_stats["sha256"]}\n'
                f'uploads_count={upload_count}\n'
                f'uploads_bytes={upload_stats["bytes"]}\n'
                f'uploads_sha256={upload_stats["sha256"]}\n'
                f'private_bills_count={bill_count}\n'
                f'private_bills_bytes={bill_stats["bytes"]}\n'
                f'private_bills_sha256={bill_stats["sha256"]}\n'
                f'source_files_count={source_count}\n'
                f'source_files_bytes={source_stats["bytes"]}\n'
                f'source_files_sha256={source_stats["sha256"]}\n'
                'excluded=environment files, secrets, __pycache__, .git, logs, cache\n'
            )
            zf.writestr('BACKUP_MANIFEST.txt', manifest)
            zf.writestr('backup_manifest.json', json.dumps(manifest_json, indent=2, sort_keys=True))
            zf.writestr('BACKUP_INTEGRITY.json', json.dumps(report, indent=2, sort_keys=True))

    verified = False
    if verify:
        verify_backup_zip(zip_path)
        verified = True
    removed = prune_old_backups(out_dir, keep)
    expired_removed = prune_expired_backups(out_dir, retention_days)
    return {
        'zip_path': zip_path,
        'filename': os.path.basename(zip_path),
        'bytes': os.path.getsize(zip_path),
        'sha256': file_sha256(zip_path),
        'created_utc': manifest_json['created_utc'],
        'verified': verified,
        'removed_old_backups': removed,
        'removed_expired_backups': expired_removed,
        'manifest': manifest_json,
    }


def main():
    parser = argparse.ArgumentParser(description='Create an Adhya Shakti Shop backup zip.')
    parser.add_argument('--restore-drill', help='Safely test a backup zip by restoring its database copy into a temporary folder')
    parser.add_argument('--db', default=DEFAULT_DB, help='Path to ecommerce.db')
    parser.add_argument('--out-dir', default=DEFAULT_BACKUP_DIR, help='Directory where backup zip is written')
    parser.add_argument('--uploads', default=DEFAULT_UPLOADS, help='Uploads directory to include')
    parser.add_argument('--private-bills', default=DEFAULT_PRIVATE_BILLS, help='Private bills directory to include')
    parser.add_argument('--skip-files', action='store_true', help='Back up only the database')
    parser.add_argument('--skip-source', action='store_true', help='Do not include selected server/client source files')
    parser.add_argument('--verify', action='store_true', help='Extract and integrity-check the backup after writing it')
    parser.add_argument('--keep', type=int, default=30, help='Keep only this many newest backup zips in the output directory; use 0 to disable pruning')
    parser.add_argument('--retention-days', type=int, default=DEFAULT_RETENTION_DAYS, help='Delete backup zips older than this many days; use 0 to disable date-based retention')
    args = parser.parse_args()

    if args.restore_drill:
        report = restore_drill_report(args.restore_drill)
        print(json.dumps(report, indent=2, sort_keys=True))
        raise SystemExit(0 if report['ok'] else 1)

    try:
        result = create_backup(
            db=args.db,
            out_dir=args.out_dir,
            uploads=args.uploads,
            private_bills=args.private_bills,
            skip_files=args.skip_files,
            skip_source=args.skip_source,
            verify=args.verify,
            keep=args.keep,
            retention_days=args.retention_days,
        )
    except Exception as exc:
        raise SystemExit(str(exc))

    if result['verified']:
        print('verified=true')
    if result['removed_old_backups']:
        print(f'old_backups_removed={result["removed_old_backups"]}')
    if result['removed_expired_backups']:
        print(f'expired_backups_removed={result["removed_expired_backups"]}')
    print(result['zip_path'])


if __name__ == '__main__':
    main()
