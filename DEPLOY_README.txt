ADHYA SHAKTI SHOP - SECURITY HARDENING PATCH

Upload this zip to your PythonAnywhere home folder, then unzip it at the
project root. This patch does not change the database, products, orders,
customers, uploads, or bills.

FILES INCLUDED:
  server/app.py
  client/js/pages/checkout.js

WHAT IT CHANGES:
  1. Removes broken third-party checkout card logo images.
  2. Adds HSTS and Permissions-Policy security headers.
  3. Removes localhost/127.0.0.1 from production CORS by default.
  4. Removes the hardcoded admin123 seed password behavior.
  5. Adds rate limits to payment, order, tracking, coupon, upload, reset,
     and password-change endpoints.
  6. Makes sensitive probe paths return real 404 responses.
  7. Validates MP4 uploads by file header, not just extension.

DEPLOY:
  cd ~/ecommerce
  unzip -o ~/security_hardening_patch.zip

Then go to PythonAnywhere Web tab and click Reload.

OPTIONAL:
  Only if you need local development CORS later, set:
  ALLOW_DEV_CORS=true
