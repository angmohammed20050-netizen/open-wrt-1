/* Quick Royal: يطبّق إعدادات الثيم مبكراً (وضع فاتح/داكن + إعدادات /etc/config/quick عبر theme.json) */
(function () {
  'use strict';

  var KEY = 'luci-quick-settings-v1';
  var TKEY = 'luci-quick-theme-v1';
  var DEFAULTS = { dark: 'dark', accent: '#7c5cff', anim: true, speed: 250, page: true, round: true, glass: true, compact: false };
  var BACKUP_RE = /^\s*(generate archive|download backup|create backup|backup|إنشاء أرشيف|توليد أرشيف|نسخ احتياطي|نسخة احتياطية|تنزيل النسخة الاحتياطية)\s*$/i;

  var root = document.documentElement;
  var S = load();

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    /* قيم قديمة لم تعد مستخدمة */
    delete s.hideBackup; delete s.hideFlashMenu;
    return Object.assign({}, DEFAULTS, s);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  function lighten(hex, amt) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.round(c + (255 - c) * amt); }
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }

  function apply() {
    var c = root.classList, st = root.style;
    c.toggle('qs-anim', !!S.anim);
    c.toggle('qs-page', !!(S.anim && S.page));
    c.toggle('qs-round', !!S.round);
    c.toggle('qs-glass', !!S.glass);
    c.toggle('qs-compact', !!S.compact);
    c.add('qs-accent');

    st.setProperty('--qs-speed', (S.anim ? S.speed : 0) / 1000 + 's');
    st.setProperty('--qs-accent', S.accent);
    st.setProperty('--qs-accent-2', lighten(S.accent, .38));
    st.setProperty('--primary-color-high', S.accent);
    st.setProperty('--primary-color-medium', S.accent);

    if (S.dark === 'auto') {
      root.removeAttribute('data-darkmode');
      st.colorScheme = 'light dark';
    } else {
      root.setAttribute('data-darkmode', S.dark === 'dark' ? 'true' : 'false');
      st.colorScheme = S.dark;
    }
  }

  window.QuickTheme = {
    set: function (k, v) { S[k] = v; apply(); save(); },
    get: function (k) { return S[k]; }
  };

  /* ---------- إخفاء أزرار النسخ الاحتياطي نهائياً ---------- */
  function hideBackup() {
    if (location.pathname.indexOf('/admin/system/flash') < 0) return;
    var nodes = document.querySelectorAll('button, input[type=button], input[type=submit], .cbi-button');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], t = n.value || n.textContent || '';
      if (BACKUP_RE.test(t) || n.getAttribute('data-action') === 'backup') {
        n.classList.add('qs-hidden');
        var row = n.closest && n.closest('.cbi-value');
        if (row && row.querySelectorAll('button, input[type=button]').length === 1) row.classList.add('qs-hidden');
      }
    }
  }

  /* ---------- إعدادات الثيم من /etc/config/quick (عبر theme.json) ---------- */
  function pick(v, list, d) { return list.indexOf(v) > -1 ? v : d; }
  
  /* ---------- وضع قفل الزبون (إخفاء الفلاش والحزم والنظام) ---------- */
  function applyCustomerLock(locked) {
    if (!locked || location.hash === '#quick-unlock' || sessionStorage.getItem('quick_unlocked') === '1') {
      if (location.hash === '#quick-unlock') sessionStorage.setItem('quick_unlocked', '1');
      return;
    }
    var blocked = ['/admin/system/flash', '/admin/system/opkg', '/admin/system/package-manager', '/admin/system/startup', '/admin/system/crontab'];
    document.querySelectorAll('a[href]').forEach(function (a) {
      var h = a.getAttribute('href') || '';
      for (var i = 0; i < blocked.length; i++) {
        if (h.indexOf(blocked[i]) > -1) {
          var li = a.closest('li') || a;
          li.classList.add('qs-hidden');
        }
      }
    });
  }

  function applyTheme(T) {
    if (T && T.customer_lock) { setTimeout(function(){ applyCustomerLock(true); }, 350); setTimeout(function(){ applyCustomerLock(true); }, 1200); }
    var st = root.style;
    root.setAttribute('data-qs-layout', pick(T.menu_layout, ['side', 'top', 'float', 'stack', 'present'], 'side'));
    root.setAttribute('data-qs-shape', pick(T.icon_shape, ['circle', 'squircle', 'square', 'hex'], 'squircle'));
    root.setAttribute('data-qs-icons', pick(T.icon_style, ['glass', 'flat', 'outline'], 'glass'));
    root.setAttribute('data-qs-bg', pick(T.bg_type, ['gradient', 'solid', 'image'], 'gradient'));
    if (/^#[0-9a-f]{3,8}$/i.test(T.bg_color1 || '')) st.setProperty('--qs-bg1', T.bg_color1);
    if (/^#[0-9a-f]{3,8}$/i.test(T.bg_color2 || '')) st.setProperty('--qs-bg2', T.bg_color2);
    if (/^\d{1,2}$/.test(String(T.blur))) st.setProperty('--qs-blur', T.blur + 'px');
    if (T.bg_image && !/["'()\\\s]/.test(T.bg_image)) st.setProperty('--qs-bg-image', 'url("' + T.bg_image + '")');
    if (/^#[0-9a-f]{6}$/i.test(T.accent || '') && T.accent.toLowerCase() !== S.accent.toLowerCase()) {
      S.accent = T.accent; apply();
    }
  }
  try { applyTheme(JSON.parse(localStorage.getItem(TKEY) || '{}')); } catch (e) { applyTheme({}); }
  try {
    fetch('/luci-static/quick/theme.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (T) {
        if (!T) return;
        try { localStorage.setItem(TKEY, JSON.stringify(T)); } catch (e) {}
        applyTheme(T);
      })
      .catch(function () {});
  } catch (e) {}

  apply(); /* مبكراً داخل head لتفادي الوميض */

  function ready() {
    if (document.body.classList.contains('qs-login')) return;
    hideBackup();
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; hideBackup(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
