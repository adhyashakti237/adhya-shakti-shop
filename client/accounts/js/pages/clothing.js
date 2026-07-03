window.Pages = window.Pages || {};

// Compatibility for older cached admin links. The visible section is now
// Categories; this route should never present a separate Clothing manager.
Pages.clothing = function(){
  if (location.pathname !== '/accounts/categories') {
    location.replace('/accounts/categories');
    return;
  }
  if (Pages.categories) return Pages.categories();
};
