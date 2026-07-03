// DEPRECATED — intentionally a no-op.
//
// This file previously patched the admin sidebar at runtime to keep the "Categories"
// link in place. It used a document-wide MutationObserver whose selector only matched
// the OLD link address (/admin/accounts/categories); since the sidebar now renders the
// new /admin/categories link, the observer kept re-injecting the link on every DOM
// change, creating an infinite loop that froze the whole admin panel.
//
// The Categories link is now rendered directly by the sidebar (dashboard.js) and the
// /admin/categories route is registered in pages/admin/accounts.js, so no runtime
// patching is needed. The file is kept (empty) only so any cached admin.html that still
// references it loads harmlessly. Safe to delete once caches have cleared.
