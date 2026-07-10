(function () {
  'use strict';

  const EVENT_ATTRS = {
    click: 'data-csp-onclick',
    submit: 'data-csp-onsubmit',
    change: 'data-csp-onchange',
    input: 'data-csp-oninput',
    keydown: 'data-csp-onkeydown',
    focus: 'data-csp-onfocus',
    error: 'data-csp-onerror',
    mouseover: 'data-csp-onmouseover',
    mouseout: 'data-csp-onmouseout',
  };

  const ALLOWED_CALLS = new Set([
    'Auth.logout',
    'Cart.clear',
    'Router.navigate',
    'Wishlist.toggleCard',
    'Wishlist.toggleDetail',
    'addToCartDetail',
    'addVariantColor',
    'applyCartCoupon',
    'applyCoupon',
    'applyFilters',
    'applySecurityFilters',
    'applyWelcomeDiscount',
    'buyNow',
    'cancelOrderAdmin',
    'changeDetailQty',
    'changePage',
    'changePassword',
    'changeStatusFilter',
    'clothingSignup',
    'closeModal',
    'commitBulkProducts',
    'confirmCancelOrder',
    'confirmClearCart',
    'confirmRequestReturn',
    'copyOrderValue',
    'createBackup',
    'csSignup',
    'customPrintSignup',
    'clearSecurityFilters',
    'deleteCoupon',
    'deleteProduct',
    'deleteReview',
    'deleteUser',
    'doAdminLogin',
    'doCancelOrder',
    'doForgotPassword',
    'doLogin',
    'doNavSearch',
    'doProcessReturn',
    'doRegister',
    'doRequestReturn',
    'doResetPassword',
    'doTrackOrder',
    'downloadBackup',
    'downloadAdminExport',
    'downloadBulkErrors',
    'downloadImg',
    'editOrderStatus',
    'filterSecurityByIp',
    'filterMyOrders',
    'goProductPage',
    'goToProductImage',
    'handlePrintUpload',
    'handleReviewPhoto',
    'markSecurityEventReviewed',
    'markVisibleSecurityReviewed',
    'openCouponModal',
    'openCreateUser',
    'openEditUser',
    'openLightbox',
    'openProcessReturn',
    'openProductModal',
    'openProductModalById',
    'openReviewModal',
    'openOrderEditor',
    'openSecurityTab',
    'openSizeGuide',
    'openWriteReview',
    'placeOrder',
    'previewBulkProducts',
    'printInvoice',
    'printAdminInvoice',
    'printPackingSlip',
    'quickOrderStatus',
    'removeCartCoupon',
    'removeImg',
    'removePrintImg',
    'removeTrustedSecurityIp',
    'removeVariantColor',
    'resetBulkUpload',
    'restoreDrillBackup',
    'refreshSecurityPage',
    'recoverPendingPaidOrder',
    'reviewLowRiskSecurityEvents',
    'requestBackInStock',
    'saveCoupon',
    'saveEditUser',
    'saveNewUser',
    'saveProduct',
    'saveProfile',
    'searchAdminOrders',
    'searchAdminUsers',
    'searchProducts',
    'selectPlacement',
    'setProductFilter',
    'setOrderView',
    'sendOrderEmail',
    'setUserView',
    'submitBulkOrder',
    'submitContact',
    'submitPopupEmail',
    'submitReview',
    'quickAddToCart',
    'quickSecurityFilter',
    'verifyBackup',
    'clearRestoreDrillResult',
    'toggleFaq',
    'trackOrder',
    'trustSecurityIp',
    'updateOrderStatus',
    'updatePwStrength',
    'updateRpStrength',
    'updateVariantStock',
    'uploadProductImages',
    'viewOrder',
    'viewOrderAdmin',
    'window._wrRate',
    'window._wrSelectProduct',
    'window._wrSubmit',
    'window.print',
  ]);

  function splitOutside(src, separator) {
    const out = [];
    let cur = '';
    let quote = '';
    let escaped = false;
    let depth = 0;

    for (const ch of String(src || '')) {
      if (quote) {
        cur += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quote) {
          quote = '';
        }
        continue;
      }

      if (ch === '\'' || ch === '"' || ch === '`') {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
      if (ch === separator && depth === 0) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function splitArgs(src) {
    return splitOutside(src, ',');
  }

  function splitStatements(src) {
    return splitOutside(src, ';');
  }

  function decodeEntities(value) {
    const text = String(value ?? '');
    if (!text.includes('&')) return text;
    const ta = document.createElement('textarea');
    ta.innerHTML = text;
    return ta.value;
  }

  function unescapeStringBody(body) {
    let out = '';
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i];
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const next = body[++i];
      if (next === undefined) break;
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(body.slice(i + 1, i + 5))) {
        out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16));
        i += 4;
      } else {
        out += next;
      }
    }
    return decodeEntities(out);
  }

  function parseString(raw) {
    const s = String(raw || '').trim();
    if (s.length < 2) return null;
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '\'' || first === '"') && last === first) {
      return unescapeStringBody(s.slice(1, -1));
    }
    return null;
  }

  function resolveTarget(expr, ctx) {
    const s = String(expr || '').trim();
    if (s === 'this') return ctx.el;
    if (/^[A-Za-z_$][\w$]*$/.test(s) && ctx.vars && ctx.vars[s]) return ctx.vars[s];

    const byId = s.match(/^document\.getElementById\(([\s\S]+)\)$/);
    if (byId) {
      const id = parseArg(byId[1], ctx);
      return id ? document.getElementById(String(id)) : null;
    }

    const closest = s.match(/^this\.closest\(([\s\S]+)\)$/);
    if (closest) {
      const selector = parseArg(closest[1], ctx);
      return ctx.el?.closest?.(String(selector));
    }
    return null;
  }

  function parseArg(raw, ctx) {
    const s = String(raw || '').trim();
    if (!s) return undefined;
    if (s === 'this') return ctx.el;
    if (s === 'event') return ctx.event;
    if (s === 'this.value') return ctx.el?.value;
    if (s === 'this.checked') return !!ctx.el?.checked;

    if (/^this\.closest\([\s\S]+\)$/.test(s) || /^document\.getElementById\([\s\S]+\)$/.test(s)) {
      return resolveTarget(s, ctx);
    }

    const decodedJson = s.match(/^JSON\.parse\(decodeURIComponent\(([\s\S]+)\)\)$/);
    if (decodedJson) {
      const encoded = parseArg(decodedJson[1], ctx);
      return JSON.parse(decodeURIComponent(String(encoded || '')));
    }

    const str = parseString(s);
    if (str !== null) return str;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      return JSON.parse(decodeEntities(s));
    }
    if (/^[A-Za-z_$][\w$]*$/.test(s) && ctx.vars && s in ctx.vars) return ctx.vars[s];
    return undefined;
  }

  function evalExpression(raw, ctx) {
    const s = String(raw || '').trim();
    const ternary = s.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*={2,3}\s*(['"])([\s\S]*?)\3\s*\?\s*(['"])([\s\S]*?)\5\s*:\s*(['"])([\s\S]*?)\7$/);
    if (ternary) {
      const target = ctx.vars?.[ternary[1]];
      const actual = target ? String(target[ternary[2]]) : '';
      return actual === ternary[4] ? ternary[6] : ternary[8];
    }
    return parseArg(s, ctx);
  }

  function evalCondition(raw, ctx) {
    const s = String(raw || '').trim();
    const key = s.match(/^event\.key\s*([!=]={1,2})\s*(['"])([\s\S]*?)\2$/);
    if (key) {
      const same = String(ctx.event?.key) === key[3];
      return key[1].startsWith('!') ? !same : same;
    }
    return false;
  }

  function resolveCallable(path) {
    const parts = String(path || '').split('.');
    if (!parts.length) return { fn: undefined, thisArg: window };
    let obj = parts[0] === 'window' ? window : window[parts[0]];
    if (parts.length === 1) return { fn: obj, thisArg: window };
    for (let i = 1; i < parts.length - 1; i += 1) {
      if (obj == null) return { fn: undefined, thisArg: window };
      obj = obj[parts[i]];
    }
    return { fn: obj?.[parts[parts.length - 1]], thisArg: obj || window };
  }

  function callAllowed(name, argSource, ctx) {
    if (!ALLOWED_CALLS.has(name)) {
      console.warn('[csp-actions] blocked inline action:', name);
      return false;
    }
    const { fn, thisArg } = resolveCallable(name);
    if (typeof fn !== 'function') {
      console.warn('[csp-actions] missing action:', name);
      return false;
    }
    const args = splitArgs(argSource).map(arg => parseArg(arg, ctx));
    fn.apply(thisArg, args);
    return true;
  }

  function executeStatement(stmt, ctx) {
    const s = String(stmt || '').trim();
    if (!s) return true;

    const ifMatch = s.match(/^if\s*\(([\s\S]+?)\)\s*(?:\{([\s\S]*)\}|([\s\S]+))$/);
    if (ifMatch) {
      if (evalCondition(ifMatch[1], ctx)) executeSource(ifMatch[2] ?? ifMatch[3], ctx);
      return true;
    }

    if (s === 'event.preventDefault()') {
      ctx.event?.preventDefault?.();
      return true;
    }
    if (s === 'event.stopPropagation()') {
      ctx.event?.stopPropagation?.();
      ctx.event?.stopImmediatePropagation?.();
      return true;
    }
    if (s === 'location.reload()' || s === 'window.location.reload()') {
      window.location.reload();
      return true;
    }

    const declaration = s.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
    if (declaration) {
      ctx.vars[declaration[1]] = evalExpression(declaration[2], ctx);
      return true;
    }

    const storage = s.match(/^(sessionStorage|localStorage)\.setItem\(([\s\S]+)\)$/);
    if (storage) {
      const args = splitArgs(storage[2]).map(arg => parseArg(arg, ctx));
      window[storage[1]].setItem(String(args[0] ?? ''), String(args[1] ?? ''));
      return true;
    }

    const setProp = s.match(/^document\.documentElement\.style\.setProperty\(([\s\S]+)\)$/);
    if (setProp) {
      const args = splitArgs(setProp[1]).map(arg => parseArg(arg, ctx));
      document.documentElement.style.setProperty(String(args[0] || ''), String(args[1] || ''));
      return true;
    }

    const elementMethod = s.match(/^(document\.getElementById\([\s\S]+?\))\.(click|remove|focus)\(\)$/);
    if (elementMethod) {
      const el = resolveTarget(elementMethod[1], ctx);
      el?.[elementMethod[2]]?.();
      return true;
    }

    const styleAssign = s.match(/^([\s\S]+?)\.style\.([A-Za-z_$][\w$-]*)\s*=\s*([\s\S]+)$/);
    if (styleAssign) {
      const el = resolveTarget(styleAssign[1], ctx);
      if (el?.style) el.style[styleAssign[2]] = String(evalExpression(styleAssign[3], ctx) ?? '');
      return true;
    }

    const propAssign = s.match(/^([\s\S]+?)\.([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
    if (propAssign) {
      const el = resolveTarget(propAssign[1], ctx);
      if (el) el[propAssign[2]] = evalExpression(propAssign[3], ctx);
      return true;
    }

    const call = s.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(([\s\S]*)\)$/);
    if (call) return callAllowed(call[1], call[2], ctx);

    console.warn('[csp-actions] unsupported inline action:', s);
    return false;
  }

  function executeSource(source, ctx) {
    const statements = splitStatements(decodeEntities(source));
    for (const stmt of statements) executeStatement(stmt, ctx);
  }

  function eventTarget(event, attr) {
    const start = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!start?.closest) return null;
    return start.closest(`[${attr}]`);
  }

  function isSubmitControl(el) {
    if (!el || !el.matches) return false;
    if (el.matches('button')) {
      const type = String(el.getAttribute('type') || 'submit').toLowerCase();
      return type === 'submit' || type === '';
    }
    if (el.matches('input')) {
      const type = String(el.getAttribute('type') || 'text').toLowerCase();
      return type === 'submit' || type === 'image';
    }
    return false;
  }

  function handleSubmitClickFallback(event) {
    const start = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    const control = start?.closest?.('button,input');
    if (!isSubmitControl(control)) return false;
    const form = control.closest?.('form[data-csp-onsubmit]');
    if (!form) return false;
    event.preventDefault();
    const formEvent = {
      type: 'submit',
      target: form,
      currentTarget: form,
      submitter: control,
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation?.(),
      stopImmediatePropagation: () => event.stopImmediatePropagation?.(),
    };
    executeSource(form.getAttribute('data-csp-onsubmit'), { event: formEvent, el: form, vars: Object.create(null) });
    return true;
  }

  function handleEvent(event) {
    const attr = EVENT_ATTRS[event.type];
    if (!attr) return;
    const el = eventTarget(event, attr);
    if (!el || !document.documentElement.contains(el)) {
      if (event.type === 'click') handleSubmitClickFallback(event);
      return;
    }
    executeSource(el.getAttribute(attr), { event, el, vars: Object.create(null) });
  }

  Object.keys(EVENT_ATTRS).forEach(type => {
    const capture = type === 'click' || type === 'error' || type === 'focus';
    document.addEventListener(type, handleEvent, capture);
  });
})();
