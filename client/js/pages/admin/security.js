Router.register('/admin/security', async (params = {}) => {
  if (!Auth.isStrictAdmin()) { Router.navigate('/admin/login'); return; }
  adminLayout('<div class="spinner"></div>', '/admin/security');
  const _gen = Router._gen;

  const filters = {
    scope: params.scope || '',
    severity: params.severity || '',
    event_type: params.event_type || '',
    reviewed: params.reviewed || '',
    days: params.days || '',
    q: params.q || '',
    email: params.email || '',
    ip: params.ip || '',
    limit: params.limit || '150',
  };
  const securityTabs = [
    ['overview', 'Overview', 'fa-gauge-high'],
    ['events', 'Security Events', 'fa-list-check'],
    ['backups', 'Backups', 'fa-database'],
    ['health', 'System Health', 'fa-heart-pulse'],
    ['reports', 'Reports & Exports', 'fa-file-shield'],
    ['checklist', 'Checklist', 'fa-clipboard-check'],
  ];
  const activeTab = securityTabs.some(([key]) => key === params.tab) ? params.tab : 'overview';

  const queryString = (obj) => {
    const qs = new URLSearchParams();
    Object.entries(obj || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') qs.set(key, String(value).trim());
    });
    const out = qs.toString();
    return out ? `?${out}` : '';
  };
  const apiQuery = queryString(filters);
  const jsAttr = (value) => esc(String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  const selected = (value, current) => String(value || '') === String(current || '') ? 'selected' : '';
  const isActive = (needles) => Object.entries(needles).every(([key, value]) => String(filters[key] || '') === String(value || ''));

  const severityClass = (severity) => {
    if (severity === 'critical') return 'badge badge-cancelled';
    if (severity === 'warning') return 'badge badge-pending';
    return 'badge badge-success';
  };
  const statusClass = (status) => {
    if (status === 'critical') return 'badge badge-cancelled';
    if (status === 'warning') return 'badge badge-pending';
    return 'badge badge-delivered';
  };
  const checkStatusClass = (status) => status === 'ok' ? 'badge badge-delivered' : statusClass(status);
  const bucketClass = (bucket) => {
    if (bucket === 'needs_attention') return 'badge badge-pending';
    if (bucket === 'reviewed') return 'badge badge-delivered';
    return 'badge badge-success';
  };
  const bucketLabel = (bucket) => ({
    needs_attention: 'Needs attention',
    reviewed: 'Reviewed',
    routine: 'Routine',
  }[bucket] || 'Routine');

  const fmtEventDate = (value) => typeof fmtDateTime === 'function'
    ? fmtDateTime(value)
    : (value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '-');

  const renderEvent = (event) => {
    const metadata = event.metadata || {};
    const reason = metadata.reason || metadata.lock_reason || metadata.action || metadata.limited_by || '';
    const reviewed = !!event.reviewed_at;
    const trustedLabel = event.trusted_ip_label || '';
    const bucket = event.bucket || (reviewed ? 'reviewed' : 'routine');
    return `
      <tr>
        <td style="white-space:nowrap">${fmtEventDate(event.created_at)}</td>
        <td><span class="${severityClass(event.severity)}">${esc(event.severity || 'info')}</span></td>
        <td>
          <strong>${esc(event.event_type)}</strong>
          <div class="text-muted text-sm">${esc(event.explanation || 'Security activity recorded by the system.')}</div>
          <div class="text-muted text-sm">${esc(event.method || '')} ${esc(event.path || '')}</div>
          ${reason ? `<div class="text-muted text-sm">Reason: ${esc(reason)}</div>` : ''}
        </td>
        <td>${esc(event.email || '-')}<div class="text-muted text-sm">${esc(event.user_id || '')}</div></td>
        <td style="white-space:nowrap">
          ${event.ip ? `<button class="btn btn-sm btn-ghost" data-csp-onclick="filterSecurityByIp('${jsAttr(event.ip)}')">${esc(event.ip)}</button>` : '-'}
          ${trustedLabel ? `<div><span class="badge badge-delivered">${esc(trustedLabel)}</span></div>` : ''}
        </td>
        <td>${esc(event.message || '')}</td>
        <td>
          <span class="${bucketClass(bucket)}">${bucketLabel(bucket)}</span>
          ${reviewed ? `<div class="text-muted text-sm">${fmtEventDate(event.reviewed_at)}</div>` : ''}
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-outline" data-csp-onclick="markSecurityEventReviewed('${jsAttr(event.id)}', ${reviewed ? 'false' : 'true'})">
            <i class="fas ${reviewed ? 'fa-rotate-left' : 'fa-check'}"></i> ${reviewed ? 'Unreview' : 'Review'}
          </button>
        </td>
      </tr>`;
  };

  const renderAudit = (entry) => `
    <tr>
      <td style="white-space:nowrap">${fmtEventDate(entry.created_at)}</td>
      <td><strong>${esc(entry.action || '')}</strong><div class="text-muted text-sm">${esc(entry.entity_type || '')} ${esc(entry.entity_id || '')}</div></td>
      <td>${esc(entry.actor_email || '-')}<div class="text-muted text-sm">${esc(entry.actor_role || '')}</div></td>
      <td style="white-space:nowrap">${esc(entry.ip || '-')}</td>
      <td>${esc(entry.message || '')}</td>
    </tr>`;

  const renderBackup = (backup) => `
    <tr>
      <td>
        <strong>${esc(backup.filename || '')}</strong>
        <div class="text-muted text-sm">${esc(backup.created_utc || backup.modified_at || '')}</div>
      </td>
      <td>${Number(backup.size_mb || 0).toFixed(2)} MB</td>
      <td>
        ${backup.has_json_manifest ? '<span class="badge badge-delivered">Manifest</span>' : '<span class="badge badge-pending">Legacy</span>'}
      </td>
      <td>${backup.source_files_count == null ? '-' : Number(backup.source_files_count || 0)}</td>
      <td>${backup.uploads_count == null ? '-' : Number(backup.uploads_count || 0)}</td>
      <td>${backup.private_bills_count == null ? '-' : Number(backup.private_bills_count || 0)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-outline" data-csp-onclick="verifyBackup('${esc(backup.filename || '')}')"><i class="fas fa-shield-check"></i> Verify</button>
        <button class="btn btn-sm btn-outline" data-csp-onclick="restoreDrillBackup('${esc(backup.filename || '')}')"><i class="fas fa-flask"></i> Restore drill</button>
        <button class="btn btn-sm btn-primary" data-csp-onclick="downloadBackup('${esc(backup.filename || '')}')"><i class="fas fa-download"></i> Download</button>
      </td>
    </tr>`;

  const renderRestoreDrillPanel = (drill) => {
    if (!drill) return '';
    const report = drill.report || drill;
    const archive = report.archive || {};
    const db = report.database || {};
    const checks = report.checks || [];
    return `
      <div class="alert ${report.ok ? 'alert-info' : 'alert-error'}" style="margin-bottom:14px">
        <div class="flex-between" style="gap:12px;align-items:flex-start">
          <div>
            <strong>${report.ok ? 'Restore drill passed' : 'Restore drill found problems'}</strong>
            <div class="text-sm" style="margin-top:4px">
              ${esc(report.backup_file || '')} checked ${esc(report.checked_at_utc || '')}. This was tested in a temporary folder; the live site was not changed.
            </div>
            <div class="text-sm" style="margin-top:6px">
              ZIP files: ${Number(archive.files || 0)} · Uploads: ${Number(archive.upload_files || 0)} · Private bills: ${Number(archive.private_bill_files || 0)} · Source files: ${Number(archive.source_files || 0)}
            </div>
            <div class="text-sm" style="margin-top:6px">
              Database: ${esc(db.integrity_check || 'unknown')} · FK issues: ${Number(db.foreign_key_issue_count || 0)} · Missing tables: ${(db.missing_tables || []).length}
            </div>
          </div>
          <button class="btn btn-sm btn-ghost" data-csp-onclick="clearRestoreDrillResult()">Clear</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${checks.map(check => `<span class="${checkStatusClass(check.status)}">${esc(check.name || 'check')}: ${esc(check.status || '')}</span>`).join('')}
        </div>
      </div>`;
  };

  const renderIntegrity = (check) => `
    <tr>
      <td>
        <strong>${esc(check.label || '')}</strong>
        <div class="text-muted text-sm">${esc(check.recommendation || check.message || '')}</div>
      </td>
      <td><span class="${statusClass(check.status)}">${esc(check.status || 'ok')}</span></td>
      <td><strong>${Number(check.count || 0)}</strong></td>
      <td class="text-sm text-muted">${(check.sample || []).slice(0, 2).map(s => esc(Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(' | '))).join('<br>') || '-'}</td>
    </tr>`;

  const exportKinds = [
    ['customers', 'Customers'], ['orders', 'Orders'], ['products', 'Products'], ['inventory', 'Inventory'],
    ['categories', 'Categories'], ['reviews', 'Reviews'], ['coupons', 'Coupons'], ['vendors', 'Vendors'],
    ['sales', 'Sales'], ['purchases', 'Purchases'], ['expenses', 'Expenses'], ['security_events', 'Security Events'],
    ['audit_log', 'Audit Log'],
  ];

  const checklistGroups = [
    {
      title: 'After Every Upload',
      items: ['Open home, products, product detail, cart, checkout, login, admin login, staff login.', 'Create or verify one backup before uploading.', 'Reload PythonAnywhere WSGI, then check Error Log.', 'Test contact, bulk inquiry, newsletter, order tracking, and one admin page.']
    },
    {
      title: 'Weekly Security Review',
      items: ['Review warnings and critical events from the last 24 hours.', 'Check failed logins, blocked uploads, public endpoint throttles, and order tracking failures.', 'Verify latest backup exists and downloads.', 'Confirm no unexpected files appear in public uploads.']
    },
    {
      title: 'Monthly Business Review',
      items: ['Export orders, products, customers, inventory, sales, purchases, expenses, and vendors.', 'Review low-stock products and missing cost prices.', 'Compare bookkeeping reports with Stripe/order totals.', 'Review inactive categories/products before deleting anything.']
    },
    {
      title: 'Quarterly Maintenance',
      items: ['Run integrity report and resolve warnings.', 'Do a backup restore drill using a downloaded backup.', 'Review privacy policy, refund policy, and customer data exports.', 'Re-run mobile/tablet/desktop smoke tests for customer, staff, and admin flows.']
    },
  ];

  const renderChecklist = (group) => `
    <div class="card" style="box-shadow:none;border:1px solid var(--border)">
      <div class="card-header">${esc(group.title)}</div>
      <div class="card-body">
        ${group.items.map(item => `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px"><i class="fas fa-check-circle" style="color:var(--primary);margin-top:3px"></i><span>${esc(item)}</span></div>`).join('')}
      </div>
    </div>`;

  window.createBackup = async () => {
    if (!confirm('Create a fresh backup now? This can take a minute if uploads or bills are large.')) return;
    const btn = document.getElementById('create-backup-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }
    try {
      await api.post('/admin/backups', {});
      toast('Backup created and verified', 'success');
      Router.navigate('/admin/security?tab=backups');
    } catch (err) {
      toast(err.message || 'Backup could not be created', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-database"></i> Create backup'; }
    }
  };

  window.verifyBackup = async (filename) => {
    try {
      await api.post(`/admin/backups/${encodeURIComponent(filename)}/verify`, {});
      toast('Backup verified', 'success');
    } catch (err) {
      toast(err.message || 'Backup verification failed', 'error');
    }
  };

  window.restoreDrillBackup = async (filename) => {
    if (!confirm('Run a safe restore drill for this backup? This does not change the live site.')) return;
    try {
      const res = await api.post(`/admin/backups/${encodeURIComponent(filename)}/restore-drill`, {});
      const report = res.report || {};
      sessionStorage.setItem('adhya_last_restore_drill', JSON.stringify({ report }));
      toast(report.ok ? 'Restore drill passed' : 'Restore drill found problems', report.ok ? 'success' : 'error', 5000);
      Router.navigate('/admin/security?tab=backups');
    } catch (err) {
      toast(err.message || 'Restore drill failed', 'error', 5000);
    }
  };

  window.clearRestoreDrillResult = () => {
    sessionStorage.removeItem('adhya_last_restore_drill');
    Router.navigate('/admin/security?tab=backups');
  };

  window.downloadBackup = (filename) => {
    if (!confirm('Download this backup file? Keep it private. It can include customer, order, product, upload, and bookkeeping data.')) return;
    window.location.href = `/api/admin/backups/${encodeURIComponent(filename)}/download`;
  };

  window.downloadAdminExport = (kind) => {
    if (!exportKinds.some(([k]) => k === kind)) {
      toast('Export type is not available', 'error');
      return;
    }
    window.location.href = `/api/admin/export/${encodeURIComponent(kind)}`;
  };

  window.applySecurityFilters = () => {
    const next = {
      scope: document.getElementById('sec-scope')?.value || '',
      severity: document.getElementById('sec-severity')?.value || '',
      event_type: document.getElementById('sec-event-type')?.value || '',
      reviewed: document.getElementById('sec-reviewed')?.value || '',
      days: document.getElementById('sec-days')?.value || '',
      q: document.getElementById('sec-q')?.value || '',
      email: document.getElementById('sec-email')?.value || '',
      ip: document.getElementById('sec-ip')?.value || '',
      limit: document.getElementById('sec-limit')?.value || '150',
      tab: 'events',
    };
    Router.navigate('/admin/security' + queryString(next));
  };

  window.clearSecurityFilters = () => Router.navigate('/admin/security?tab=events');
  window.refreshSecurityPage = () => Router.navigate(location.pathname + location.search, false);
  window.openSecurityTab = (tab) => {
    const safeTab = securityTabs.some(([key]) => key === tab) ? tab : 'overview';
    const next = safeTab === 'events' ? { ...filters, tab: safeTab } : { tab: safeTab };
    Router.navigate('/admin/security' + queryString(next));
  };

  window.quickSecurityFilter = (scope = '', reviewed = '', days = '', severity = '') => {
    Router.navigate('/admin/security' + queryString({
      tab: 'events',
      scope,
      reviewed,
      days,
      severity,
      limit: filters.limit || '150',
    }));
  };

  window.filterSecurityByIp = (ip) => {
    Router.navigate('/admin/security' + queryString({ tab: 'events', ip, days: '7', limit: filters.limit || '150' }));
  };

  window.markVisibleSecurityReviewed = async () => {
    const ids = (window._securityVisibleIds || []).filter(Boolean);
    if (!ids.length) {
      toast('No visible security events to review', 'info');
      return;
    }
    if (!confirm(`Mark ${ids.length} visible security event(s) as reviewed?`)) return;
    try {
      const res = await api.post('/admin/security-events/reviewed', {
        ids,
        reviewed: true,
        note: 'Reviewed from Security dashboard',
      });
      toast(`${Number(res.updated || 0)} event(s) marked reviewed`, 'success');
      Router.navigate(location.pathname + location.search, false);
    } catch (err) {
      toast(err.message || 'Security events could not be marked reviewed', 'error');
    }
  };

  window.markSecurityEventReviewed = async (id, reviewed = true) => {
    if (!id) return;
    try {
      const res = await api.post('/admin/security-events/reviewed', {
        ids: [id],
        reviewed: !!reviewed,
        note: reviewed ? 'Reviewed from Security dashboard' : '',
      });
      toast(res.message || 'Security event updated', 'success');
      Router.navigate(location.pathname + location.search, false);
    } catch (err) {
      toast(err.message || 'Security event could not be updated', 'error');
    }
  };

  window.reviewLowRiskSecurityEvents = async () => {
    const days = document.getElementById('sec-days')?.value || '30';
    if (!confirm(`Mark routine low-risk events from the last ${days || 30} day(s) as reviewed? Failed logins, upload blocks, authorization denials, and critical events will stay visible.`)) return;
    try {
      const res = await api.post('/admin/security-events/review-low-risk', {
        days: days || 30,
        include_trusted_noise: true,
      });
      toast(`${Number(res.updated || 0)} low-risk event(s) reviewed`, 'success');
      Router.navigate(location.pathname + location.search, false);
    } catch (err) {
      toast(err.message || 'Low-risk events could not be reviewed', 'error');
    }
  };

  window.trustSecurityIp = async (ip = '') => {
    const targetIp = String(ip || document.getElementById('sec-ip')?.value || '').trim();
    if (!targetIp) {
      toast('Enter or select an IP address first', 'warning');
      return;
    }
    const label = prompt('Label this trusted IP, for example "Home laptop" or "Store Wi-Fi":', 'Trusted admin IP');
    if (label === null) return;
    try {
      await api.post('/admin/trusted-ips', {
        ip: targetIp,
        label: label || 'Trusted admin IP',
        note: 'Trusted from Security dashboard',
      });
      toast('Trusted IP saved', 'success');
      Router.navigate(location.pathname + location.search, false);
    } catch (err) {
      toast(err.message || 'Trusted IP could not be saved', 'error');
    }
  };

  window.removeTrustedSecurityIp = async (ip = '') => {
    const targetIp = String(ip || '').trim();
    if (!targetIp) return;
    if (!confirm(`Remove trusted label from ${targetIp}?`)) return;
    try {
      await api.del(`/admin/trusted-ips/${encodeURIComponent(targetIp)}`);
      toast('Trusted IP removed', 'success');
      Router.navigate(location.pathname + location.search, false);
    } catch (err) {
      toast(err.message || 'Trusted IP could not be removed', 'error');
    }
  };

  try {
    const settled = await Promise.allSettled([
      api.get(`/admin/security-events${apiQuery}`),
      api.get('/admin/health'),
      api.get('/admin/audit-log?limit=100'),
      api.get('/admin/backups'),
      api.get('/admin/integrity'),
    ]);
    const loadErrors = [];
    const readPanel = (index, label, fallback) => {
      const result = settled[index];
      if (result && result.status === 'fulfilled') return result.value || fallback;
      loadErrors.push(`${label}: ${result?.reason?.message || 'Request failed'}`);
      return fallback;
    };
    const data = readPanel(0, 'Security events', { events: [], summary: [], risky_24h: 0, stats: {}, top_ips: [], event_types: [], trusted_ips: [] });
    const health = readPanel(1, 'System health', {});
    const auditData = readPanel(2, 'Audit log', { entries: [] });
    const backupData = readPanel(3, 'Backups', { backups: [] });
    const integrity = readPanel(4, 'Integrity report', { checks: [], critical_count: 0, warning_count: 0, generated_at: '' });
    if (Router.stale(_gen)) return;
    let lastRestoreDrill = null;
    try {
      lastRestoreDrill = JSON.parse(sessionStorage.getItem('adhya_last_restore_drill') || 'null');
    } catch (e) {
      lastRestoreDrill = null;
    }

    const events = data.events || [];
    const summary = data.summary || [];
    const stats = data.stats || {};
    const topIps = data.top_ips || [];
    const eventTypes = data.event_types || [];
    const trustedIps = data.trusted_ips || [];
    const auditEntries = auditData.entries || [];
    const backups = backupData.backups || [];
    const backupRetentionDays = Number(backupData.retention_days || 7);
    const backupCleanup = backupData.retention_cleanup || {};
    const integrityChecks = integrity.checks || [];
    const warningCount = Number(data.risky_24h || 0);
    const integrityCritical = Number(integrity.critical_count || health.integrity_critical_count || 0);
    const integrityWarnings = Number(integrity.warning_count || health.integrity_warning_count || 0);
    const unreviewedRisky = Number(stats.unreviewed_risky || 0);
    const unreviewedCritical = Number(stats.unreviewed_critical || 0);
    const unreviewedAttention = Number(stats.unreviewed_needs_attention || 0);
    const unreviewedRoutine = Number(stats.unreviewed_routine || 0);
    const untrustedRiskEvents = Number(stats.untrusted_risk_events || 0);
    const failedLogins24h = Number(stats.failed_logins_24h || 0);
    const passwordResets24h = Number(stats.password_resets_24h || 0);
    window._securityVisibleIds = events.map(e => e.id).filter(Boolean);

    const activeParts = Object.entries(filters)
      .filter(([key, value]) => key !== 'limit' && value)
      .map(([key, value]) => `${key.replace('_', ' ')}: ${value}`);

    const quickButtons = [
      ['needs_attention', 'unreviewed', '7', '', 'Needs attention', unreviewedAttention],
      ['routine', 'unreviewed', '30', '', 'Routine cleanup', unreviewedRoutine],
      ['critical', 'unreviewed', '', '', 'Critical', unreviewedCritical],
      ['failed_logins', '', '1', '', 'Failed logins', failedLogins24h],
      ['password_reset', '', '7', '', 'Password reset', passwordResets24h],
      ['untrusted_risk', '', '7', '', 'Untrusted risk', untrustedRiskEvents],
      ['trusted', '', '7', '', 'Trusted IPs', Number(stats.trusted_ip_events || 0)],
      ['', 'unreviewed', '', '', 'All unreviewed', Number(stats.unreviewed_total || 0)],
    ];

    const latestBackupMs = health.latest_backup_at ? Date.parse(String(health.latest_backup_at).replace(' ', 'T')) : NaN;
    const backupAgeDays = Number.isFinite(latestBackupMs) ? Math.floor((Date.now() - latestBackupMs) / 86400000) : null;
    const backupFresh = backupAgeDays !== null && backupAgeDays <= backupRetentionDays;
    const restoreDrillOk = !!(lastRestoreDrill && lastRestoreDrill.report && lastRestoreDrill.report.ok);
    const securityState = (!health.latest_backup_at || unreviewedCritical || integrityCritical)
      ? { label: 'Critical', icon: 'fa-circle-exclamation', cls: 'cancelled', note: 'Open the highlighted sections and resolve critical items first.' }
      : (unreviewedAttention || integrityWarnings || !backupFresh)
        ? { label: 'Needs review', icon: 'fa-triangle-exclamation', cls: 'pending', note: 'Review warnings, old backups, or routine security activity.' }
        : { label: 'Good', icon: 'fa-shield-check', cls: 'revenue', note: 'No critical security or backup issues are visible right now.' };

    const securityTabNav = `
      <div class="security-center-tabs">
        ${securityTabs.map(([key, label, icon]) => `
          <a href="/admin/security?tab=${key}" data-link class="security-center-tab ${activeTab === key ? 'active' : ''}">
            <i class="fas ${icon}"></i><span>${esc(label)}</span>
          </a>
        `).join('')}
      </div>`;

    const filterPanel = `
      <div class="card security-filter-card" style="margin-bottom:22px">
        <div class="card-header flex-between">
          <span>Security filters</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-outline" data-csp-onclick="reviewLowRiskSecurityEvents()"><i class="fas fa-broom"></i> Review low-risk</button>
            ${filters.ip ? `<button class="btn btn-sm btn-outline" data-csp-onclick="trustSecurityIp('${jsAttr(filters.ip)}')"><i class="fas fa-user-shield"></i> Trust this IP</button>` : ''}
            <button class="btn btn-sm btn-outline" data-csp-onclick="markVisibleSecurityReviewed()"><i class="fas fa-check-double"></i> Mark visible reviewed</button>
            <button class="btn btn-sm btn-ghost" data-csp-onclick="clearSecurityFilters()"><i class="fas fa-filter-circle-xmark"></i> Clear</button>
          </div>
        </div>
        <div class="card-body">
          <div class="security-quick-row">
            ${quickButtons.map(([scope, reviewed, days, severity, label, count]) => `
              <button class="btn btn-sm ${isActive({ scope, reviewed, days, severity }) ? 'btn-primary' : 'btn-outline'}"
                      data-csp-onclick="quickSecurityFilter('${scope}', '${reviewed}', '${days}', '${severity}')">
                ${esc(label)} <span class="security-pill">${Number(count || 0)}</span>
              </button>
            `).join('')}
          </div>
          <div class="security-filter-grid">
            <label>Scope
              <select class="form-control" id="sec-scope">
                <option value="" ${selected('', filters.scope)}>All activity</option>
                <option value="needs_attention" ${selected('needs_attention', filters.scope)}>Needs attention</option>
                <option value="routine" ${selected('routine', filters.scope)}>Routine / likely normal</option>
                <option value="untrusted_risk" ${selected('untrusted_risk', filters.scope)}>Untrusted risk</option>
                <option value="trusted" ${selected('trusted', filters.scope)}>Trusted IP activity</option>
                <option value="suspicious" ${selected('suspicious', filters.scope)}>Suspicious</option>
                <option value="risky" ${selected('risky', filters.scope)}>Risk in 24 hours</option>
                <option value="critical" ${selected('critical', filters.scope)}>Critical only</option>
                <option value="failed_logins" ${selected('failed_logins', filters.scope)}>Failed logins</option>
                <option value="password_reset" ${selected('password_reset', filters.scope)}>Password reset</option>
                <option value="uploads" ${selected('uploads', filters.scope)}>Uploads</option>
              </select>
            </label>
            <label>Severity
              <select class="form-control" id="sec-severity">
                <option value="" ${selected('', filters.severity)}>Any</option>
                <option value="critical" ${selected('critical', filters.severity)}>Critical</option>
                <option value="warning" ${selected('warning', filters.severity)}>Warning</option>
                <option value="info" ${selected('info', filters.severity)}>Info</option>
              </select>
            </label>
            <label>Event type
              <select class="form-control" id="sec-event-type">
                <option value="" ${selected('', filters.event_type)}>Any type</option>
                ${eventTypes.map(t => `<option value="${esc(t.event_type)}" ${selected(t.event_type, filters.event_type)}>${esc(t.event_type)} (${Number(t.count || 0)})</option>`).join('')}
              </select>
            </label>
            <label>Review status
              <select class="form-control" id="sec-reviewed">
                <option value="" ${selected('', filters.reviewed)}>All</option>
                <option value="unreviewed" ${selected('unreviewed', filters.reviewed)}>Unreviewed</option>
                <option value="reviewed" ${selected('reviewed', filters.reviewed)}>Reviewed</option>
              </select>
            </label>
            <label>Time
              <select class="form-control" id="sec-days">
                <option value="" ${selected('', filters.days)}>All time</option>
                <option value="1" ${selected('1', filters.days)}>Last 24 hours</option>
                <option value="7" ${selected('7', filters.days)}>Last 7 days</option>
                <option value="30" ${selected('30', filters.days)}>Last 30 days</option>
                <option value="90" ${selected('90', filters.days)}>Last 90 days</option>
              </select>
            </label>
            <label>Search
              <input class="form-control sec-filter-input" id="sec-q" value="${esc(filters.q)}" placeholder="message, path, user, event..." />
            </label>
            <label>Email
              <input class="form-control sec-filter-input" id="sec-email" value="${esc(filters.email)}" placeholder="customer@example.com" />
            </label>
            <label>IP address
              <input class="form-control sec-filter-input" id="sec-ip" value="${esc(filters.ip)}" placeholder="123.45.67.89" />
            </label>
            <label>Rows
              <select class="form-control" id="sec-limit">
                <option value="50" ${selected('50', filters.limit)}>50</option>
                <option value="150" ${selected('150', filters.limit)}>150</option>
                <option value="300" ${selected('300', filters.limit)}>300</option>
                <option value="500" ${selected('500', filters.limit)}>500</option>
              </select>
            </label>
            <div class="security-filter-actions">
              <button class="btn btn-primary" data-csp-onclick="applySecurityFilters()"><i class="fas fa-magnifying-glass"></i> Apply</button>
            </div>
          </div>
          <div class="text-muted text-sm" style="margin-top:12px">
            ${activeParts.length ? `Active filters: ${activeParts.map(esc).join(' · ')}` : 'Showing the latest security activity.'}
          </div>
        </div>
      </div>`;

    const attentionCards = `
      <div class="grid-2 security-review-grid" style="gap:16px;margin-bottom:22px">
        <div class="security-review-card needs">
          <div>
            <div class="security-review-title"><i class="fas fa-triangle-exclamation"></i> Needs attention first</div>
            <div class="text-muted text-sm">Failed logins, locked accounts, blocked uploads, CSRF failures, authorization denials, and untrusted warning activity stay visible until reviewed.</div>
          </div>
          <button class="btn btn-sm btn-outline" data-csp-onclick="quickSecurityFilter('needs_attention', 'unreviewed', '7', '')">Open ${unreviewedAttention}</button>
        </div>
        <div class="security-review-card routine">
          <div>
            <div class="security-review-title"><i class="fas fa-circle-check"></i> Routine / likely normal</div>
            <div class="text-muted text-sm">Successful logins, password reset confirmations, exports, backup actions, and trusted-IP admin noise can be reviewed in bulk.</div>
          </div>
          <button class="btn btn-sm btn-outline" data-csp-onclick="reviewLowRiskSecurityEvents()">Review ${unreviewedRoutine}</button>
        </div>
      </div>`;

    const suspiciousGroupingPanel = `
      <div class="card security-grouping-panel" style="margin-bottom:22px">
        <div class="card-header flex-between">
          <span>Suspicious activity grouping</span>
          <button class="btn btn-sm btn-outline" data-csp-onclick="quickSecurityFilter('suspicious', 'unreviewed', '7', '')">Open suspicious</button>
        </div>
        <div class="card-body">
          <div class="security-grouping-grid">
            <div>
              <strong>Needs attention</strong>
              <span>Unknown IPs, repeated failed logins, blocked uploads, CSRF failures, lockouts, and denied admin access.</span>
            </div>
            <div>
              <strong>Routine</strong>
              <span>Successful logins, exports, backups, password reset confirmations, and trusted-IP admin activity.</span>
            </div>
            <div>
              <strong>Trusted IPs</strong>
              <span>Your saved admin devices stay visible, but they are separated from unknown traffic so review work is faster.</span>
            </div>
          </div>
        </div>
      </div>`;

    const ipAndSummaryPanel = `
      <div class="grid-2" style="gap:16px;margin-bottom:22px">
        <div class="card" style="box-shadow:none;border:1px solid var(--border)">
          <div class="card-header">IP activity to watch</div>
          <div class="card-body">
            ${topIps.length ? topIps.map(ip => `
              <div class="security-ip-row">
                <span>
                  <strong>${esc(ip.ip || '-')}</strong>
                  <span class="text-muted text-sm">Last seen ${fmtEventDate(ip.last_seen)}</span>
                  ${ip.trusted_label ? `<span class="badge badge-delivered">${esc(ip.trusted_label)}</span>` : ''}
                </span>
                <span class="security-ip-actions">
                  <span class="${Number(ip.risky || 0) ? 'badge badge-pending' : 'badge badge-success'}">${Number(ip.risky || 0)} risky</span>
                  <span class="badge badge-delivered">${Number(ip.total || 0)} total</span>
                  <button class="btn btn-sm btn-ghost" data-csp-onclick="filterSecurityByIp('${jsAttr(ip.ip)}')">Open</button>
                  ${ip.trusted_label
                    ? `<button class="btn btn-sm btn-outline" data-csp-onclick="removeTrustedSecurityIp('${jsAttr(ip.ip)}')">Untrust</button>`
                    : `<button class="btn btn-sm btn-outline" data-csp-onclick="trustSecurityIp('${jsAttr(ip.ip)}')">Trust</button>`}
                </span>
              </div>
            `).join('') : '<div class="text-muted">No risky IP patterns in the last 7 days.</div>'}
          </div>
        </div>
        <div class="card" style="box-shadow:none;border:1px solid var(--border)">
          <div class="card-header">7-day summary</div>
          <div class="table-wrap admin-wide-scroll">
            <table>
              <thead><tr><th>Event</th><th>Severity</th><th>Count</th></tr></thead>
              <tbody>
                ${summary.length ? summary.map(s => `
                  <tr>
                    <td>${esc(s.event_type)}</td>
                    <td><span class="${severityClass(s.severity)}">${esc(s.severity)}</span></td>
                    <td><strong>${Number(s.count || 0)}</strong></td>
                  </tr>
                `).join('') : '<tr><td colspan="3" class="text-muted">No events recorded yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const trustedIpPanel = `
      <div class="card" style="margin-bottom:22px">
        <div class="card-header flex-between">
          <span>Trusted admin IPs</span>
          <button class="btn btn-sm btn-outline" data-csp-onclick="trustSecurityIp()"><i class="fas fa-plus"></i> Add IP from filter</button>
        </div>
        <div class="card-body">
          <div class="alert alert-info" style="margin-bottom:14px">
            Trusted IPs help separate your own admin testing from unknown traffic. They do not bypass login, permissions, CSRF, upload scanning, or lockouts.
          </div>
          <div class="security-trusted-list">
            ${trustedIps.length ? trustedIps.map(ip => `
              <div class="security-trusted-chip">
                <div>
                  <strong>${esc(ip.label || 'Trusted admin IP')}</strong>
                  <div class="text-muted text-sm">${esc(ip.ip || '')}${ip.note ? ` · ${esc(ip.note)}` : ''}</div>
                </div>
                <button class="btn btn-sm btn-outline" data-csp-onclick="removeTrustedSecurityIp('${jsAttr(ip.ip)}')">Untrust</button>
              </div>
            `).join('') : '<div class="text-muted">No trusted admin IPs saved yet. Open an IP from the activity list, then click “Trust this IP.”</div>'}
          </div>
        </div>
      </div>`;

    const healthPanel = `
      <div class="card" style="margin-bottom:22px">
        <div class="card-header flex-between">
          <span>System health</span>
          <span class="text-muted text-sm">Checked ${esc(health.generated_at || '-')}</span>
        </div>
        <div class="card-body">
          <div class="stats-grid-3" style="margin-bottom:16px">
            <div class="stat-card">
              <div class="stat-icon products"><i class="fas fa-boxes-stacked"></i></div>
              <div><div class="stat-value">${Number(health.active_products || 0)}</div><div class="stat-label">Active products</div></div>
            </div>
            <div class="stat-card">
              <div class="stat-icon ${Number(health.low_stock_products || 0) ? 'pending' : 'revenue'}"><i class="fas fa-triangle-exclamation"></i></div>
              <div><div class="stat-value">${Number(health.low_stock_products || 0)}</div><div class="stat-label">Low-stock products</div></div>
            </div>
            <div class="stat-card">
              <div class="stat-icon orders"><i class="fas fa-receipt"></i></div>
              <div><div class="stat-value">${Number(health.pending_orders || 0)}</div><div class="stat-label">Pending orders</div></div>
            </div>
          </div>
          <div class="table-wrap admin-wide-scroll">
            <table>
              <tbody>
                <tr><td>Return requests waiting</td><td><strong>${Number(health.return_requests || 0)}</strong></td></tr>
                <tr><td>Audit entries in 7 days</td><td><strong>${Number(health.audit_7d || 0)}</strong></td></tr>
                <tr><td>Warnings in 24 hours</td><td><strong>${Number(health.warning_24h || 0)}</strong></td></tr>
                <tr><td>Critical events in 7 days</td><td><strong>${Number(health.critical_7d || 0)}</strong></td></tr>
                <tr><td>Database size</td><td><strong>${Number(health.database_size_mb || 0).toFixed(2)} MB</strong></td></tr>
                <tr><td>Database integrity</td><td>${health.database_integrity === 'ok' && Number(health.foreign_key_issue_count || 0) === 0 ? '<span class="badge badge-delivered">OK</span>' : `<span class="badge badge-cancelled">${esc(health.database_integrity || 'unknown')} / FK ${Number(health.foreign_key_issue_count || 0)}</span>`}</td></tr>
                <tr><td>Business integrity report</td><td>${integrityCritical || integrityWarnings ? `<span class="${integrityCritical ? 'badge badge-cancelled' : 'badge badge-pending'}">${integrityCritical} critical / ${integrityWarnings} warnings</span>` : '<span class="badge badge-delivered">OK</span>'}</td></tr>
                <tr><td>Uploaded files</td><td><strong>${Number(health.uploads_count || 0)}</strong> files / ${Number(health.uploads_size_mb || 0).toFixed(2)} MB</td></tr>
                <tr><td>Private bills</td><td><strong>${Number(health.private_bills_count || 0)}</strong> files / ${Number(health.private_bills_size_mb || 0).toFixed(2)} MB</td></tr>
                <tr><td>Latest backup</td><td>${health.latest_backup_at ? `${esc(health.latest_backup_at)} <span class="text-muted">(${Number(health.latest_backup_size_mb || 0).toFixed(2)} MB, ${Number(health.backups_count || 0)} saved)</span>` : '<span class="badge badge-pending">Not found</span>'}</td></tr>
                <tr><td>Last order</td><td>${esc(health.last_order_at || 'No orders yet')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:22px">
        <div class="card-header flex-between">
          <span>Data integrity report</span>
          <span class="text-muted text-sm">Generated ${esc(integrity.generated_at || '-')}</span>
        </div>
        <div class="card-body">
          <div class="alert ${integrityCritical ? 'alert-error' : 'alert-info'}" style="margin-bottom:14px">
            ${integrityCritical ? 'Resolve critical integrity issues before major uploads or inventory changes.' : integrityWarnings ? 'Warnings are not emergencies, but they affect reporting quality and customer experience.' : 'No integrity problems found in the checked areas.'}
          </div>
          <div class="table-wrap admin-wide-scroll">
            <table>
              <thead><tr><th>Check</th><th>Status</th><th>Count</th><th>Examples</th></tr></thead>
              <tbody>${integrityChecks.length ? integrityChecks.map(renderIntegrity).join('') : '<tr><td colspan="4" class="text-muted">No checks returned.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    const backupsPanel = `
      <div class="card" style="margin-bottom:22px">
        <div class="card-header flex-between">
          <span>Backups</span>
          <button id="create-backup-btn" class="btn btn-sm btn-primary" data-csp-onclick="createBackup()"><i class="fas fa-database"></i> Create backup</button>
        </div>
        <div class="card-body">
          <div class="alert alert-info" style="margin-bottom:14px">
            Backups include the database, uploaded product/customer files, and private bill attachments. Downloads are strict admin-only.
            Backups older than ${backupRetentionDays} days are deleted automatically, and the newest backup is always kept.
            Use Restore drill to safely confirm a backup can be restored without touching the live site.
          </div>
          <div class="security-restore-steps">
            <strong>Restore reminder</strong>
            <span>1. Download the newest verified backup.</span>
            <span>2. Run Restore drill first.</span>
            <span>3. Keep the ZIP private.</span>
            <span>4. Restore only after creating a fresh live backup.</span>
          </div>
          ${(backupCleanup.deleted || []).length ? `
            <div class="alert alert-success" style="margin-bottom:14px">
              Auto-cleanup removed ${(backupCleanup.deleted || []).length} old backup${(backupCleanup.deleted || []).length === 1 ? '' : 's'}.
            </div>
          ` : ''}
          ${renderRestoreDrillPanel(lastRestoreDrill)}
          <div class="admin-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Swipe sideways to view all columns</div>
          <div class="table-wrap admin-wide-scroll">
            <table>
              <thead><tr><th>Backup</th><th>Size</th><th>Manifest</th><th>Source</th><th>Uploads</th><th>Bills</th><th>Actions</th></tr></thead>
              <tbody>
                ${backups.length ? backups.slice(0, 10).map(renderBackup).join('') : '<tr><td colspan="7" class="text-muted">No backups found yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const reportsPanel = `
      <div class="card" style="margin-bottom:22px">
        <div class="card-header">Data exports</div>
        <div class="card-body">
          <div class="alert alert-info" style="margin-bottom:14px">
            Exports are admin-only and sanitized for spreadsheets. Use them for backups, accountant review, vendor analysis, and offline records.
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${exportKinds.map(([kind, label]) => `<button class="btn btn-sm btn-outline" data-csp-onclick="downloadAdminExport('${kind}')"><i class="fas fa-file-csv"></i> ${esc(label)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:22px">
        <div class="card-header">Latest admin/staff changes</div>
        <div class="admin-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Swipe sideways to view all columns</div>
        <div class="table-wrap admin-wide-scroll">
          <table>
            <thead><tr><th>Date</th><th>Action</th><th>User</th><th>IP</th><th>Message</th></tr></thead>
            <tbody>
              ${auditEntries.length ? auditEntries.map(renderAudit).join('') : '<tr><td colspan="5" class="text-muted">No audit entries recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    const eventsPanel = `
      ${filterPanel}
      <div class="card">
        <div class="card-header flex-between">
          <span>Latest security events</span>
          <button class="btn btn-sm btn-ghost" data-csp-onclick="refreshSecurityPage()"><i class="fas fa-rotate"></i> Refresh</button>
        </div>
        <div class="admin-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Swipe sideways to view all columns</div>
        <div class="table-wrap admin-wide-scroll">
          <table>
            <thead><tr><th>Date</th><th>Level</th><th>Event</th><th>User</th><th>IP</th><th>Message</th><th>Review</th><th>Action</th></tr></thead>
            <tbody>
              ${events.length ? events.map(renderEvent).join('') : '<tr><td colspan="8" class="text-muted">No security events match these filters.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    const checklistPanel = `<div class="grid-2" style="gap:16px;margin-bottom:22px">${checklistGroups.map(renderChecklist).join('')}</div>`;
    const overviewPanel = `${attentionCards}${suspiciousGroupingPanel}${ipAndSummaryPanel}${trustedIpPanel}`;
    const panels = {
      overview: overviewPanel,
      events: eventsPanel,
      backups: backupsPanel,
      health: healthPanel,
      reports: reportsPanel,
      checklist: checklistPanel,
    };

    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">Security Center</div>
      <div class="text-muted" style="margin-top:-10px;margin-bottom:18px">A cleaner view of security, backups, health, reports, and review work. Times are shown in your device timezone (${esc(viewerTimeZoneLabel())}).</div>
      ${loadErrors.length ? `<div class="alert alert-error" style="margin-bottom:18px"><strong>Some security panels could not load.</strong><br>${loadErrors.map(esc).join('<br>')}</div>` : ''}

      <div class="stats-grid security-center-summary" style="margin-bottom:18px">
        <div class="stat-card security-status-card">
          <div class="stat-icon ${securityState.cls}"><i class="fas ${securityState.icon}"></i></div>
          <div>
            <div class="stat-value">${esc(securityState.label)}</div>
            <div class="stat-label">${esc(securityState.note)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${unreviewedAttention ? 'pending' : 'revenue'}"><i class="fas fa-triangle-exclamation"></i></div>
          <div><div class="stat-value">${unreviewedAttention}</div><div class="stat-label">Need attention</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${health.latest_backup_at && backupFresh ? 'revenue' : 'pending'}"><i class="fas fa-database"></i></div>
          <div><div class="stat-value">${health.latest_backup_at ? `${backupAgeDays ?? '-'}d` : 'None'}</div><div class="stat-label">Latest backup age</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${restoreDrillOk ? 'revenue' : 'orders'}"><i class="fas fa-flask"></i></div>
          <div><div class="stat-value">${restoreDrillOk ? 'Passed' : 'Run'}</div><div class="stat-label">Restore drill</div></div>
        </div>
      </div>

      ${securityTabNav}
      <div class="security-center-panel">
        ${panels[activeTab] || overviewPanel}
      </div>
    `;

    document.querySelectorAll('.sec-filter-input').forEach(input => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') window.applySecurityFilters();
      });
    });
  } catch (err) {
    if (Router.stale(_gen)) return;
    document.querySelector('.admin-content').innerHTML = `
      <div class="admin-page-title">Security</div>
      <div class="alert alert-error">${esc(err.message || 'Security events could not be loaded')}</div>
    `;
  }
});
