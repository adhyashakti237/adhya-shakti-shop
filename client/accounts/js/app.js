// Register routes and boot the app.
Router.add('/',          Pages.dashboard);
Router.add('/sales',     Pages.sales);
Router.add('/purchases', Pages.purchases);
Router.add('/inventory', Pages.inventory);
Router.add('/categories',Pages.categories);
Router.add('/clothing',  () => Router.navigate('/categories')); // legacy bookmark: Categories now lives in the main admin menu.
Router.add('/vendors',   Pages.vendors);
Router.add('/expenses',  Pages.expenses);
Router.add('/reports',   Pages.reports);
Router.add('*',          Pages.dashboard);

Router.resolve();
