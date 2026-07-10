# Final Order Lifecycle Test

Use this checklist after a deployment when you want to prove checkout, emails, admin order handling, and customer order history still work together.

## Test Setup

- Use one real customer account, not an admin or staff account.
- Use one low-price active product with stock available.
- Use a real email inbox you can check.
- Run the test on mobile first, then quickly confirm desktop.
- Keep the Stripe dashboard open so payment status can be compared with the website order.

## Customer Checkout

1. Open the website in a private/incognito browser.
2. Log in as the test customer.
3. Add one in-stock product to cart.
4. If the product has color and size variants, select both color and size.
5. Confirm cart quantity, subtotal, shipping, discount, and total look correct.
6. Complete checkout with a real small payment.
7. Confirm the order success page shows the correct order number and total.
8. Confirm no payment intent ID or internal admin-only data is visible to the customer.

## Customer Emails

1. Confirm the customer receives the order confirmation email.
2. Confirm the email includes:
   - Order number
   - Product name
   - Quantity
   - Color and size, if applicable
   - Custom print details, if applicable
   - Subtotal
   - Shipping
   - Discount
   - Total
   - Shipping address
   - Support/contact information
3. Confirm all customer-entered text displays as plain text, not executable HTML.

## Admin Order Review

1. Log in to `/admin`.
2. Open Orders.
3. Confirm the new order appears once.
4. Open the order detail view.
5. Confirm customer contact, shipping address, payment status, product options, and totals are correct.
6. Confirm admin-only information is visible only to admin/staff.
7. Print or preview packing slip.
8. Print or preview invoice.

## Status Update Emails

1. Change order status to Processing.
2. Confirm customer receives the correct status update email.
3. Add tracking information and mark shipped.
4. Confirm customer receives the shipping/tracking email.
5. Confirm the customer order page shows the updated status and tracking wording clearly.

## Customer Account Verification

1. Log in as the customer.
2. Open customer dashboard/orders.
3. Confirm the order appears with correct status, total, and tracking.
4. Open invoice/download if available.
5. Confirm invoice/download layout is readable on mobile.

## Optional Return/Refund Flow

Only run this if you are comfortable testing the operational flow.

1. Request a return from the customer side, or mark return requested from admin if supported.
2. Confirm the return request email and admin flag are correct.
3. Test cancellation/refund email wording only when it matches the real order situation.

## Pass Criteria

The lifecycle test passes only when:

- Payment succeeds in Stripe and the website order matches it.
- Customer receives the correct emails.
- Admin/staff can manage the order.
- Customer order history is correct.
- Product stock decreases correctly.
- No duplicate orders are created.
- No internal IDs, unsafe filenames, passwords, card details, or admin-only data are exposed to the customer.
