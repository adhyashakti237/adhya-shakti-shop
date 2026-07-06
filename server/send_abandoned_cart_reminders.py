#!/usr/bin/env python3
"""
Send one-time abandoned-cart reminder emails.

A checkout attempt is captured (email + cart) when a shopper reaches the payment
step. If they never complete the order, this script emails them once, after a
delay, with their items and a link back to their cart. Each cart is emailed at
most once and never after the order is completed or the shopper unsubscribes.

Designed to run on a schedule (e.g. hourly PythonAnywhere scheduled task):

    python3.10 send_abandoned_cart_reminders.py            # send due reminders
    python3.10 send_abandoned_cart_reminders.py --dry-run  # show only, send nothing
    python3.10 send_abandoned_cart_reminders.py --hours 1  # override the 24h delay (testing)
"""
import argparse
import datetime
import html
import json
import os
import smtplib
import sqlite3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
except Exception:
    pass

SERVER_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(SERVER_DIR, 'ecommerce.db')

SITE = 'https://adhyashaktishop.com'
SHOP_NAME = 'Adhya Shakti Shop'
SHOP_ADDRESS = 'Adhya Shakti Shop · New Jersey, USA'
MAIL_USER = os.environ.get('CONTACT_MAIL_USER', 'contact@adhyashaktishop.com')
MAIL_PASS = os.environ.get('CONTACT_MAIL_PASS', '')
SMTP_HOST, SMTP_PORT = 'smtp.zoho.com', 587
DEFAULT_DELAY_HOURS = 24
MAX_AGE_DAYS = 7          # don't remind carts older than this
BATCH_LIMIT = 200


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    return conn


def product_line(conn, ref):
    """Look up current product details for a stored cart ref; skip if gone/inactive."""
    if not isinstance(ref, dict) or not ref.get('id'):
        return None
    row = conn.execute(
        "SELECT id,name,price,images,is_active FROM products WHERE id=?",
        (ref.get('id'),)
    ).fetchone()
    if not row or not row['is_active']:
        return None
    try:
        images = json.loads(row['images'] or '[]')
    except Exception:
        images = []
    img = ''
    if images:
        first = str(images[0])
        img = first if first.startswith('http') else SITE + first
    try:
        qty = max(1, int(ref.get('qty') or 1))
    except Exception:
        qty = 1
    return {
        'name': row['name'] or 'Item',
        'price': float(row['price'] or 0),
        'qty': qty,
        'variation': str(ref.get('variation') or ''),
        'image': img,
        'url': '%s/product/%s' % (SITE, row['id']),
    }


def build_email(name, lines, token):
    rows = ''
    for it in lines:
        img_cell = (
            '<img src="%s" width="60" height="60" alt="%s" '
            'style="border-radius:8px;object-fit:cover;border:1px solid #eee">'
            % (html.escape(it['image']), html.escape(it['name']))
        ) if it['image'] else ''
        var = ('<div style="color:#999;font-size:12px">%s</div>' % html.escape(it['variation'])) if it['variation'] else ''
        rows += (
            '<tr>'
            '<td style="padding:10px 6px;width:68px">%s</td>'
            '<td style="padding:10px 6px">'
            '<a href="%s" style="color:#1D5C4A;font-weight:700;text-decoration:none">%s</a>%s'
            '<div style="color:#777;font-size:13px">Qty: %d</div></td>'
            '<td style="padding:10px 6px;text-align:right;white-space:nowrap;font-weight:700">$%.2f</td>'
            '</tr>'
            % (img_cell, html.escape(it['url']), html.escape(it['name']), var, it['qty'], it['price'])
        )
    hello = ('Hi %s,' % html.escape(name)) if name else 'Hi,'
    unsub = '%s/api/cart-reminders/unsubscribe/%s' % (SITE, html.escape(token or ''))
    return (
        '<!doctype html><html><body style="margin:0;background:#f6f5f2;'
        'font-family:Arial,Helvetica,sans-serif;color:#333">'
        '<div style="max-width:560px;margin:0 auto;padding:24px">'
        '<div style="text-align:center;margin-bottom:10px">'
        '<div style="font-size:22px;font-weight:800;color:#1D5C4A;font-family:Georgia,serif">%s</div></div>'
        '<div style="background:#fff;border:1px solid #eee8dd;border-radius:14px;padding:26px">'
        '<h2 style="margin:0 0 8px;color:#1D5C4A">You left something behind</h2>'
        '<p style="margin:0 0 14px">%s</p>'
        '<p style="margin:0 0 18px;color:#555;line-height:1.6">Your cart is still saved. '
        'Here\'s what you were looking at — pick up right where you left off whenever you\'re ready.</p>'
        '<table style="width:100%%;border-collapse:collapse;border-top:1px solid #f0ede6;border-bottom:1px solid #f0ede6">%s</table>'
        '<div style="text-align:center;margin:26px 0 8px">'
        '<a href="%s/cart" style="background:#1D5C4A;color:#fff;text-decoration:none;padding:13px 30px;'
        'border-radius:9px;font-weight:700;display:inline-block">Return to my cart</a></div>'
        '<p style="color:#999;font-size:12px;text-align:center;margin:10px 0 0">'
        'Items are not reserved and may sell out or change price.</p></div>'
        '<div style="text-align:center;color:#999;font-size:12px;margin-top:16px;line-height:1.7">%s<br>'
        'You received this because you started a checkout at %s.<br>'
        '<a href="%s" style="color:#999">Unsubscribe from cart reminders</a></div>'
        '</div></body></html>'
        % (SHOP_NAME, hello, rows, SITE, html.escape(SHOP_ADDRESS), SHOP_NAME, unsub)
    )


def send_email(to_addr, subject, body_html):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = '%s <%s>' % (SHOP_NAME, MAIL_USER)
    msg['To'] = to_addr
    msg['Reply-To'] = MAIL_USER
    msg.attach(MIMEText('Your cart is still saved at %s/cart' % SITE, 'plain', 'utf-8'))
    msg.attach(MIMEText(body_html, 'html', 'utf-8'))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
        s.ehlo()
        s.starttls()
        s.login(MAIL_USER, MAIL_PASS)
        s.sendmail(MAIL_USER, [to_addr], msg.as_string())


def main():
    ap = argparse.ArgumentParser(description='Send one-time abandoned-cart reminder emails.')
    ap.add_argument('--dry-run', action='store_true', help='List what would be sent; send nothing.')
    ap.add_argument('--hours', type=int, default=DEFAULT_DELAY_HOURS,
                    help='Only remind carts older than this many hours (default %d).' % DEFAULT_DELAY_HOURS)
    args = ap.parse_args()

    if not os.path.exists(DB_PATH):
        raise SystemExit('Database not found: %s' % DB_PATH)
    if not MAIL_PASS and not args.dry_run:
        raise SystemExit('CONTACT_MAIL_PASS is not set in the environment; cannot send email.')

    delay = max(0, args.hours)
    conn = connect()
    candidates = conn.execute(
        """
        SELECT id,email,name,items,recovery_token
        FROM abandoned_carts
        WHERE converted_at IS NULL AND reminded_at IS NULL AND IFNULL(unsubscribed,0)=0
          AND IFNULL(email,'') != ''
          AND datetime(created_at) <= datetime('now', ?)
          AND datetime(created_at) >= datetime('now', ?)
        ORDER BY created_at ASC
        LIMIT ?
        """,
        ('-%d hours' % delay, '-%d days' % MAX_AGE_DAYS, BATCH_LIMIT)
    ).fetchall()

    sent = skipped = failed = 0
    for row in candidates:
        try:
            refs = json.loads(row['items'] or '[]')
        except Exception:
            refs = []
        lines = [x for x in (product_line(conn, r) for r in refs) if x]
        if not lines:
            # Nothing still available to show — mark reminded so we stop re-checking it.
            conn.execute("UPDATE abandoned_carts SET reminded_at=datetime('now') WHERE id=?", (row['id'],))
            conn.commit()
            skipped += 1
            continue
        subject = 'You left something in your cart — %s' % SHOP_NAME
        if args.dry_run:
            print('WOULD SEND -> %s  (%d item(s))' % (row['email'], len(lines)))
            continue
        try:
            send_email(row['email'], subject, build_email(row['name'] or '', lines, row['recovery_token']))
            conn.execute("UPDATE abandoned_carts SET reminded_at=datetime('now') WHERE id=?", (row['id'],))
            conn.commit()
            sent += 1
            print('sent -> %s' % row['email'])
        except Exception as exc:
            failed += 1
            print('FAILED -> %s: %s' % (row['email'], exc))

    tag = '(dry run) ' if args.dry_run else ''
    print('\nDone. %scandidates=%d sent=%d skipped_no_items=%d failed=%d'
          % (tag, len(candidates), sent, skipped, failed))
    conn.close()


if __name__ == '__main__':
    main()
