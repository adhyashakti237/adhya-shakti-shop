# Launch Confidence Checklist

Use this after each production upload and before announcing the site widely.

## Automated Checks

Run the public smoke audit:

```bash
cd /home/adhyashakti/ecommerce
python scripts/website_smoke_audit.py --base https://adhyashaktishop.com
```

Optional login verification without saving credentials in code:

```bash
cd /home/adhyashakti/ecommerce
ADHYA_ADMIN_EMAIL='admin@example.com' ADHYA_ADMIN_PASSWORD='password' \
ADHYA_STAFF_EMAIL='staff@example.com' ADHYA_STAFF_PASSWORD='password' \
ADHYA_CUSTOMER_EMAIL='customer@example.com' ADHYA_CUSTOMER_PASSWORD='password' \
python scripts/website_smoke_audit.py --base https://adhyashaktishop.com
```

Run the local/server-side stock safety audit:

```bash
cd /home/adhyashakti/ecommerce
python scripts/launch_confidence_audit.py
```

Run the performance and asset audit:

```bash
cd /home/adhyashakti/ecommerce
python scripts/performance_asset_audit.py --base https://adhyashaktishop.com
```

If the performance audit shows oversized product upload images, dry-run the optimizer first:

```bash
cd /home/adhyashakti/ecommerce
python scripts/optimize_product_images.py
```

Only after reviewing the dry-run output, optimize product images:

```bash
cd /home/adhyashakti/ecommerce
python scripts/optimize_product_images.py --commit
```

(No reload needed — image changes are picked up immediately. If you want to
reload anyway, use the green Reload button on the PythonAnywhere Web tab.)

For the practical storefront cleanup in one step, dry-run first:

```bash
cd /home/adhyashakti/ecommerce
python scripts/store_cleanup_one_go.py --base https://adhyashaktishop.com
```

If the dry-run looks right, apply it:

```bash
cd /home/adhyashakti/ecommerce
python scripts/store_cleanup_one_go.py --commit --base https://adhyashaktishop.com
```

(No reload needed — the cleanup only changes database rows and image files.
If you want to reload anyway, use the green Reload button on the Web tab.)

## Manual Checks

1. Open the storefront on phone, tablet, and desktop.
2. Browse home, products, categories, product detail, cart, wishlist, contact, FAQ, refund, and track order.
3. Confirm out-of-stock products cannot be purchased.
4. Log in as admin and confirm Orders, Products, Categories, Customers, Reviews, Security, and Accounts & Bookkeeping open.
5. Log in as staff and confirm staff access works.
6. Review Security and mark routine reviewed events only after checking the risky/critical ones.
7. Confirm order/status/password/inquiry emails are not going to spam.
8. Confirm Stripe totals match website totals for the latest real order.

## Pass Criteria

- No public page returns 500.
- Admin, staff, and customer logins work.
- Cart validation blocks unavailable stock.
- Security page has no unexplained critical events.
- Customer emails are delivered and readable.
- Admin/staff can see new orders and update status.
