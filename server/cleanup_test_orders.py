import argparse
import datetime
import json
import os
import sqlite3
import uuid

from backup_database import create_backup


SERVER_DIR = os.path.abspath(os.path.dirname(__file__))
BASE_DIR = os.path.abspath(os.path.join(SERVER_DIR, '..'))
DEFAULT_DB = os.path.join(SERVER_DIR, 'ecommerce.db')
DEFAULT_BACKUP_DIR = os.path.join(SERVER_DIR, 'backups')


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def table_exists(conn, table):
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def order_columns(conn):
    return {row['name'] for row in conn.execute('PRAGMA table_info(orders)').fetchall()}


def row_text(row, key):
    value = row[key] if key in row.keys() else ''
    return '' if value is None else str(value)


def candidate_reason(order):
    name = row_text(order, 'customer_name').lower()
    email = row_text(order, 'customer_email').lower()
    notes = row_text(order, 'notes').lower()
    status = row_text(order, 'status').lower()
    total = float(order['total'] or 0)
    reasons = []

    if any(word in name for word in ('test', 'smoke', 'security test')):
        reasons.append('test-like customer name')
    if any(word in email for word in ('test', 'smoke', 'example.com')):
        reasons.append('test-like customer email')
    if email in ('web@x.com', 'live@x.com'):
        reasons.append('local smoke-test email')
    if name in ('web buyer', 'live hook buyer', 'security test'):
        reasons.append('local smoke-test customer')
    if 'test' in notes or 'smoke' in notes:
        reasons.append('test-like notes')
    if email == 'admin@shop.com' and name == 'admin' and status == 'cancelled':
        reasons.append('cancelled seed admin order')
    if total <= 1.01 and (reasons or 'test' in email or 'test' in name):
        reasons.append('low-value test total')

    return ', '.join(dict.fromkeys(reasons))


def list_orders(conn):
    cols = order_columns(conn)
    wanted = [
        'id', 'order_number', 'customer_name', 'customer_email',
        'total', 'status', 'created_at',
    ]
    available = [col for col in wanted if col in cols]
    return conn.execute(
        f"SELECT {', '.join(available)} FROM orders ORDER BY created_at DESC"
    ).fetchall()


def find_candidates(conn):
    candidates = []
    for order in list_orders(conn):
        reason = candidate_reason(order)
        if reason:
            candidates.append((order, reason))
    return candidates


def selected_orders(conn, args):
    selected = {}

    for value in args.order:
        row = conn.execute(
            "SELECT * FROM orders WHERE id=? OR order_number=?",
            (value, value),
        ).fetchone()
        if not row:
            raise SystemExit(f'Order not found: {value}')
        selected[row['id']] = (row, 'explicit order selection')

    for email in args.email:
        rows = conn.execute(
            "SELECT * FROM orders WHERE lower(customer_email)=lower(?) ORDER BY created_at DESC",
            (email,),
        ).fetchall()
        if not rows:
            raise SystemExit(f'No orders found for email: {email}')
        for row in rows:
            selected[row['id']] = (row, f'email match: {email}')

    for text in args.name_contains:
        rows = conn.execute(
            "SELECT * FROM orders WHERE lower(customer_name) LIKE ? ORDER BY created_at DESC",
            (f'%{text.lower()}%',),
        ).fetchall()
        if not rows:
            raise SystemExit(f'No orders found with customer name containing: {text}')
        for row in rows:
            selected[row['id']] = (row, f'name contains: {text}')

    if args.all_candidates:
        for row, reason in find_candidates(conn):
            selected[row['id']] = (row, reason)

    return list(selected.values())


def print_orders(title, rows):
    print(title)
    print('-' * len(title))
    if not rows:
        print('None')
        return
    for row, reason in rows:
        print(
            f"{row['order_number']} | {row['id']} | "
            f"{row_text(row, 'customer_name')} | {row_text(row, 'customer_email')} | "
            f"${float(row['total'] or 0):.2f} | {row_text(row, 'status')} | "
            f"{row_text(row, 'created_at')} | {reason}"
        )


def delete_orders(conn, rows):
    deleted = []
    has_acc_sales = table_exists(conn, 'acc_sales')
    has_acc_sale_items = table_exists(conn, 'acc_sale_items')
    has_security_events = table_exists(conn, 'security_events')

    for row, reason in rows:
        order_id = row['id']
        sale_ids = []
        if has_acc_sales:
            sale_ids = [
                sale['id']
                for sale in conn.execute(
                    "SELECT id FROM acc_sales WHERE order_id=?",
                    (order_id,),
                ).fetchall()
            ]
            if sale_ids and has_acc_sale_items:
                conn.executemany(
                    "DELETE FROM acc_sale_items WHERE sale_id=?",
                    [(sale_id,) for sale_id in sale_ids],
                )
            conn.execute("DELETE FROM acc_sales WHERE order_id=?", (order_id,))

        conn.execute("DELETE FROM orders WHERE id=?", (order_id,))
        deleted.append({
            'id': order_id,
            'order_number': row['order_number'],
            'customer_email': row_text(row, 'customer_email'),
            'reason': reason,
            'linked_account_sales_deleted': len(sale_ids),
        })

    if has_security_events:
        now = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            """
            INSERT INTO security_events
            (id,event_type,severity,user_id,email,ip,user_agent,path,method,message,metadata,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                str(uuid.uuid4()),
                'admin_test_order_cleanup',
                'info',
                None,
                None,
                None,
                'cleanup_test_orders.py',
                'server/cleanup_test_orders.py',
                'SCRIPT',
                f'Deleted {len(deleted)} reviewed test order(s)',
                json.dumps({'deleted_orders': deleted}, sort_keys=True),
                now,
            ),
        )

    return deleted


def main():
    parser = argparse.ArgumentParser(
        description='Safely list or delete reviewed test orders. Dry-run is the default.'
    )
    parser.add_argument('--db', default=DEFAULT_DB, help='Path to ecommerce.db')
    parser.add_argument('--order', action='append', default=[], help='Order ID or order number to delete; repeat as needed')
    parser.add_argument('--email', action='append', default=[], help='Delete all orders for this exact customer email; repeat as needed')
    parser.add_argument('--name-contains', action='append', default=[], help='Delete orders where customer name contains this text')
    parser.add_argument('--all-candidates', action='store_true', help='Select all likely test/seed candidates shown by dry-run')
    parser.add_argument('--commit', action='store_true', help='Actually delete selected orders after creating a verified DB backup')
    args = parser.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit(f'Database not found: {args.db}')

    with connect(args.db) as conn:
        candidates = find_candidates(conn)
        print_orders('Likely test/seed candidates', candidates)
        print()

        selected = selected_orders(conn, args)
        print_orders('Selected for cleanup', selected)
        print()

        if not selected:
            print('No orders selected. Add --order ORD..., --email EMAIL, --name-contains TEXT, or --all-candidates.')
            return

        if not args.commit:
            print('DRY RUN ONLY. Nothing was deleted.')
            print('After reviewing the list, add --commit to delete the selected orders.')
            return

        if args.all_candidates and not any([args.order, args.email, args.name_contains]):
            print('Using --all-candidates with --commit. Review the candidate list above carefully.')

        print('Creating verified database backup before cleanup...')
        backup = create_backup(
            db=args.db,
            out_dir=DEFAULT_BACKUP_DIR,
            skip_files=True,
            skip_source=True,
            verify=True,
            keep=30,
            retention_days=7,
        )
        print(f"Backup created: {backup['zip_path']}")

        try:
            conn.execute('BEGIN')
            deleted = delete_orders(conn, selected)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

        print()
        print(f'Deleted {len(deleted)} order(s).')
        for item in deleted:
            print(
                f"{item['order_number']} | {item['id']} | "
                f"{item['customer_email']} | account sales deleted: {item['linked_account_sales_deleted']}"
            )


if __name__ == '__main__':
    main()
