"""
Accounts / bookkeeping module — mounted onto the main shop app under /api/acc/*.

Self-contained so merging into the shop touches app.py by only a few lines.
Inventory is UNIFIED with the shop's products table (no separate items table);
website orders mirror in as 'online' sales. Admin AND staff have full access to
the entire finance area; customers are excluded. All dashboard/report numbers are
calculated live from the existing sales / purchases / expenses / products data —
nothing is entered twice.
"""
import os
import io
import csv
import json
import uuid
import sqlite3
import secrets
import datetime
import re

import bcrypt
from flask import request, jsonify, g, send_from_directory, abort, Response
from security_utils import (
    PRIVATE_ATTACHMENT_MAX_BYTES,
    SAFE_ATTACHMENT_EXTENSIONS,
    UploadSecurityError,
    clean_text,
    is_safe_static_image_url,
    is_safe_stored_filename,
    random_stored_name,
    secure_upload_headers,
    validate_upload,
)

EXPENSE_CATEGORIES = [
    'Stock / Supplier', 'Rent', 'Marketing / Ads', 'Courier & Shipping',
    'Packaging', 'Supplies', 'Utilities', 'Salaries', 'Fees', 'Other',
]
PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'PayPal', 'Other']


def init_accounts_schema(db_path):
    """Additive only — new tables + new columns. Never drops anything."""
    db = sqlite3.connect(db_path)
    for migration in [
        "ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0",
        "ALTER TABLE products ADD COLUMN low_stock_threshold REAL DEFAULT 5",
        "ALTER TABLE acc_purchases ADD COLUMN vendor_id TEXT",
        "ALTER TABLE acc_expenses ADD COLUMN vendor_id TEXT",
        "ALTER TABLE acc_vendors ADD COLUMN contact_name TEXT",
        "ALTER TABLE acc_sales ADD COLUMN customer_id TEXT",
        "ALTER TABLE users ADD COLUMN first_name TEXT",
        "ALTER TABLE users ADD COLUMN last_name TEXT",
        # Admin-managed catalog category tree lives in the shared categories table.
        "ALTER TABLE categories ADD COLUMN parent_id TEXT",
        "ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1",
        "ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0",
        "ALTER TABLE categories ADD COLUMN kind TEXT",
    ]:
        try:
            db.execute(migration)
        except Exception:
            pass  # nosec B110
    db.executescript('''
        CREATE TABLE IF NOT EXISTS acc_sales (
            id TEXT PRIMARY KEY, order_id TEXT, ref_no TEXT, sale_date TEXT NOT NULL,
            channel TEXT DEFAULT 'manual', customer_name TEXT, customer_id TEXT, payment_method TEXT, notes TEXT,
            subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL DEFAULT 0,
            cost_total REAL DEFAULT 0, profit REAL DEFAULT 0, created_by TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS acc_sale_items (
            id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, item_id TEXT, name TEXT NOT NULL,
            qty REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0, unit_cost REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (sale_id) REFERENCES acc_sales(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS acc_expenses (
            id TEXT PRIMARY KEY, expense_date TEXT NOT NULL, category TEXT, payee TEXT,
            payment_method TEXT, amount REAL NOT NULL DEFAULT 0, notes TEXT, vendor_id TEXT,
            created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS acc_purchases (
            id TEXT PRIMARY KEY, ref_no TEXT, purchase_date TEXT NOT NULL, supplier TEXT,
            payment_method TEXT, notes TEXT, total REAL DEFAULT 0, vendor_id TEXT,
            created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS acc_purchase_items (
            id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, item_id TEXT, name TEXT NOT NULL,
            qty REAL NOT NULL DEFAULT 1, unit_cost REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (purchase_id) REFERENCES acc_purchases(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS acc_attachments (
            id TEXT PRIMARY KEY, parent_type TEXT NOT NULL, parent_id TEXT NOT NULL,
            original_name TEXT, stored_name TEXT NOT NULL, mime TEXT, size INTEGER DEFAULT 0,
            uploaded_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS acc_stock_moves (
            id TEXT PRIMARY KEY, item_id TEXT NOT NULL, change REAL NOT NULL, reason TEXT,
            ref_type TEXT, ref_id TEXT, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS acc_vendors (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, phone TEXT, email TEXT, address TEXT,
            notes TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_acc_sales_order ON acc_sales(order_id);
        CREATE INDEX IF NOT EXISTS idx_acc_sales_date ON acc_sales(sale_date);
        CREATE INDEX IF NOT EXISTS idx_acc_sales_customer ON acc_sales(customer_id);
        CREATE INDEX IF NOT EXISTS idx_acc_sale_items_sale ON acc_sale_items(sale_id);
        CREATE INDEX IF NOT EXISTS idx_acc_expenses_date ON acc_expenses(expense_date);
        CREATE INDEX IF NOT EXISTS idx_acc_expenses_vendor ON acc_expenses(vendor_id);
        CREATE INDEX IF NOT EXISTS idx_acc_purchases_date ON acc_purchases(purchase_date);
        CREATE INDEX IF NOT EXISTS idx_acc_purchases_vendor ON acc_purchases(vendor_id);
        CREATE INDEX IF NOT EXISTS idx_acc_purchase_items_purchase ON acc_purchase_items(purchase_id);
        CREATE INDEX IF NOT EXISTS idx_acc_stock_moves_item_created ON acc_stock_moves(item_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_acc_attachments_parent ON acc_attachments(parent_type, parent_id);
    ''')
    try:
        db.execute("""
            DELETE FROM acc_sale_items
            WHERE NOT EXISTS (SELECT 1 FROM acc_sales s WHERE s.id=acc_sale_items.sale_id)
        """)
        db.execute("""
            DELETE FROM acc_purchase_items
            WHERE NOT EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id=acc_purchase_items.purchase_id)
        """)
        db.execute("""
            DELETE FROM acc_stock_moves
            WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id=acc_stock_moves.item_id)
        """)
    except Exception:
        pass  # nosec B110
    # Previous local/test builds called this tree "clothing". Convert those rows
    # to the general catalog tree and seed the requested default structure while
    # reusing existing flat category IDs where names match.
    db.execute("UPDATE categories SET kind='catalog' WHERE kind='clothing'")
    # One-time label correction: the default Women's subcategory was mislabeled "Corset"
    # (the actual product is a Co-ord Set — a matching two-piece, not a corset). Self-
    # converging: only matches the literal default typo, so it never fights later renames.
    db.execute("UPDATE categories SET name='Co-ord Sets' WHERE name='Corset' AND IFNULL(kind,'')='catalog'")

    desired_ids = set()

    def _cat_id(sql, params=()):
        row = db.execute(sql, params).fetchone()
        return row[0] if row else None

    def ensure_category(name, parent_id=None, sort_order=0, aliases=(), reuse_existing=True):
        names = [name] + list(aliases or [])
        cid = None
        if parent_id is None:
            for nm in names:
                cid = _cat_id("SELECT id FROM categories WHERE lower(name)=lower(?) AND parent_id IS NULL LIMIT 1", (nm,))
                if cid:
                    break
        else:
            for nm in names:
                cid = _cat_id("SELECT id FROM categories WHERE lower(name)=lower(?) AND parent_id=? LIMIT 1", (nm, parent_id))
                if cid:
                    break
            if not cid and reuse_existing:
                for nm in names:
                    cid = _cat_id(
                        "SELECT id FROM categories WHERE lower(name)=lower(?) "
                        "AND IFNULL(kind,'') IN ('','catalog') LIMIT 1",
                        (nm,)
                    )
                    if cid:
                        break
        if not cid:
            cid = str(uuid.uuid4())
            db.execute(
                "INSERT INTO categories (id,name,description,parent_id,kind,is_active,sort_order) "
                "VALUES (?,?,?,?,?,1,?)",
                (cid, name, '', parent_id, 'catalog', sort_order)
            )
        else:
            db.execute(
                "UPDATE categories SET name=?, parent_id=?, kind='catalog', is_active=1, sort_order=? WHERE id=?",
                (name, parent_id, sort_order, cid)
            )
        desired_ids.add(cid)
        return cid

    def hide_category_tree(root_id):
        stack = [root_id]
        hidden = []
        while stack:
            cur = stack.pop()
            hidden.append(cur)
            stack.extend([r[0] for r in db.execute("SELECT id FROM categories WHERE parent_id=?", (cur,)).fetchall()])
        for cid in hidden:
            db.execute("UPDATE categories SET kind='legacy_hidden', is_active=0 WHERE id=?", (cid,))

    def _setting_value(key):
        try:
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            return row[0] if row else None
        except Exception:
            return None

    def _set_setting_value(key, value):
        try:
            db.execute("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", (key, value))
        except Exception:
            pass  # nosec B110

    def apply_catalog_defaults_v2():
        """One-time live data normalizer for the requested category structure."""
        if _setting_value('catalog_defaults_v2_applied') == '1':
            return

        desired_ids.clear()
        clothing_id = ensure_category('Clothing', None, 1)
        custom_id = ensure_category('Custom Clothing', None, 2, aliases=('Custom', 'Custom Printing'))
        jewelry_id = ensure_category('Jewelry', None, 3, aliases=('Jewellery',))
        other_id = ensure_category('Other', None, 4)

        womens_id = ensure_category("Women's", clothing_id, 1)
        mens_id = ensure_category("Men's", clothing_id, 2)
        co_ord_id = ensure_category('Co-ord Sets', womens_id, 1, aliases=('Corset', 'Cord Set', 'Co-ord Set', 'Corsets'))
        mens_tshirts_id = ensure_category('T-Shirts', mens_id, 1, aliases=('T-Shirt',))
        mens_polo_id = ensure_category('Polo', mens_id, 2, aliases=('Polo Shirts', 'Polos'))
        mens_hoodies_id = ensure_category('Hoodies', mens_id, 3, aliases=('Hoodie',))

        custom_tshirts_id = ensure_category('T-Shirts', custom_id, 1, aliases=('T-Shirt',), reuse_existing=False)
        custom_polo_id = ensure_category('Polo', custom_id, 2, reuse_existing=False)
        custom_hoodies_id = ensure_category('Hoodies', custom_id, 3, aliases=('Hoodie',), reuse_existing=False)

        aprons_id = ensure_category('Aprons', other_id, 1, aliases=('Apron',))
        bags_id = ensure_category('Bags', other_id, 2, aliases=('Bag',))
        caps_id = ensure_category('Caps', other_id, 3, aliases=('Cap',))
        mugs_id = ensure_category('Mugs', other_id, 4, aliases=('Mug',))
        tumblers_id = ensure_category('Tumblers', other_id, 5, aliases=('Tumbler',))

        alias_targets = {
            'clothing': clothing_id,
            'custom': custom_id,
            'custom printing': custom_id,
            'custom clothing': custom_id,
            'jewelry': jewelry_id,
            'jewellery': jewelry_id,
            'other': other_id,
            "women's": womens_id,
            'womens': womens_id,
            'women': womens_id,
            "men's": mens_id,
            'mens': mens_id,
            'men': mens_id,
            'co-ord sets': co_ord_id,
            'co-ord set': co_ord_id,
            'cord set': co_ord_id,
            'corset': co_ord_id,
            'corsets': co_ord_id,
            'apron': aprons_id,
            'aprons': aprons_id,
            'bag': bags_id,
            'bags': bags_id,
            'cap': caps_id,
            'caps': caps_id,
            'mug': mugs_id,
            'mugs': mugs_id,
            'tumbler': tumblers_id,
            'tumblers': tumblers_id,
        }

        # Legacy flat product categories are moved into the new tree. Ambiguous
        # apparel rows default to Custom Clothing; Men's has its own fresh nodes.
        flat_targets = {
            't-shirt': custom_tshirts_id,
            't-shirts': custom_tshirts_id,
            'polo shirt': custom_polo_id,
            'polo shirts': custom_polo_id,
            'polos': custom_polo_id,
            'polo': custom_polo_id,
            'hoodie': custom_hoodies_id,
            'hoodies': custom_hoodies_id,
        }
        alias_targets.update(flat_targets)

        desired_tuple = tuple(desired_ids)
        placeholders = ','.join('?' for _ in desired_tuple) or "''"
        rows = db.execute(
            "SELECT id,name,parent_id FROM categories "  # nosec B608
            "WHERE IFNULL(kind,'') IN ('','catalog','clothing') "
            "AND id NOT IN (" + placeholders + ")",
            desired_tuple
        ).fetchall()
        for row in rows:
            key = (row[1] or '').strip().lower()
            target_id = alias_targets.get(key)
            if not target_id:
                continue
            db.execute("UPDATE products SET category_id=? WHERE category_id=?", (target_id, row[0]))
            hide_category_tree(row[0])

        # Existing co-ord/corset products should live under Clothing > Women's > Co-ord Sets.
        db.execute(
            "UPDATE products SET category_id=? WHERE "
            "lower(name) LIKE '%co-ord%' OR lower(name) LIKE '%co ord%' "
            "OR lower(name) LIKE '%cord set%' OR lower(name) LIKE '%corset%'",
            (co_ord_id,)
        )

        # Hide duplicate requested roots while preserving any product links.
        for dup in db.execute(
            "SELECT id,name FROM categories WHERE parent_id IS NULL AND IFNULL(kind,'') IN ('','catalog','clothing')"
        ).fetchall():
            target_id = alias_targets.get((dup[1] or '').strip().lower())
            if target_id and dup[0] != target_id:
                db.execute("UPDATE products SET category_id=? WHERE category_id=?", (target_id, dup[0]))
                hide_category_tree(dup[0])

        _set_setting_value('catalog_defaults_v2_applied', '1')

    apply_catalog_defaults_v2()

    # Seed the default catalog tree ONLY ONCE — when no managed (catalog) categories
    # exist yet. After the first seed, the owner's edits (hiding, renaming, re-parenting)
    # persist across server reloads instead of being silently overwritten on every boot.
    if not db.execute("SELECT 1 FROM categories WHERE kind='catalog' LIMIT 1").fetchone():
        clothing_id = ensure_category('Clothing', None, 1)
        custom_id = ensure_category('Custom Clothing', None, 2, aliases=('Custom', 'Custom Printing'))
        jewelry_id = ensure_category('Jewelry', None, 3, aliases=('Jewellery',))
        other_id = ensure_category('Other', None, 4)

        womens_id = ensure_category("Women's", clothing_id, 1)
        mens_id = ensure_category("Men's", clothing_id, 2)
        ensure_category('Co-ord Sets', womens_id, 1, aliases=('Corset', 'Cord Set', 'Co-ord Set', 'Corsets'))
        ensure_category('T-Shirts', mens_id, 1, aliases=('T-Shirt',))
        ensure_category('Polo', mens_id, 2, aliases=('Polo Shirts', 'Polos'))
        ensure_category('Hoodies', mens_id, 3, aliases=('Hoodie',))

        ensure_category('T-Shirts', custom_id, 1, aliases=('T-Shirt',), reuse_existing=False)
        ensure_category('Polo', custom_id, 2, reuse_existing=False)
        ensure_category('Hoodies', custom_id, 3, aliases=('Hoodie',), reuse_existing=False)

        ensure_category('Aprons', other_id, 1, aliases=('Apron',))
        ensure_category('Bags', other_id, 2, aliases=('Bag',))
        ensure_category('Caps', other_id, 3, aliases=('Cap',))
        ensure_category('Mugs', other_id, 4, aliases=('Mug',))
        ensure_category('Tumblers', other_id, 5, aliases=('Tumbler',))

        # Hide old/test duplicate roots so the manager shows only the four requested roots.
        for dup in db.execute(
            "SELECT id FROM categories WHERE parent_id IS NULL AND id<>? "
            "AND lower(name) IN (lower('Custom'), lower('Custom Printing'), lower('Custom Clothing'))",
            (custom_id,)
        ).fetchall():
            db.execute("UPDATE products SET category_id=? WHERE category_id=?", (custom_id, dup[0]))
            hide_category_tree(dup[0])
        for dup in db.execute(
            "SELECT id FROM categories WHERE parent_id IS NULL AND lower(name) IN (lower('Womens Wear'))"
        ).fetchall():
            hide_category_tree(dup[0])
    db.commit()
    db.close()


def _clean_lines(raw):
    lines = []
    for it in (raw or []):
        name = (it.get('name') or '').strip()
        qty = float(it.get('qty') or 0)
        if not name or qty <= 0:
            continue
        lines.append({'item_id': it.get('item_id') or None, 'name': name, 'qty': qty,
                      'unit_price': float(it.get('unit_price') or 0),
                      'unit_cost': float(it.get('unit_cost') or 0)})
    return lines


def register(app, deps):
    get_db = deps['get_db']
    rows_to_list = deps['rows_to_list']
    # Admin AND staff get full finance access; customers excluded. (admin_required = staff+admin)
    staff_required = deps['admin_required']
    BILLS_DIR = deps['bills_dir']
    DB_PATH = deps['db_path']
    log_security_event = deps.get('log_security_event')
    log_audit_event = deps.get('log_audit_event')
    owner_required = deps.get('admin_only_required', staff_required)

    def log_account_event(event_type, severity='info', message='', metadata=None):
        if not log_security_event:
            return
        user = getattr(g, 'user', {}) or {}
        log_security_event(
            event_type,
            severity,
            message,
            user_id=user.get('id'),
            email=user.get('email'),
            metadata=metadata or {},
        )

    def audit_account_event(action, entity_type='', entity_id='', message='', before=None, after=None, metadata=None):
        payload = {'module': 'accounts', **(metadata or {})}
        if log_audit_event:
            log_audit_event(
                action,
                entity_type,
                entity_id,
                message,
                before=before,
                after=after,
                metadata=payload,
            )
        else:
            log_account_event(action, 'info', message, payload)

    os.makedirs(BILLS_DIR, exist_ok=True)
    init_accounts_schema(DB_PATH)

    def safe_download_name(name, fallback='attachment'):
        text = os.path.basename(clean_text(name, 120)).replace('"', '').replace("'", '')
        text = re.sub(r'[^A-Za-z0-9._ -]+', '_', text).strip(' ._-')
        return text or fallback

    def bill_file_path(stored_name):
        if not is_safe_stored_filename(stored_name):
            return None
        base = os.path.abspath(BILLS_DIR)
        path = os.path.abspath(os.path.join(base, stored_name))
        try:
            if os.path.commonpath([base, path]) != base:
                return None
        except ValueError:
            return None
        return path

    def remove_bill_file(stored_name):
        path = bill_file_path(stored_name)
        if not path:
            log_account_event('bill_file_path_blocked', 'critical', 'Blocked unsafe stored bill filename', {'stored_name': stored_name})
            return False
        try:
            os.remove(path)
            return True
        except FileNotFoundError:
            return False
        except OSError as exc:
            log_account_event('bill_file_delete_failed', 'warning', 'Could not delete bill attachment file', {'stored_name': stored_name, 'error': str(exc)})
            return False

    # ── Date range helper ────────────────────────────────────────────────────
    def safe_iso_date(value, default=None):
        text = clean_text(value, 10)
        try:
            return datetime.date.fromisoformat(text).isoformat()
        except Exception:
            return default

    def safe_month(value):
        text = clean_text(value, 7)
        if not re.fullmatch(r'\d{4}-\d{2}', text or ''):
            return None
        try:
            datetime.date.fromisoformat(text + '-01')
            return text
        except Exception:
            return None

    def date_range():
        today = datetime.date.today()
        frm = safe_iso_date(request.args.get('from'))
        to = safe_iso_date(request.args.get('to'))
        if frm and to:
            if frm > to:
                frm, to = to, frm
            return frm, to
        month = safe_month(request.args.get('month'))
        if month:
            y, m = int(month[:4]), int(month[5:7])
            last = (datetime.date(y + (m == 12), (m % 12) + 1, 1) - datetime.timedelta(days=1)).day
            return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{last:02d}"
        period = clean_text(request.args.get('period'), 12).lower() or 'month'
        if period == 'today':
            return today.isoformat(), today.isoformat()
        if period == 'week':
            start = today - datetime.timedelta(days=today.weekday())
            return start.isoformat(), today.isoformat()
        if period == 'year':
            return f"{today.year}-01-01", today.isoformat()
        if period == 'all':
            return '2000-01-01', today.isoformat()
        return today.replace(day=1).isoformat(), today.isoformat()  # month-to-date default

    # ── Inventory = products ─────────────────────────────────────────────────
    def item_obj(r):
        return {'id': r['id'], 'name': r['name'], 'sku': r['sku'] or '',
                'category': (r['cat_name'] if 'cat_name' in r.keys() else '') or '',
                'unit': 'each', 'sale_price': r['price'] or 0, 'stock': r['stock'] or 0,
                'cost_price': r['cost_price'] or 0,
                'low_stock_threshold': r['low_stock_threshold'] if r['low_stock_threshold'] is not None else 5,
                'is_active': r['is_active']}

    def _move_stock(db, item_id, change, reason, ref_type, ref_id):
        if not item_id:
            return
        db.execute("UPDATE products SET stock = stock + ? WHERE id=?", (change, item_id))
        db.execute("INSERT INTO acc_stock_moves (id,item_id,change,reason,ref_type,ref_id) VALUES (?,?,?,?,?,?)",
                   (str(uuid.uuid4()), item_id, change, reason, ref_type, ref_id))

    @app.route('/api/acc/meta', methods=['GET'])
    @staff_required
    def acc_meta():
        return jsonify({'currency': '$', 'expense_categories': EXPENSE_CATEGORIES,
                        'payment_methods': PAYMENT_METHODS, 'role': g.user.get('role')})

    @app.route('/api/acc/categories', methods=['GET'])
    @staff_required
    def acc_categories():
        # Returns the admin-managed catalog tree in flat form so Product and
        # Inventory can build the same category dropdown.
        rows = get_db().execute(
            "SELECT id, name, parent_id, kind, IFNULL(is_active,1) AS is_active, IFNULL(sort_order,0) AS sort_order "
            "FROM categories WHERE IFNULL(kind,'') IN ('catalog','clothing') "
            "ORDER BY sort_order, name COLLATE NOCASE").fetchall()
        return jsonify({'categories': rows_to_list(rows)})

    # ── Catalog structure: admin-managed category hierarchy ──────────────────
    # Stored in the shared `categories` table. Top-level examples are Clothing,
    # Jewelry, Custom, and Other; each can have any depth of subcategories.
    def _live_product_count(db, cid):
        return db.execute("SELECT COUNT(*) AS n FROM products WHERE category_id=? AND is_active=1",
                          (cid,)).fetchone()['n']

    def _category_tree(db, active_only=False, include_counts=False):
        where_parts = ["IFNULL(kind,'') IN ('catalog','clothing')"]
        if active_only:
            where_parts.append("IFNULL(is_active,1)=1")
        rows = db.execute(
            "SELECT id,name,parent_id,IFNULL(is_active,1) AS is_active,IFNULL(sort_order,0) AS sort_order "  # nosec B608
            "FROM categories WHERE " + " AND ".join(where_parts) + " ORDER BY sort_order, name COLLATE NOCASE").fetchall()
        nodes, roots = {}, []
        for r in rows:
            node = {
                'id': r['id'], 'name': r['name'], 'parent_id': r['parent_id'],
                'is_active': r['is_active'], 'sort_order': r['sort_order'],
                'children': []
            }
            if include_counts:
                node['products'] = _live_product_count(db, r['id'])
            nodes[node['id']] = node
        for node in nodes.values():
            parent = nodes.get(node['parent_id'])
            if parent:
                parent['children'].append(node)
            elif not node['parent_id']:
                roots.append(node)
        def sort_nodes(items):
            items.sort(key=lambda n: (n.get('sort_order') or 0, (n.get('name') or '').lower()))
            for child in items:
                sort_nodes(child['children'])
        sort_nodes(roots)
        def compat(node):
            node['categories'] = node['children']
            for child in node['children']:
                compat(child)
            return node
        return [compat(n) for n in roots]

    def _insert_category_node(name, parent_id=None):
        db = get_db()
        if parent_id:
            parent = db.execute(
                "SELECT id FROM categories WHERE id=? AND IFNULL(kind,'') IN ('catalog','clothing')",
                (parent_id,)
            ).fetchone()
            if not parent:
                return None, ('Please choose a valid parent category', 400)
        if parent_id:
            nxt = db.execute(
                "SELECT IFNULL(MAX(sort_order),0)+1 AS n FROM categories WHERE parent_id=? "
                "AND IFNULL(kind,'') IN ('catalog','clothing')",
                (parent_id,)
            ).fetchone()['n']
        else:
            nxt = db.execute(
                "SELECT IFNULL(MAX(sort_order),0)+1 AS n FROM categories WHERE parent_id IS NULL "
                "AND IFNULL(kind,'') IN ('catalog','clothing')"
            ).fetchone()['n']
        cid = str(uuid.uuid4())
        db.execute("INSERT INTO categories (id,name,description,parent_id,kind,is_active,sort_order) "
                   "VALUES (?,?,?,?,?,1,?)", (cid, name, '', parent_id, 'catalog', nxt))
        db.commit()
        return cid, None

    def _update_category_node(cid, data):
        db = get_db()
        if not db.execute("SELECT id FROM categories WHERE id=? AND IFNULL(kind,'') IN ('catalog','clothing')",
                          (cid,)).fetchone():
            return ('Not found', 404)
        if 'name' in data:
            name = (data.get('name') or '').strip()
            if not name:
                return ('Name cannot be empty', 400)
            db.execute("UPDATE categories SET name=? WHERE id=?", (name, cid))
        if 'is_active' in data:
            db.execute("UPDATE categories SET is_active=? WHERE id=?", (1 if data['is_active'] else 0, cid))
        if 'sort_order' in data:
            db.execute("UPDATE categories SET sort_order=? WHERE id=?", (int(data['sort_order'] or 0), cid))
        db.commit()
        return None

    def _delete_category_node(cid):
        db = get_db()
        row = db.execute("SELECT id FROM categories WHERE id=? AND IFNULL(kind,'') IN ('catalog','clothing')",
                         (cid,)).fetchone()
        if not row:
            return ('Not found', 404)
        kids = db.execute("SELECT COUNT(*) AS n FROM categories WHERE parent_id=?", (cid,)).fetchone()['n']
        if kids:
            return ('Remove its subcategories first, or deactivate it to hide the whole branch.', 400)
        n = db.execute("SELECT COUNT(*) AS n FROM products WHERE category_id=?", (cid,)).fetchone()['n']
        if n:
            return (f'{n} product(s) use this — deactivate it instead, or move those products first.', 400)
        db.execute("DELETE FROM categories WHERE id=?", (cid,))
        db.commit()
        return None

    @app.route('/api/acc/category-tree', methods=['GET'])
    @staff_required
    def acc_category_tree():
        tree = _category_tree(get_db(), active_only=False, include_counts=True)
        return jsonify({'categories': tree, 'types': tree})

    @app.route('/api/category-tree', methods=['GET'])
    def public_category_tree():
        # include_counts lets the storefront hide empty categories and show the right
        # "Coming Soon" state per section without extra per-category product calls.
        tree = _category_tree(get_db(), active_only=True, include_counts=True)
        return jsonify({'categories': tree, 'types': tree})

    @app.route('/api/acc/categories/node', methods=['POST'])
    @owner_required
    def acc_category_add_node():
        data = request.json or {}
        name = (data.get('name') or '').strip()
        parent_id = data.get('parent_id') or None
        if not name:
            return jsonify({'error': 'Please enter a category name'}), 400
        cid, err = _insert_category_node(name, parent_id)
        if err:
            return jsonify({'error': err[0]}), err[1]
        audit_account_event('category_created', 'category', cid, 'Category created', after={'id': cid, 'name': name, 'parent_id': parent_id})
        return jsonify({'id': cid}), 201

    @app.route('/api/acc/categories/node/<cid>', methods=['PUT'])
    @owner_required
    def acc_category_update_node(cid):
        before = None
        row = get_db().execute("SELECT id,name,parent_id,is_active,sort_order FROM categories WHERE id=?", (cid,)).fetchone()
        if row:
            before = dict(row)
        err = _update_category_node(cid, request.json or {})
        if err:
            return jsonify({'error': err[0]}), err[1]
        row = get_db().execute("SELECT id,name,parent_id,is_active,sort_order FROM categories WHERE id=?", (cid,)).fetchone()
        audit_account_event('category_updated', 'category', cid, 'Category updated', before=before, after=dict(row) if row else None)
        return jsonify({'ok': True})

    @app.route('/api/acc/categories/node/<cid>', methods=['DELETE'])
    @owner_required
    def acc_category_delete_node(cid):
        row = get_db().execute("SELECT id,name,parent_id,is_active,sort_order FROM categories WHERE id=?", (cid,)).fetchone()
        before = dict(row) if row else None
        err = _delete_category_node(cid)
        if err:
            return jsonify({'error': err[0]}), err[1]
        audit_account_event('category_deleted', 'category', cid, 'Category deleted', before=before)
        return jsonify({'ok': True})

    # (Legacy /api/acc/clothing* and /api/clothing-tree endpoints removed — fully
    #  superseded by /api/acc/categories/node and /api/(acc/)category-tree.)

    @app.route('/api/acc/items', methods=['GET'])
    @staff_required
    def acc_list_items():
        db = get_db()
        q = (request.args.get('q') or '').strip().lower()
        sql = ("SELECT p.*, c.name AS cat_name FROM products p "
               "LEFT JOIN categories c ON c.id = p.category_id WHERE p.is_active=1")
        params = []
        if q:
            sql += " AND (lower(p.name) LIKE ? OR lower(IFNULL(p.sku,'')) LIKE ?)"
            params += [f'%{q}%', f'%{q}%']
        sql += " ORDER BY p.name COLLATE NOCASE ASC"
        return jsonify({'items': [item_obj(r) for r in db.execute(sql, params).fetchall()]})

    @app.route('/api/acc/items/<item_id>', methods=['GET'])
    @staff_required
    def acc_get_item(item_id):
        db = get_db()
        r = db.execute("SELECT p.*, c.name AS cat_name FROM products p "
                       "LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?", (item_id,)).fetchone()
        if not r:
            return jsonify({'error': 'Item not found'}), 404
        item = item_obj(r)
        item['category_id'] = r['category_id']
        item['description'] = r['description'] or ''
        item['compare_price'] = r['compare_price']
        try: item['images'] = json.loads(r['images'] or '[]')
        except Exception: item['images'] = []
        item['variants'] = rows_to_list(db.execute(
            "SELECT color,size,stock FROM product_variants WHERE product_id=? ORDER BY color,size", (item_id,)).fetchall())
        return jsonify({'item': item})

    # Replicates the shop's variant storage so accounts-created items work as real products.
    def save_variants(db, pid, variants):
        db.execute("DELETE FROM product_variants WHERE product_id=?", (pid,))
        for v in (variants or []):
            color = clean_text(v.get('color'), 40)
            size = clean_text(v.get('size'), 20)
            if not color and not size:
                continue
            qty = max(0, min(999999, int(float(v.get('qty') or v.get('stock') or 0))))
            db.execute("INSERT INTO product_variants (id,product_id,color,size,stock) VALUES (?,?,?,?,?)",
                       (str(uuid.uuid4()), pid, color, size, qty))

    def variant_total(variants):
        return sum(int(float(v.get('qty') or v.get('stock') or 0)) for v in (variants or [])
                   if (v.get('color') or v.get('size')))

    def clean_item_images(images):
        if not isinstance(images, list):
            return []
        return [clean_text(u, 260) for u in images[:12] if is_safe_static_image_url(u)]

    def clean_item_variants(raw):
        if not isinstance(raw, list):
            return []
        out = []
        for v in raw[:240]:
            if not isinstance(v, dict):
                continue
            color = clean_text(v.get('color'), 40)
            size = clean_text(v.get('size'), 20)
            try:
                qty = max(0, min(999999, int(float(v.get('qty') or v.get('stock') or 0))))
            except (TypeError, ValueError):
                qty = 0
            if color or size:
                out.append({'color': color, 'size': size, 'qty': qty, 'stock': qty})
        return out

    def clean_money(value, default=0):
        try:
            return max(0, float(value if value not in (None, '') else default))
        except (TypeError, ValueError):
            return float(default)

    def _auto_purchase_for_item(db, pid, name, variants, simple_qty, cost, vendor_id):
        """Records a purchase for a newly-added item (vendor spend + books). Stock is set on the
        product directly, so these lines use item_id=NULL (documentation, not a stock reversal)."""
        ppid = str(uuid.uuid4())
        total = (variant_total(variants) if variants else simple_qty) * cost
        db.execute("INSERT INTO acc_purchases (id,purchase_date,supplier,vendor_id,notes,total,created_by) "
                   "VALUES (?,?,?,?,?,?,?)",
                   (ppid, datetime.date.today().isoformat(), '', vendor_id or None,
                    'Auto-created from new item: ' + name, total, g.user['id']))
        if variants:
            for v in variants:
                q = int(float(v.get('qty') or v.get('stock') or 0))
                if q <= 0 or not (v.get('color') or v.get('size')):
                    continue
                label = (name + ' ' + ' / '.join([x for x in [v.get('color'), v.get('size')] if x])).strip()
                db.execute("INSERT INTO acc_purchase_items (id,purchase_id,item_id,name,qty,unit_cost) VALUES (?,?,?,?,?,?)",
                           (str(uuid.uuid4()), ppid, None, label, q, cost))
        elif simple_qty > 0:
            db.execute("INSERT INTO acc_purchase_items (id,purchase_id,item_id,name,qty,unit_cost) VALUES (?,?,?,?,?,?)",
                       (str(uuid.uuid4()), ppid, None, name, simple_qty, cost))

    @app.route('/api/acc/items', methods=['POST'])
    @staff_required
    def acc_create_item():
        data = request.json or {}
        name = clean_text(data.get('name'), 160)
        if not name:
            return jsonify({'error': 'Item name is required'}), 400
        db = get_db()
        iid = str(uuid.uuid4())
        variants = clean_item_variants(data.get('variants') or [])
        simple_qty = clean_money(data.get('stock'), 0)
        total_stock = variant_total(variants) if variants else simple_qty
        cost = clean_money(data.get('cost_price'), 0)
        category_id = clean_text(data.get('category_id'), 80) or None
        if category_id and not db.execute("SELECT id FROM categories WHERE id=?", (category_id,)).fetchone():
            return jsonify({'error': 'Selected category was not found'}), 400
        db.execute("""INSERT INTO products
            (id,name,description,price,compare_price,category_id,stock,sku,images,variations,
             allow_custom_print,is_bestseller,cost_price,low_stock_threshold,is_active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)""",
            (iid, name, clean_text(data.get('description'), 5000), clean_money(data.get('sale_price'), 0),
             clean_money(data.get('compare_price'), 0) if data.get('compare_price') else None,
             category_id, total_stock, clean_text(data.get('sku'), 80),
             json.dumps(clean_item_images(data.get('images') or [])), json.dumps([]),
             1 if data.get('allow_custom_print') else 0, 0, cost, clean_money(data.get('low_stock_threshold'), 5)))
        save_variants(db, iid, variants)
        if total_stock:
            db.execute("INSERT INTO acc_stock_moves (id,item_id,change,reason,ref_type,ref_id) VALUES (?,?,?,?,?,?)",
                       (str(uuid.uuid4()), iid, total_stock, 'New item — purchased', 'opening', iid))
        if total_stock and (data.get('vendor_id') or cost):
            _auto_purchase_for_item(db, iid, name, variants, simple_qty, cost, data.get('vendor_id'))
        db.commit()
        r = db.execute("SELECT p.*, NULL AS cat_name FROM products p WHERE id=?", (iid,)).fetchone()
        audit_account_event(
            'inventory_item_created',
            'inventory_item',
            iid,
            f'Inventory item created: {name}',
            after={'id': iid, 'name': name, 'stock': total_stock, 'category_id': category_id, 'cost_price': cost},
            metadata={'item_id': iid, 'product_id': iid},
        )
        return jsonify({'item': item_obj(r)}), 201

    @app.route('/api/acc/items/<item_id>', methods=['PUT'])
    @staff_required
    def acc_update_item(item_id):
        data = request.json or {}
        db = get_db()
        existing = db.execute("SELECT * FROM products WHERE id=?", (item_id,)).fetchone()
        if not existing:
            return jsonify({'error': 'Item not found'}), 404
        before = {k: existing[k] for k in existing.keys() if k in ('id', 'name', 'price', 'category_id', 'stock', 'sku', 'cost_price', 'low_stock_threshold')}
        name = clean_text(data.get('name'), 160)
        if not name:
            return jsonify({'error': 'Item name is required'}), 400
        variants = clean_item_variants(data.get('variants') or [])
        category_id = clean_text(data.get('category_id'), 80) or None
        if category_id and not db.execute("SELECT id FROM categories WHERE id=?", (category_id,)).fetchone():
            return jsonify({'error': 'Selected category was not found'}), 400
        total_stock = variant_total(variants) if variants else clean_money(data.get('stock'), 0)
        delta = total_stock - (existing['stock'] or 0)
        db.execute("""UPDATE products SET name=?, description=?, price=?, compare_price=?, category_id=?,
            stock=?, sku=?, images=?, variations=?, cost_price=?, low_stock_threshold=? WHERE id=?""",
            (name, clean_text(data.get('description'), 5000), clean_money(data.get('sale_price'), 0),
             clean_money(data.get('compare_price'), 0) if data.get('compare_price') else None,
             category_id, total_stock, clean_text(data.get('sku'), 80),
             json.dumps(clean_item_images(data.get('images') or [])), json.dumps([]),
             clean_money(data.get('cost_price'), 0), clean_money(data.get('low_stock_threshold'), 5), item_id))
        save_variants(db, item_id, variants)
        if delta:
            db.execute("INSERT INTO acc_stock_moves (id,item_id,change,reason,ref_type,ref_id) VALUES (?,?,?,?,?,?)",
                       (str(uuid.uuid4()), item_id, delta, 'Manual stock edit', 'adjustment', item_id))
        db.commit()
        r = db.execute("SELECT p.*, NULL AS cat_name FROM products p WHERE id=?", (item_id,)).fetchone()
        audit_account_event(
            'inventory_item_updated',
            'inventory_item',
            item_id,
            f'Inventory item updated: {name}',
            before=before,
            after={'id': item_id, 'name': name, 'stock': total_stock, 'category_id': category_id, 'delta': delta},
            metadata={'item_id': item_id, 'product_id': item_id},
        )
        return jsonify({'item': item_obj(r)})

    @app.route('/api/acc/items/<item_id>/moves', methods=['GET'])
    @staff_required
    def acc_item_moves(item_id):
        rows = get_db().execute("SELECT change, reason, ref_type, created_at FROM acc_stock_moves "
                               "WHERE item_id=? ORDER BY created_at DESC LIMIT 50", (item_id,)).fetchall()
        return jsonify({'moves': rows_to_list(rows)})

    # ── Attachments (private — only served behind login) ─────────────────────
    def attachments_for(db, ptype, pid):
        return rows_to_list(db.execute(
            "SELECT id, original_name, mime, size FROM acc_attachments "
            "WHERE parent_type=? AND parent_id=? ORDER BY uploaded_at ASC", (ptype, pid)).fetchall())

    def attachment_count(db, ptype, pid):
        return db.execute("SELECT COUNT(*) AS n FROM acc_attachments WHERE parent_type=? AND parent_id=?",
                          (ptype, pid)).fetchone()['n']

    @app.route('/api/acc/attachments', methods=['POST'])
    @staff_required
    def acc_upload_attachment():
        ptype = request.form.get('parent_type')
        pid = request.form.get('parent_id')
        if ptype not in ('sale', 'expense', 'purchase'):
            return jsonify({'error': 'Invalid attachment target'}), 400
        lookup_sql = {
            'sale': 'SELECT id FROM acc_sales WHERE id=?',
            'expense': 'SELECT id FROM acc_expenses WHERE id=?',
            'purchase': 'SELECT id FROM acc_purchases WHERE id=?',
        }[ptype]
        if not get_db().execute(lookup_sql, (pid,)).fetchone():
            return jsonify({'error': 'Attachment target was not found'}), 404
        if attachment_count(get_db(), ptype, pid) >= 20:
            return jsonify({'error': 'Attachment limit reached for this record'}), 400
        if 'file' not in request.files or not request.files['file'].filename:
            log_account_event('bill_upload_rejected', 'warning', 'Bill upload request did not include a file', {'parent_type': ptype, 'parent_id': pid})
            return jsonify({'error': 'No file selected'}), 400
        f = request.files['file']
        try:
            meta = validate_upload(f, SAFE_ATTACHMENT_EXTENSIONS, PRIVATE_ATTACHMENT_MAX_BYTES)
        except UploadSecurityError as exc:
            log_account_event('bill_upload_rejected', 'warning', 'Blocked unsafe bill upload', {'parent_type': ptype, 'parent_id': pid, 'filename': f.filename, 'reason': str(exc)})
            return jsonify({'error': str(exc)}), 400
        stored = random_stored_name(meta['ext'])
        stored_path = bill_file_path(stored)
        if not stored_path:
            log_account_event('bill_upload_rejected', 'critical', 'Blocked unsafe bill storage path', {'parent_type': ptype, 'parent_id': pid, 'filename': f.filename})
            return jsonify({'error': 'Upload failed. Please try again.'}), 500
        f.save(stored_path)
        aid = str(uuid.uuid4())
        db = get_db()
        db.execute("INSERT INTO acc_attachments (id,parent_type,parent_id,original_name,stored_name,mime,size) "
                   "VALUES (?,?,?,?,?,?,?)", (aid, ptype, pid, meta['original_name'], stored, meta['mime'], meta['size']))
        db.commit()
        log_account_event('bill_uploaded', 'info', 'Bill attachment uploaded', {'attachment_id': aid, 'parent_type': ptype, 'parent_id': pid, 'mime': meta['mime'], 'size': meta['size']})
        audit_account_event(
            'bill_uploaded',
            'attachment',
            aid,
            'Bill attachment uploaded',
            after={'id': aid, 'parent_type': ptype, 'parent_id': pid, 'original_name': meta['original_name'], 'mime': meta['mime'], 'size': meta['size']},
            metadata={'attachment_id': aid, 'parent_type': ptype, 'parent_id': pid},
        )
        return jsonify({'attachment': {'id': aid, 'original_name': meta['original_name'], 'mime': meta['mime'], 'size': meta['size']}}), 201

    @app.route('/api/acc/attachments/<aid>/file', methods=['GET'])
    @staff_required
    def acc_serve_attachment(aid):
        row = get_db().execute("SELECT stored_name, mime, original_name FROM acc_attachments WHERE id=?",
                              (aid,)).fetchone()
        if not row or not is_safe_stored_filename(row['stored_name']):
            abort(404)
        resp = send_from_directory(
            BILLS_DIR,
            row['stored_name'],
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=safe_download_name(row['original_name'])
        )
        return secure_upload_headers(resp, attachment=True)

    @app.route('/api/acc/attachments/<aid>', methods=['DELETE'])
    @staff_required
    def acc_delete_attachment(aid):
        db = get_db()
        row = db.execute("SELECT stored_name FROM acc_attachments WHERE id=?", (aid,)).fetchone()
        if row:
            remove_bill_file(row['stored_name'])
            db.execute("DELETE FROM acc_attachments WHERE id=?", (aid,))
            db.commit()
            log_account_event('bill_deleted', 'info', 'Bill attachment deleted', {'attachment_id': aid})
            audit_account_event('bill_deleted', 'attachment', aid, 'Bill attachment deleted', before={'id': aid, 'stored_name': row['stored_name']}, metadata={'attachment_id': aid})
        return jsonify({'message': 'Attachment removed'})

    # ── Vendors ──────────────────────────────────────────────────────────────
    def vendor_name(db, vid):
        if not vid:
            return None
        r = db.execute("SELECT name FROM acc_vendors WHERE id=?", (vid,)).fetchone()
        return r['name'] if r else None

    @app.route('/api/acc/vendors', methods=['GET'])
    @staff_required
    def acc_list_vendors():
        db = get_db()
        rows = db.execute("""
            SELECT v.*,
              (SELECT IFNULL(SUM(total),0) FROM acc_purchases WHERE vendor_id=v.id) AS purchase_total,
              (SELECT IFNULL(SUM(amount),0) FROM acc_expenses WHERE vendor_id=v.id) AS expense_total
            FROM acc_vendors v WHERE v.is_active=1 ORDER BY v.name COLLATE NOCASE ASC""").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d['total_spent'] = round((r['purchase_total'] or 0) + (r['expense_total'] or 0), 2)
            d['purchase_total'] = round(r['purchase_total'] or 0, 2)
            d['expense_total'] = round(r['expense_total'] or 0, 2)
            out.append(d)
        return jsonify({'vendors': out})

    @app.route('/api/acc/vendors/<vid>', methods=['GET'])
    @staff_required
    def acc_get_vendor(vid):
        db = get_db()
        v = db.execute("SELECT * FROM acc_vendors WHERE id=?", (vid,)).fetchone()
        if not v:
            return jsonify({'error': 'Vendor not found'}), 404
        out = dict(v)
        purchases = rows_to_list(db.execute(
            "SELECT id, purchase_date, total, ref_no FROM acc_purchases WHERE vendor_id=? ORDER BY purchase_date DESC", (vid,)).fetchall())
        for p in purchases:
            p['items'] = rows_to_list(db.execute("SELECT name, qty, unit_cost FROM acc_purchase_items WHERE purchase_id=?", (p['id'],)).fetchall())
            p['attachment_count'] = attachment_count(db, 'purchase', p['id'])
        expenses = rows_to_list(db.execute(
            "SELECT id, expense_date, category, amount, payee FROM acc_expenses WHERE vendor_id=? ORDER BY expense_date DESC", (vid,)).fetchall())
        for e in expenses:
            e['attachment_count'] = attachment_count(db, 'expense', e['id'])
        out['purchases'] = purchases
        out['expenses'] = expenses
        out['purchase_total'] = round(sum(p['total'] or 0 for p in purchases), 2)
        out['expense_total'] = round(sum(e['amount'] or 0 for e in expenses), 2)
        out['total_spent'] = round(out['purchase_total'] + out['expense_total'], 2)
        return jsonify({'vendor': out})

    def _vendor_payload(data):
        return ((data.get('name') or '').strip(), (data.get('contact_name') or '').strip(),
                (data.get('phone') or '').strip(), (data.get('email') or '').strip(),
                (data.get('address') or '').strip(), (data.get('notes') or '').strip())

    @app.route('/api/acc/vendors', methods=['POST'])
    @staff_required
    def acc_create_vendor():
        data = request.json or {}
        name, contact_name, phone, email, address, notes = _vendor_payload(data)
        if not name:
            return jsonify({'error': 'Vendor company name is required'}), 400
        vid = str(uuid.uuid4())
        db = get_db()
        db.execute("INSERT INTO acc_vendors (id,name,contact_name,phone,email,address,notes) VALUES (?,?,?,?,?,?,?)",
                   (vid, name, contact_name, phone, email, address, notes))
        db.commit()
        audit_account_event('vendor_created', 'vendor', vid, f'Vendor created: {name}', after={'id': vid, 'name': name, 'contact_name': contact_name, 'email': email})
        return jsonify({'vendor': dict(db.execute("SELECT * FROM acc_vendors WHERE id=?", (vid,)).fetchone())}), 201

    @app.route('/api/acc/vendors/<vid>', methods=['PUT'])
    @staff_required
    def acc_update_vendor(vid):
        data = request.json or {}
        name, contact_name, phone, email, address, notes = _vendor_payload(data)
        if not name:
            return jsonify({'error': 'Vendor company name is required'}), 400
        db = get_db()
        existing = db.execute("SELECT * FROM acc_vendors WHERE id=?", (vid,)).fetchone()
        if not existing:
            return jsonify({'error': 'Vendor not found'}), 404
        before = dict(existing)
        db.execute("UPDATE acc_vendors SET name=?,contact_name=?,phone=?,email=?,address=?,notes=? WHERE id=?",
                   (name, contact_name, phone, email, address, notes, vid))
        db.commit()
        audit_account_event('vendor_updated', 'vendor', vid, f'Vendor updated: {name}', before=before, after={'id': vid, 'name': name, 'contact_name': contact_name, 'email': email})
        return jsonify({'vendor': dict(db.execute("SELECT * FROM acc_vendors WHERE id=?", (vid,)).fetchone())})

    @app.route('/api/acc/vendors/<vid>', methods=['DELETE'])
    @staff_required
    def acc_delete_vendor(vid):
        db = get_db()
        existing = db.execute("SELECT * FROM acc_vendors WHERE id=?", (vid,)).fetchone()
        # Keep the purchases/expenses; just unlink them so history stays intact.
        db.execute("UPDATE acc_purchases SET vendor_id=NULL WHERE vendor_id=?", (vid,))
        db.execute("UPDATE acc_expenses SET vendor_id=NULL WHERE vendor_id=?", (vid,))
        db.execute("DELETE FROM acc_vendors WHERE id=?", (vid,))
        db.commit()
        audit_account_event('vendor_deleted', 'vendor', vid, 'Vendor deleted', before=dict(existing) if existing else None)
        return jsonify({'message': 'Vendor removed'})

    # ── Customers (the shop's users with role=customer) ──────────────────────
    def customer_obj(r):
        full = (r['name'] or '').strip() or ((r['first_name'] or '') + ' ' + (r['last_name'] or '')).strip()
        return {'id': r['id'], 'name': full, 'first_name': r['first_name'] or '',
                'last_name': r['last_name'] or '', 'email': r['email'] or '', 'phone': r['phone'] or ''}

    @app.route('/api/acc/customers', methods=['GET'])
    @staff_required
    def acc_list_customers():
        db = get_db()
        q = (request.args.get('q') or '').strip().lower()
        sql = "SELECT id,name,first_name,last_name,email,phone FROM users WHERE role='customer'"
        params = []
        if q:
            like = f'%{q}%'
            sql += (" AND (lower(IFNULL(name,'')) LIKE ? OR lower(IFNULL(first_name,'')) LIKE ? OR "
                    "lower(IFNULL(last_name,'')) LIKE ? OR lower(IFNULL(email,'')) LIKE ? OR IFNULL(phone,'') LIKE ?)")
            params = [like, like, like, like, like]
        sql += " ORDER BY name COLLATE NOCASE ASC LIMIT 20"
        return jsonify({'customers': [customer_obj(r) for r in db.execute(sql, params).fetchall()]})

    @app.route('/api/acc/customers', methods=['POST'])
    @staff_required
    def acc_create_customer():
        data = request.json or {}
        first = (data.get('first_name') or '').strip()
        last = (data.get('last_name') or '').strip()
        email = (data.get('email') or '').strip().lower()
        phone = (data.get('phone') or '').strip()
        if not (first and last and email and phone):
            return jsonify({'error': 'First name, last name, email and phone are all required'}), 400
        db = get_db()
        # Email already on file? Reuse that customer — never create a duplicate.
        existing = db.execute("SELECT id,name,first_name,last_name,email,phone FROM users WHERE lower(email)=?", (email,)).fetchone()
        if existing:
            return jsonify({'customer': customer_obj(existing), 'existed': True})
        uid = str(uuid.uuid4())
        name = (first + ' ' + last).strip()
        pw = bcrypt.hashpw(secrets.token_hex(16).encode(), bcrypt.gensalt()).decode()
        db.execute("INSERT INTO users (id,name,first_name,last_name,email,phone,password,role,token_version) "
                   "VALUES (?,?,?,?,?,?,?,?,0)", (uid, name, first, last, email, phone, pw, 'customer'))
        db.commit()
        r = db.execute("SELECT id,name,first_name,last_name,email,phone FROM users WHERE id=?", (uid,)).fetchone()
        audit_account_event('customer_created', 'customer', uid, f'Customer created: {name}', after=customer_obj(r), metadata={'customer_id': uid})
        return jsonify({'customer': customer_obj(r)}), 201

    # ── Sales ────────────────────────────────────────────────────────────────
    def write_sale_lines(db, sid, lines, move_stock=True):
        subtotal = cost_total = 0.0
        for li in lines:
            unit_cost = li['unit_cost']
            if li['item_id']:
                row = db.execute("SELECT cost_price FROM products WHERE id=?", (li['item_id'],)).fetchone()
                unit_cost = (row['cost_price'] if row else 0) or 0
            db.execute("INSERT INTO acc_sale_items (id,sale_id,item_id,name,qty,unit_price,unit_cost) "
                       "VALUES (?,?,?,?,?,?,?)",
                       (str(uuid.uuid4()), sid, li['item_id'], li['name'], li['qty'], li['unit_price'], unit_cost))
            subtotal += li['qty'] * li['unit_price']
            cost_total += li['qty'] * unit_cost
            if move_stock:
                _move_stock(db, li['item_id'], -li['qty'], 'Sale', 'sale', sid)
        return subtotal, cost_total

    def reverse_sale_stock(db, sid, move_stock=True):
        if move_stock:
            for li in db.execute("SELECT item_id, qty FROM acc_sale_items WHERE sale_id=?", (sid,)).fetchall():
                if li['item_id']:
                    db.execute("UPDATE products SET stock = stock + ? WHERE id=?", (li['qty'], li['item_id']))
        db.execute("DELETE FROM acc_stock_moves WHERE ref_type='sale' AND ref_id=?", (sid,))
        db.execute("DELETE FROM acc_sale_items WHERE sale_id=?", (sid,))

    def sale_detail(db, sid):
        s = db.execute("SELECT * FROM acc_sales WHERE id=?", (sid,)).fetchone()
        if not s:
            return None
        out = dict(s)
        out['items'] = rows_to_list(db.execute("SELECT * FROM acc_sale_items WHERE sale_id=?", (sid,)).fetchall())
        out['attachments'] = attachments_for(db, 'sale', sid)
        return out

    @app.route('/api/acc/sales', methods=['GET'])
    @staff_required
    def acc_list_sales():
        db = get_db()
        month = request.args.get('month')
        sql = "SELECT * FROM acc_sales WHERE 1=1"
        params = []
        if month:
            sql += " AND sale_date LIKE ?"; params.append(month + '%')
        sql += " ORDER BY sale_date DESC, created_at DESC"
        sales = rows_to_list(db.execute(sql, params).fetchall())
        for s in sales:
            s['attachment_count'] = attachment_count(db, 'sale', s['id'])
        return jsonify({'sales': sales})

    @app.route('/api/acc/sales/<sid>', methods=['GET'])
    @staff_required
    def acc_get_sale(sid):
        d = sale_detail(get_db(), sid)
        if not d:
            return jsonify({'error': 'Sale not found'}), 404
        return jsonify({'sale': d})

    @app.route('/api/acc/sales', methods=['POST'])
    @staff_required
    def acc_create_sale():
        data = request.json or {}
        lines = _clean_lines(data.get('items'))
        if not lines:
            return jsonify({'error': 'Add at least one item with a quantity'}), 400
        db = get_db()
        customer_id = data.get('customer_id') or None
        if not customer_id:
            return jsonify({'error': 'Please select or add a customer'}), 400
        cust = db.execute("SELECT name,first_name,last_name FROM users WHERE id=?", (customer_id,)).fetchone()
        customer_name = (data.get('customer_name') or '').strip()
        if cust and not customer_name:
            customer_name = (cust['name'] or '').strip() or ((cust['first_name'] or '') + ' ' + (cust['last_name'] or '')).strip()
        sid = str(uuid.uuid4())
        discount = float(data.get('discount') or 0)
        db.execute("INSERT INTO acc_sales (id,ref_no,sale_date,channel,customer_name,customer_id,payment_method,notes,discount,created_by) "
                   "VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (sid, (data.get('ref_no') or '').strip(), data.get('sale_date') or datetime.date.today().isoformat(),
                    data.get('channel') or 'manual', customer_name, customer_id,
                    data.get('payment_method') or '', (data.get('notes') or '').strip(), discount, g.user['id']))
        subtotal, cost_total = write_sale_lines(db, sid, lines)
        discount = max(0.0, min(discount, subtotal))
        total = subtotal - discount
        db.execute("UPDATE acc_sales SET subtotal=?, discount=?, total=?, cost_total=?, profit=? WHERE id=?",
                   (subtotal, discount, total, cost_total, total - cost_total, sid))
        db.commit()
        audit_account_event(
            'sale_created',
            'sale',
            sid,
            f'Sale created: {customer_name or sid}',
            after={'id': sid, 'customer_id': customer_id, 'customer_name': customer_name, 'total': total, 'profit': total - cost_total},
            metadata={'sale_id': sid, 'customer_id': customer_id},
        )
        return jsonify({'sale': sale_detail(db, sid)}), 201

    @app.route('/api/acc/sales/<sid>', methods=['PUT'])
    @staff_required
    def acc_update_sale(sid):
        data = request.json or {}
        db = get_db()
        before = sale_detail(db, sid)
        ex = db.execute("SELECT channel FROM acc_sales WHERE id=?", (sid,)).fetchone()
        if not ex:
            return jsonify({'error': 'Sale not found'}), 404
        lines = _clean_lines(data.get('items'))
        if not lines:
            return jsonify({'error': 'Add at least one item with a quantity'}), 400
        move = ex['channel'] != 'online'
        reverse_sale_stock(db, sid, move_stock=move)
        discount = float(data.get('discount') or 0)
        cid = data.get('customer_id') or None
        cname = (data.get('customer_name') or '').strip()
        if cid:
            cust = db.execute("SELECT name,first_name,last_name FROM users WHERE id=?", (cid,)).fetchone()
            if cust and not cname:
                cname = (cust['name'] or '').strip() or ((cust['first_name'] or '') + ' ' + (cust['last_name'] or '')).strip()
            db.execute("UPDATE acc_sales SET ref_no=?, sale_date=?, channel=?, customer_name=?, customer_id=?, payment_method=?, notes=?, discount=? WHERE id=?",
                       ((data.get('ref_no') or '').strip(), data.get('sale_date') or datetime.date.today().isoformat(),
                        data.get('channel') or 'manual', cname, cid,
                        data.get('payment_method') or '', (data.get('notes') or '').strip(), discount, sid))
        else:
            db.execute("UPDATE acc_sales SET ref_no=?, sale_date=?, channel=?, payment_method=?, notes=?, discount=? WHERE id=?",
                       ((data.get('ref_no') or '').strip(), data.get('sale_date') or datetime.date.today().isoformat(),
                        data.get('channel') or 'manual',
                        data.get('payment_method') or '', (data.get('notes') or '').strip(), discount, sid))
        subtotal, cost_total = write_sale_lines(db, sid, lines, move_stock=move)
        discount = max(0.0, min(discount, subtotal))
        total = subtotal - discount
        db.execute("UPDATE acc_sales SET subtotal=?, discount=?, total=?, cost_total=?, profit=? WHERE id=?",
                   (subtotal, discount, total, cost_total, total - cost_total, sid))
        db.commit()
        after = sale_detail(db, sid)
        audit_account_event('sale_updated', 'sale', sid, 'Sale updated', before=before, after=after, metadata={'sale_id': sid})
        return jsonify({'sale': after})

    @app.route('/api/acc/sales/<sid>', methods=['DELETE'])
    @staff_required
    def acc_delete_sale(sid):
        db = get_db()
        before = sale_detail(db, sid)
        ex = db.execute("SELECT channel FROM acc_sales WHERE id=?", (sid,)).fetchone()
        if not ex:
            return jsonify({'error': 'Sale not found'}), 404
        reverse_sale_stock(db, sid, move_stock=(ex['channel'] != 'online'))
        for a in db.execute("SELECT stored_name FROM acc_attachments WHERE parent_type='sale' AND parent_id=?", (sid,)).fetchall():
            remove_bill_file(a['stored_name'])
        db.execute("DELETE FROM acc_attachments WHERE parent_type='sale' AND parent_id=?", (sid,))
        db.execute("DELETE FROM acc_sales WHERE id=?", (sid,))
        db.commit()
        audit_account_event('sale_deleted', 'sale', sid, 'Sale deleted', before=before, metadata={'sale_id': sid})
        return jsonify({'message': 'Sale deleted'})

    # ── Expenses ─────────────────────────────────────────────────────────────
    @app.route('/api/acc/expenses', methods=['GET'])
    @staff_required
    def acc_list_expenses():
        db = get_db()
        month = request.args.get('month')
        sql = "SELECT e.*, v.name AS vendor_name FROM acc_expenses e LEFT JOIN acc_vendors v ON v.id=e.vendor_id WHERE 1=1"
        params = []
        if month:
            sql += " AND e.expense_date LIKE ?"; params.append(month + '%')
        sql += " ORDER BY e.expense_date DESC, e.created_at DESC"
        expenses = rows_to_list(db.execute(sql, params).fetchall())
        for e in expenses:
            e['attachment_count'] = attachment_count(db, 'expense', e['id'])
        return jsonify({'expenses': expenses})

    @app.route('/api/acc/expenses/<eid>', methods=['GET'])
    @staff_required
    def acc_get_expense(eid):
        db = get_db()
        e = db.execute("SELECT e.*, v.name AS vendor_name FROM acc_expenses e LEFT JOIN acc_vendors v ON v.id=e.vendor_id WHERE e.id=?", (eid,)).fetchone()
        if not e:
            return jsonify({'error': 'Expense not found'}), 404
        out = dict(e); out['attachments'] = attachments_for(db, 'expense', eid)
        return jsonify({'expense': out})

    def expense_payload(data):
        return (data.get('expense_date') or datetime.date.today().isoformat(),
                (data.get('category') or '').strip(), (data.get('payee') or '').strip(),
                data.get('payment_method') or '', float(data.get('amount') or 0),
                (data.get('notes') or '').strip(), data.get('vendor_id') or None)

    @app.route('/api/acc/expenses', methods=['POST'])
    @staff_required
    def acc_create_expense():
        data = request.json or {}
        if float(data.get('amount') or 0) <= 0:
            return jsonify({'error': 'Enter an amount greater than zero'}), 400
        date, cat, payee, pay, amount, notes, vendor_id = expense_payload(data)
        eid = str(uuid.uuid4())
        db = get_db()
        db.execute("INSERT INTO acc_expenses (id,expense_date,category,payee,payment_method,amount,notes,vendor_id,created_by) "
                   "VALUES (?,?,?,?,?,?,?,?,?)", (eid, date, cat, payee, pay, amount, notes, vendor_id, g.user['id']))
        db.commit()
        audit_account_event('expense_created', 'expense', eid, f'Expense created: {payee or cat}', after={'id': eid, 'amount': amount, 'category': cat, 'vendor_id': vendor_id}, metadata={'expense_id': eid, 'vendor_id': vendor_id})
        return jsonify({'expense': dict(db.execute("SELECT * FROM acc_expenses WHERE id=?", (eid,)).fetchone())}), 201

    @app.route('/api/acc/expenses/<eid>', methods=['PUT'])
    @staff_required
    def acc_update_expense(eid):
        data = request.json or {}
        db = get_db()
        existing = db.execute("SELECT * FROM acc_expenses WHERE id=?", (eid,)).fetchone()
        if not existing:
            return jsonify({'error': 'Expense not found'}), 404
        before = dict(existing)
        if float(data.get('amount') or 0) <= 0:
            return jsonify({'error': 'Enter an amount greater than zero'}), 400
        date, cat, payee, pay, amount, notes, vendor_id = expense_payload(data)
        db.execute("UPDATE acc_expenses SET expense_date=?,category=?,payee=?,payment_method=?,amount=?,notes=?,vendor_id=? WHERE id=?",
                   (date, cat, payee, pay, amount, notes, vendor_id, eid))
        db.commit()
        audit_account_event('expense_updated', 'expense', eid, f'Expense updated: {payee or cat}', before=before, after={'id': eid, 'amount': amount, 'category': cat, 'vendor_id': vendor_id}, metadata={'expense_id': eid, 'vendor_id': vendor_id})
        return jsonify({'expense': dict(db.execute("SELECT * FROM acc_expenses WHERE id=?", (eid,)).fetchone())})

    @app.route('/api/acc/expenses/<eid>', methods=['DELETE'])
    @staff_required
    def acc_delete_expense(eid):
        db = get_db()
        existing = db.execute("SELECT * FROM acc_expenses WHERE id=?", (eid,)).fetchone()
        for a in db.execute("SELECT stored_name FROM acc_attachments WHERE parent_type='expense' AND parent_id=?", (eid,)).fetchall():
            remove_bill_file(a['stored_name'])
        db.execute("DELETE FROM acc_attachments WHERE parent_type='expense' AND parent_id=?", (eid,))
        db.execute("DELETE FROM acc_expenses WHERE id=?", (eid,))
        db.commit()
        audit_account_event('expense_deleted', 'expense', eid, 'Expense deleted', before=dict(existing) if existing else None, metadata={'expense_id': eid})
        return jsonify({'message': 'Expense deleted'})

    # ── Purchases ────────────────────────────────────────────────────────────
    def write_purchase_lines(db, pid, lines):
        total = 0.0
        for li in lines:
            db.execute("INSERT INTO acc_purchase_items (id,purchase_id,item_id,name,qty,unit_cost) VALUES (?,?,?,?,?,?)",
                       (str(uuid.uuid4()), pid, li['item_id'], li['name'], li['qty'], li['unit_cost']))
            total += li['qty'] * li['unit_cost']
            if li['item_id']:
                _move_stock(db, li['item_id'], li['qty'], 'Stock purchase', 'purchase', pid)
                if li['unit_cost'] > 0:
                    db.execute("UPDATE products SET cost_price=? WHERE id=?", (li['unit_cost'], li['item_id']))
        return total

    def reverse_purchase_stock(db, pid):
        for li in db.execute("SELECT item_id, qty FROM acc_purchase_items WHERE purchase_id=?", (pid,)).fetchall():
            if li['item_id']:
                db.execute("UPDATE products SET stock = stock - ? WHERE id=?", (li['qty'], li['item_id']))
        db.execute("DELETE FROM acc_stock_moves WHERE ref_type='purchase' AND ref_id=?", (pid,))
        db.execute("DELETE FROM acc_purchase_items WHERE purchase_id=?", (pid,))

    def purchase_detail(db, pid):
        p = db.execute("SELECT pu.*, v.name AS vendor_name FROM acc_purchases pu LEFT JOIN acc_vendors v ON v.id=pu.vendor_id WHERE pu.id=?", (pid,)).fetchone()
        if not p:
            return None
        out = dict(p)
        out['items'] = rows_to_list(db.execute("SELECT * FROM acc_purchase_items WHERE purchase_id=?", (pid,)).fetchall())
        out['attachments'] = attachments_for(db, 'purchase', pid)
        return out

    @app.route('/api/acc/purchases', methods=['GET'])
    @staff_required
    def acc_list_purchases():
        db = get_db()
        month = request.args.get('month')
        sql = "SELECT pu.*, v.name AS vendor_name FROM acc_purchases pu LEFT JOIN acc_vendors v ON v.id=pu.vendor_id WHERE 1=1"
        params = []
        if month:
            sql += " AND pu.purchase_date LIKE ?"; params.append(month + '%')
        sql += " ORDER BY pu.purchase_date DESC, pu.created_at DESC"
        purchases = rows_to_list(db.execute(sql, params).fetchall())
        for p in purchases:
            p['attachment_count'] = attachment_count(db, 'purchase', p['id'])
        return jsonify({'purchases': purchases})

    @app.route('/api/acc/purchases/<pid>', methods=['GET'])
    @staff_required
    def acc_get_purchase(pid):
        d = purchase_detail(get_db(), pid)
        if not d:
            return jsonify({'error': 'Purchase not found'}), 404
        return jsonify({'purchase': d})

    @app.route('/api/acc/purchases', methods=['POST'])
    @staff_required
    def acc_create_purchase():
        data = request.json or {}
        lines = _clean_lines(data.get('items'))
        if not lines:
            return jsonify({'error': 'Add at least one item with a quantity'}), 400
        db = get_db()
        pid = str(uuid.uuid4())
        db.execute("INSERT INTO acc_purchases (id,ref_no,purchase_date,supplier,payment_method,notes,vendor_id,created_by) "
                   "VALUES (?,?,?,?,?,?,?,?)",
                   (pid, (data.get('ref_no') or '').strip(), data.get('purchase_date') or datetime.date.today().isoformat(),
                    (data.get('supplier') or '').strip(), data.get('payment_method') or '',
                    (data.get('notes') or '').strip(), data.get('vendor_id') or None, g.user['id']))
        total = write_purchase_lines(db, pid, lines)
        db.execute("UPDATE acc_purchases SET total=? WHERE id=?", (total, pid))
        db.commit()
        audit_account_event('purchase_created', 'purchase', pid, 'Purchase created', after={'id': pid, 'total': total, 'vendor_id': data.get('vendor_id') or None}, metadata={'purchase_id': pid, 'vendor_id': data.get('vendor_id') or None})
        return jsonify({'purchase': purchase_detail(db, pid)}), 201

    @app.route('/api/acc/purchases/<pid>', methods=['PUT'])
    @staff_required
    def acc_update_purchase(pid):
        data = request.json or {}
        db = get_db()
        before = purchase_detail(db, pid)
        if not before:
            return jsonify({'error': 'Purchase not found'}), 404
        lines = _clean_lines(data.get('items'))
        if not lines:
            return jsonify({'error': 'Add at least one item with a quantity'}), 400
        reverse_purchase_stock(db, pid)
        db.execute("UPDATE acc_purchases SET ref_no=?, purchase_date=?, supplier=?, payment_method=?, notes=?, vendor_id=? WHERE id=?",
                   ((data.get('ref_no') or '').strip(), data.get('purchase_date') or datetime.date.today().isoformat(),
                    (data.get('supplier') or '').strip(), data.get('payment_method') or '',
                    (data.get('notes') or '').strip(), data.get('vendor_id') or None, pid))
        total = write_purchase_lines(db, pid, lines)
        db.execute("UPDATE acc_purchases SET total=? WHERE id=?", (total, pid))
        db.commit()
        after = purchase_detail(db, pid)
        audit_account_event('purchase_updated', 'purchase', pid, 'Purchase updated', before=before, after=after, metadata={'purchase_id': pid, 'vendor_id': data.get('vendor_id') or None})
        return jsonify({'purchase': after})

    @app.route('/api/acc/purchases/<pid>', methods=['DELETE'])
    @staff_required
    def acc_delete_purchase(pid):
        db = get_db()
        before = purchase_detail(db, pid)
        reverse_purchase_stock(db, pid)
        for a in db.execute("SELECT stored_name FROM acc_attachments WHERE parent_type='purchase' AND parent_id=?", (pid,)).fetchall():
            remove_bill_file(a['stored_name'])
        db.execute("DELETE FROM acc_attachments WHERE parent_type='purchase' AND parent_id=?", (pid,))
        db.execute("DELETE FROM acc_purchases WHERE id=?", (pid,))
        db.commit()
        audit_account_event('purchase_deleted', 'purchase', pid, 'Purchase deleted', before=before, metadata={'purchase_id': pid})
        return jsonify({'message': 'Purchase deleted'})

    # ── Shared metrics engine (used by dashboard + reports) ──────────────────
    def compute_metrics(db, frm, to):
        sc = lambda sql, p: db.execute(sql, p).fetchone()[0] or 0
        sales = sc("SELECT SUM(total) FROM acc_sales WHERE sale_date BETWEEN ? AND ?", (frm, to))
        cogs = sc("SELECT SUM(cost_total) FROM acc_sales WHERE sale_date BETWEEN ? AND ?", (frm, to))
        gross = sc("SELECT SUM(profit) FROM acc_sales WHERE sale_date BETWEEN ? AND ?", (frm, to))
        sales_count = sc("SELECT COUNT(*) FROM acc_sales WHERE sale_date BETWEEN ? AND ?", (frm, to))
        expenses = sc("SELECT SUM(amount) FROM acc_expenses WHERE expense_date BETWEEN ? AND ?", (frm, to))
        purchases = sc("SELECT SUM(total) FROM acc_purchases WHERE purchase_date BETWEEN ? AND ?", (frm, to))
        net = gross - expenses
        stock_value = sc("SELECT SUM(stock*cost_price) FROM products WHERE is_active=1", ())
        retail_value = sc("SELECT SUM(stock*price) FROM products WHERE is_active=1", ())
        return {
            'from': frm, 'to': to,
            'total_sales': round(sales, 2), 'product_cost': round(cogs, 2),
            'gross_profit': round(gross, 2), 'expenses_total': round(expenses, 2),
            'net_profit': round(net, 2), 'purchases_total': round(purchases, 2),
            'cash_available': round(net - purchases, 2),           # net profit after restocking (owner's model)
            'inventory_cost_value': round(stock_value, 2), 'inventory_retail_value': round(retail_value, 2),
            'sales_count': sales_count,
        }

    def best_sellers(db, frm, to, limit=8):
        rows = db.execute("""SELECT si.name name, SUM(si.qty) qty, SUM(si.qty*si.unit_price) revenue,
            SUM(si.qty*(si.unit_price-si.unit_cost)) profit FROM acc_sale_items si JOIN acc_sales s ON s.id=si.sale_id
            WHERE s.sale_date BETWEEN ? AND ? GROUP BY si.name ORDER BY revenue DESC LIMIT ?""", (frm, to, limit)).fetchall()
        return [{'name': r['name'], 'qty': r['qty'], 'revenue': round(r['revenue'] or 0, 2),
                 'profit': round(r['profit'] or 0, 2)} for r in rows]

    def vendor_summary(db, frm, to, limit=8):
        rows = db.execute("""SELECT v.id, v.name,
            (SELECT IFNULL(SUM(total),0) FROM acc_purchases WHERE vendor_id=v.id AND purchase_date BETWEEN ? AND ?) +
            (SELECT IFNULL(SUM(amount),0) FROM acc_expenses WHERE vendor_id=v.id AND expense_date BETWEEN ? AND ?) AS spent
            FROM acc_vendors v WHERE v.is_active=1 ORDER BY spent DESC LIMIT ?""", (frm, to, frm, to, limit)).fetchall()
        return [{'id': r['id'], 'name': r['name'], 'spent': round(r['spent'] or 0, 2)} for r in rows if (r['spent'] or 0) > 0]

    def low_stock(db, limit=20):
        return rows_to_list(db.execute(
            "SELECT id,name,stock,low_stock_threshold FROM products "
            "WHERE is_active=1 AND stock <= low_stock_threshold ORDER BY stock ASC LIMIT ?", (limit,)).fetchall())

    # ── Dashboard ────────────────────────────────────────────────────────────
    @app.route('/api/acc/dashboard', methods=['GET'])
    @staff_required
    def acc_dashboard():
        db = get_db()
        frm, to = date_range()
        m = compute_metrics(db, frm, to)
        recent = []
        for s in db.execute("SELECT id,customer_name,channel,total,sale_date,created_at FROM acc_sales ORDER BY created_at DESC LIMIT 6"):
            recent.append({'type': 'sale', 'id': s['id'],
                           'label': s['customer_name'] or ('Online sale' if s['channel'] == 'online' else 'Walk-in sale'),
                           'sub': s['sale_date'], 'amount': round(s['total'] or 0, 2),
                           'has_attachment': attachment_count(db, 'sale', s['id']) > 0, 'created_at': s['created_at']})
        for e in db.execute("SELECT id,category,payee,amount,expense_date,created_at FROM acc_expenses ORDER BY created_at DESC LIMIT 6"):
            recent.append({'type': 'expense', 'id': e['id'], 'label': e['payee'] or e['category'] or 'Expense',
                           'sub': e['category'] or e['expense_date'], 'amount': -round(e['amount'] or 0, 2),
                           'has_attachment': attachment_count(db, 'expense', e['id']) > 0, 'created_at': e['created_at']})
        for p in db.execute("SELECT id,supplier,total,purchase_date,created_at FROM acc_purchases ORDER BY created_at DESC LIMIT 6"):
            recent.append({'type': 'purchase', 'id': p['id'], 'label': p['supplier'] or 'Stock purchase',
                           'sub': 'Supplier bill', 'amount': -round(p['total'] or 0, 2),
                           'has_attachment': attachment_count(db, 'purchase', p['id']) > 0, 'created_at': p['created_at']})
        recent.sort(key=lambda r: r['created_at'] or '', reverse=True)
        m.update({
            'money_in': m['total_sales'], 'money_out': round(m['expenses_total'] + m['purchases_total'], 2),
            'low_stock': low_stock(db), 'best_sellers': best_sellers(db, frm, to),
            'vendor_summary': vendor_summary(db, frm, to), 'recent': recent[:8],
        })
        m['low_stock_count'] = len(m['low_stock'])
        return jsonify(m)

    # ── Reports ──────────────────────────────────────────────────────────────
    @app.route('/api/acc/reports/summary', methods=['GET'])
    @staff_required
    def acc_report_summary():
        db = get_db()
        frm, to = date_range()
        m = compute_metrics(db, frm, to)
        by_cat = db.execute("SELECT category, SUM(amount) amount FROM acc_expenses WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC", (frm, to)).fetchall()
        m['expense_by_category'] = [{'category': c['category'] or 'Other', 'amount': round(c['amount'] or 0, 2)} for c in by_cat]
        m['top_items'] = best_sellers(db, frm, to)
        m['vendor_summary'] = vendor_summary(db, frm, to)
        return jsonify(m)

    @app.route('/api/acc/reports/monthly', methods=['GET'])
    @staff_required
    def acc_report_monthly():
        db = get_db()
        months = max(1, min(24, int(request.args.get('months') or 6)))
        first = datetime.date.today().replace(day=1)
        out = []
        for i in range(months - 1, -1, -1):
            y, mo = first.year, first.month - i
            while mo <= 0:
                mo += 12; y -= 1
            mk = f"{y:04d}-{mo:02d}"
            sr = db.execute("SELECT SUM(total) s, SUM(profit) p FROM acc_sales WHERE sale_date LIKE ?", (mk + '%',)).fetchone()
            er = db.execute("SELECT SUM(amount) s FROM acc_expenses WHERE expense_date LIKE ?", (mk + '%',)).fetchone()
            s, p, e = sr['s'] or 0, sr['p'] or 0, er['s'] or 0
            out.append({'month': mk, 'label': datetime.date(y, mo, 1).strftime('%b'),
                        'sales': round(s, 2), 'expenses': round(e, 2), 'profit': round(p - e, 2)})
        return jsonify({'months': out})

    @app.route('/api/acc/reports/inventory', methods=['GET'])
    @staff_required
    def acc_report_inventory():
        db = get_db()
        rows = db.execute("SELECT id,name,sku,stock,cost_price,price,low_stock_threshold FROM products WHERE is_active=1 ORDER BY name COLLATE NOCASE").fetchall()
        items = [{'id': r['id'], 'name': r['name'], 'sku': r['sku'] or '', 'stock': r['stock'] or 0,
                  'cost_price': r['cost_price'] or 0, 'sale_price': r['price'] or 0,
                  'cost_value': round((r['stock'] or 0) * (r['cost_price'] or 0), 2),
                  'retail_value': round((r['stock'] or 0) * (r['price'] or 0), 2),
                  'low': (r['stock'] or 0) <= (r['low_stock_threshold'] if r['low_stock_threshold'] is not None else 5)} for r in rows]
        return jsonify({'items': items,
                        'total_cost_value': round(sum(i['cost_value'] for i in items), 2),
                        'total_retail_value': round(sum(i['retail_value'] for i in items), 2)})

    @app.route('/api/acc/reports/stock-moves', methods=['GET'])
    @staff_required
    def acc_report_stock_moves():
        db = get_db()
        frm, to = date_range()
        rows = db.execute("""SELECT m.created_at, m.change, m.reason, p.name
            FROM acc_stock_moves m LEFT JOIN products p ON p.id=m.item_id
            WHERE date(m.created_at) BETWEEN ? AND ? ORDER BY m.created_at DESC LIMIT 500""", (frm, to)).fetchall()
        return jsonify({'moves': [{'date': r['created_at'], 'item': r['name'] or '—',
                                   'change': r['change'], 'reason': r['reason']} for r in rows]})

    @app.route('/api/acc/reports/export', methods=['GET'])
    @staff_required
    def acc_report_export():
        db = get_db()
        frm, to = date_range()
        typ = clean_text(request.args.get('type'), 20).lower() or 'sales'
        if typ not in ('sales', 'purchases', 'expenses', 'inventory'):
            typ = 'sales'
        buf = io.StringIO(); w = csv.writer(buf)
        qf = lambda n: ('%g' % (n or 0))
        if typ == 'expenses':
            w.writerow(['Date', 'Category', 'Vendor / Paid to', 'Payment', 'Amount', 'Notes'])
            for e in db.execute("SELECT e.*, v.name vn FROM acc_expenses e LEFT JOIN acc_vendors v ON v.id=e.vendor_id WHERE e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date", (frm, to)):
                w.writerow([e['expense_date'], e['category'], e['vn'] or e['payee'], e['payment_method'], '%.2f' % (e['amount'] or 0), e['notes']])
        elif typ == 'purchases':
            w.writerow(['Date', 'Vendor / Supplier', 'Payment', 'Items', 'Total cost'])
            for p in db.execute("SELECT pu.*, v.name vn FROM acc_purchases pu LEFT JOIN acc_vendors v ON v.id=pu.vendor_id WHERE pu.purchase_date BETWEEN ? AND ? ORDER BY pu.purchase_date", (frm, to)):
                items = db.execute("SELECT name, qty FROM acc_purchase_items WHERE purchase_id=?", (p['id'],)).fetchall()
                w.writerow([p['purchase_date'], p['vn'] or p['supplier'], p['payment_method'],
                            '; '.join(f"{r['name']} x{qf(r['qty'])}" for r in items), '%.2f' % (p['total'] or 0)])
        elif typ == 'inventory':
            w.writerow(['Item', 'SKU', 'Stock', 'Cost price', 'Sale price', 'Cost value', 'Retail value'])
            for r in db.execute("SELECT name,sku,stock,cost_price,price FROM products WHERE is_active=1 ORDER BY name"):
                w.writerow([r['name'], r['sku'], qf(r['stock']), '%.2f' % (r['cost_price'] or 0), '%.2f' % (r['price'] or 0),
                            '%.2f' % ((r['stock'] or 0)*(r['cost_price'] or 0)), '%.2f' % ((r['stock'] or 0)*(r['price'] or 0))])
        else:
            w.writerow(['Date', 'Customer', 'Type', 'Payment', 'Items', 'Subtotal', 'Discount', 'Total', 'Cost', 'Profit'])
            for s in db.execute("SELECT * FROM acc_sales WHERE sale_date BETWEEN ? AND ? ORDER BY sale_date", (frm, to)):
                items = db.execute("SELECT name, qty FROM acc_sale_items WHERE sale_id=?", (s['id'],)).fetchall()
                w.writerow([s['sale_date'], s['customer_name'], s['channel'], s['payment_method'],
                            '; '.join(f"{r['name']} x{qf(r['qty'])}" for r in items), '%.2f' % (s['subtotal'] or 0),
                            '%.2f' % (s['discount'] or 0), '%.2f' % (s['total'] or 0), '%.2f' % (s['cost_total'] or 0),
                            '%.2f' % (s['profit'] or 0)])
        filename = f'{typ}_{frm}_to_{to}.csv'
        return Response(buf.getvalue(), mimetype='text/csv',
                        headers={
                            'Content-Disposition': f'attachment; filename="{filename}"',
                            'X-Content-Type-Options': 'nosniff',
                            'Cache-Control': 'no-store, max-age=0',
                        })

    # ── Website order -> online sale sync ────────────────────────────────────
    def sync_order(db, order_id):
        o = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if not o or db.execute("SELECT id FROM acc_sales WHERE order_id=?", (order_id,)).fetchone():
            return
        try:
            items = json.loads(o['items'] or '[]')
        except Exception:
            items = []
        sid = str(uuid.uuid4())
        sale_date = (o['created_at'] or datetime.date.today().isoformat())[:10]
        db.execute("INSERT INTO acc_sales (id,order_id,ref_no,sale_date,channel,customer_name,customer_id,payment_method,discount,created_by) "
                   "VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (sid, order_id, o['order_number'], sale_date, 'online', o['customer_name'], o['user_id'], 'card',
                    o['discount'] or 0, o['user_id']))
        subtotal = cost_total = 0.0
        for it in items:
            pid = it.get('id')
            qty = float(it.get('qty', 1) or 1)
            prod = db.execute("SELECT price, cost_price FROM products WHERE id=?", (pid,)).fetchone() if pid else None
            price = float(prod['price']) if prod else float(it.get('price', 0) or 0)
            cost = float(prod['cost_price'] or 0) if prod else 0.0
            cp = it.get('customPrint') or {}
            if cp:
                price += float(cp.get('extra_charge', 0) or 0)
            db.execute("INSERT INTO acc_sale_items (id,sale_id,item_id,name,qty,unit_price,unit_cost) VALUES (?,?,?,?,?,?,?)",
                       (str(uuid.uuid4()), sid, pid, it.get('name') or 'Item', qty, price, cost))
            subtotal += qty * price
            cost_total += qty * cost
        shipping = o['shipping_charge'] or 0
        if shipping:
            db.execute("INSERT INTO acc_sale_items (id,sale_id,item_id,name,qty,unit_price,unit_cost) VALUES (?,?,?,?,?,?,?)",
                       (str(uuid.uuid4()), sid, None, 'Shipping', 1, shipping, 0))
            subtotal += shipping
        discount = o['discount'] or 0
        total = subtotal - discount
        db.execute("UPDATE acc_sales SET subtotal=?, total=?, cost_total=?, profit=? WHERE id=?",
                   (subtotal, total, cost_total, total - cost_total, sid))

    def void_order_sale(db, order_id):
        for s in db.execute("SELECT id FROM acc_sales WHERE order_id=?", (order_id,)).fetchall():
            db.execute("DELETE FROM acc_sale_items WHERE sale_id=?", (s['id'],))
            db.execute("DELETE FROM acc_attachments WHERE parent_type='sale' AND parent_id=?", (s['id'],))
        db.execute("DELETE FROM acc_sales WHERE order_id=?", (order_id,))

    @app.route('/api/acc/sync-orders', methods=['POST'])
    @owner_required
    def acc_sync_orders():
        db = get_db()
        for r in db.execute("SELECT id FROM orders").fetchall():
            sync_order(db, r['id'])
        db.commit()
        n = db.execute("SELECT COUNT(*) c FROM acc_sales WHERE channel='online'").fetchone()['c']
        return jsonify({'message': f'Synced. {n} online sales now in the books.', 'online_sales': n})

    app.acc_sync_order = sync_order
    app.acc_void_order_sale = void_order_sale
