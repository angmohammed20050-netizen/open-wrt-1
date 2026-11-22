'use strict';
'require baseclass';
'require ui';
'require rpc';
'require fs';

/* Quick Royal: sidebar menu, breadcrumb, tab menu and custom icon set.
   Structure follows luci-theme-bootstrap's menu-bootstrap.js (Apache License 2.0). */

var SVGNS = 'http://www.w3.org/2000/svg';

/* 24x24 stroke icons, drawn for this theme */
var ICONS = {
	status:     '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.3"/><path d="M6.3 10.3l1 .8M17.7 10.3l-1 .8M12 6.2v1.2"/>',
	system:     '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
	services:   '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5" opacity=".55"/>',
	network:    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
	vpn:        '<path d="M12 3l7.5 3v5.4c0 4.6-3.2 8.3-7.5 9.9-4.3-1.6-7.5-5.3-7.5-9.9V6L12 3z"/><rect x="9" y="11" width="6" height="4.6" rx="1.3"/><path d="M10.2 11V9.6a1.8 1.8 0 0 1 3.6 0V11"/>',
	nlbw:       '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="9" rx="1"/><rect x="10.5" y="5" width="3" height="15" rx="1"/><rect x="15.5" y="9" width="3" height="11" rx="1"/>',
	statistics: '<path d="M3 17l5-6 4 3 8-9"/><path d="M15 5h5v5"/><path d="M3 21h18" opacity=".5"/>',
	quick:      '<path d="M13 2.5L4.5 14H11l-1 7.5L19.5 10H13l0-7.5z"/>',
	dashboard:  '<path d="M3 11l9-8 9 8"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
	home:       '<path d="M3 11l9-8 9 8"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
	wifi:       '<path d="M2.5 9a15 15 0 0 1 19 0M5.6 12.4a10.5 10.5 0 0 1 12.8 0M8.8 15.8a6 6 0 0 1 6.4 0"/><circle cx="12" cy="19.4" r="1.1"/>',
	cpu:        '<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
	box:        '<path d="M12 3l8.5 4.5v9L12 21l-8.5-4.5v-9L12 3z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
	drive:      '<rect x="3" y="13" width="18" height="7" rx="2.5"/><path d="M3 13l2.7-7.2A2 2 0 0 1 7.6 4.5h8.8a2 2 0 0 1 1.9 1.3L21 13"/><circle cx="7.5" cy="16.5" r=".9"/><path d="M11 16.5h6"/>',
	route:      '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 7h5.5"/>',
	bell:       '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
	user:       '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
	logout:     '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4M19 12H9.5"/>',
	menu:       '<path d="M4 7h16M4 12h16M4 17h10"/>',
	sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
	moon:       '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2z"/>',
	chevron:    '<path d="M9 6l6 6-6 6"/>',
	search:     '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
	wifiscan:   '<path d="M12 12l5-5"/><circle cx="12" cy="12" r="1.3"/><path d="M4 12a8 8 0 0 1 8-8M7 12a5 5 0 0 1 5-5"/><path d="M20 12a8 8 0 0 1-8 8M17 12a5 5 0 0 1-5 5"/>',
	loop:       '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
	noise:      '<path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5"/>',
	portfwd:    '<path d="M4 7h11l-3-3M15 7l-3 3"/><path d="M20 17H9l3 3M9 17l3-3"/>',
	password:   '<circle cx="8" cy="15" r="4"/><path d="M11.5 12.5L20 4"/><path d="M17 7l2.5 2.5M14.5 9.5L17 12"/>',
	resetbtn:   '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
	reboot:     '<path d="M12 2v6"/><path d="M6.4 5.6a8 8 0 1 0 11.2 0"/>',
	wifisched:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8.5 15a5 5 0 0 1 7 0"/><circle cx="12" cy="18" r="1"/>',
	time:       '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
	neighbors:  '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M10.5 7.2L6.5 15.8M13.5 7.2l4 8.6M7.5 18h9"/>',
	grid:       '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>'
};

/* section name -> icon / palette key */
var ALIAS = {
	admin: 'grid', status: 'status', system: 'system', services: 'services', network: 'network',
	vpn: 'vpn', nlbw: 'nlbw', statistics: 'statistics', quick: 'quick', dashboard: 'dashboard', speed: 'statistics', extras: 'vpn', settings: 'system',
	loop: 'loop', noise: 'noise', portfwd: 'portfwd', password: 'password', resetbtn: 'resetbtn',
	reboot: 'reboot', wifisched: 'wifisched', time: 'time', channels: 'wifiscan', usage: 'nlbw',
	clients: 'user', neighbors: 'neighbors',
	wireless: 'wifi', wifi: 'wifi', mwan3: 'route', docker: 'box', dockerman: 'box', nas: 'drive',
	modem: 'cpu', mqtt: 'bell', adblock: 'vpn', banip: 'vpn', openvpn: 'vpn', wireguard: 'vpn',
	vnstat: 'nlbw', sqm: 'statistics', samba4: 'drive', ksmbd: 'drive', hd_idle: 'drive', upnp: 'network'
};

function iconSVG(name) {
	var key = ICONS[name] ? name : (ALIAS[name] || 'grid');
	return '<svg xmlns="' + SVGNS + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[key] + '</svg>';
}

function ico(name) {
	var s = E('span', { 'class': 'qs-ico' });
	s.innerHTML = iconSVG(name);
	return s;
}

/* turn <span data-icon="x"> placeholders from the template into icons */
function fillStatic() {
	document.querySelectorAll('.qs-ico[data-icon]').forEach(function (n) {
		if (!n.firstChild) n.innerHTML = iconSVG(n.getAttribute('data-icon'));
	});
}

return baseclass.extend({
	__init__: function () {
		fillStatic();
		this.bindChrome();
		this.sideStatus();
		this.spotlight();
		ui.menu.load().then(L.bind(function (tree) { this.render(tree); this.palette(tree); }, this));
	},

	/* ---------- حالة النظام أسفل القائمة ---------- */
	sideStatus: function () {
		var foot = document.querySelector('.qs-side-foot');
		if (!foot) return;
		var callInfo = rpc.declare({ object: 'system', method: 'info' });
		var box = E('div', { 'class': 'qs-sys' }, [
			E('div', { 'class': 'qs-sys-row' }, [ E('span', {}, 'RAM'), E('b', { 'data-k': 'ram' }, '–') ]),
			E('div', { 'class': 'qs-bar' }, [ E('i', { 'data-k': 'rambar' }) ]),
			E('div', { 'class': 'qs-sys-row' }, [ E('span', {}, 'CPU'), E('b', { 'data-k': 'cpu' }, '–') ]),
			E('div', { 'class': 'qs-bar cpu' }, [ E('i', { 'data-k': 'cpubar' }) ]),
			E('div', { 'class': 'qs-sys-row sm' }, [ E('span', {}, '⏱'), E('b', { 'data-k': 'up' }, '–') ])
		]);
		foot.insertBefore(box, foot.firstChild);
		var q = function (k) { return box.querySelector('[data-k="' + k + '"]'); };
		var last = null;

		function tick() {
			if (document.hidden) return;
			Promise.all([ callInfo(), L.resolveDefault(fs.read_direct('/proc/stat'), '') ]).then(function (r) {
				var i = r[0] || {}, m = i.memory || {};
				if (m.total) {
					var used = m.total - (m.free || 0) - (m.buffered || 0) - (m.cached || 0);
					var pct = Math.max(0, Math.min(100, Math.round(used * 100 / m.total)));
					q('ram').textContent = pct + '%';
					q('rambar').style.width = pct + '%';
				}
				var d = i.uptime | 0;
				q('up').textContent = (d >= 86400 ? Math.floor(d / 86400) + 'd ' : '') + Math.floor(d % 86400 / 3600) + 'h ' + Math.floor(d % 3600 / 60) + 'm';
				var line = String(r[1]).split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
				if (line.length > 4) {
					var idle = line[3] + (line[4] || 0), tot = line.reduce(function (a, b) { return a + b; }, 0);
					if (last) {
						var dt = tot - last.t, di = idle - last.i;
						var cpu = dt > 0 ? Math.max(0, Math.min(100, Math.round((dt - di) * 100 / dt))) : 0;
						q('cpu').textContent = cpu + '%';
						q('cpubar').style.width = cpu + '%';
					}
					last = { t: tot, i: idle };
				}
			}).catch(function () {});
		}
		tick();
		setInterval(tick, 4000);
	},

	/* ---------- إضاءة تتبع المؤشر على القوائم والبطاقات ---------- */
	spotlight: function () {
		var pending = null;
		document.addEventListener('pointermove', function (e) {
			if (pending) return;
			pending = requestAnimationFrame(function () {
				pending = null;
				var t = e.target && e.target.closest ? e.target.closest('#topmenu > li > a, #view .cbi-section, #view .cbi-tabcontainer, .qd-card, .qs-cmd-item') : null;
				if (!t) return;
				var r = t.getBoundingClientRect();
				t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
				t.style.setProperty('--my', (e.clientY - r.top) + 'px');
			});
		}, { passive: true });
	},

	/* ---------- بحث سريع Ctrl+K ---------- */
	palette: function (tree) {
		var items = [];
		ui.menu.getChildren(tree).forEach(function (mode) {
			ui.menu.getChildren(mode).forEach(function (sec) {
				ui.menu.getChildren(sec).forEach(function (pg) {
					items.push({
						title: _(pg.title), section: _(sec.title), key: sec.name,
						url: L.url(mode.name, sec.name, pg.name),
						hay: (_(pg.title) + ' ' + _(sec.title) + ' ' + pg.name + ' ' + sec.name).toLowerCase()
					});
				});
			});
		});

		var input = E('input', { 'type': 'text', 'placeholder': _('Search…') + '  (Ctrl K)', 'autocomplete': 'off', 'spellcheck': 'false' });
		var list = E('div', { 'class': 'qs-cmd-list', 'role': 'listbox' });
		var wrap = E('div', { 'class': 'qs-cmd', 'id': 'qs-cmd' }, [
			E('div', { 'class': 'qs-cmd-box' }, [
				E('div', { 'class': 'qs-cmd-in' }, [ ico('search'), input, E('kbd', {}, 'Esc') ]),
				list
			])
		]);
		document.body.appendChild(wrap);

		var sel = 0, shown = [];
		function draw() {
			var q = input.value.trim().toLowerCase();
			shown = items.filter(function (i) { return !q || q.split(/\s+/).every(function (w) { return i.hay.indexOf(w) > -1; }); }).slice(0, 40);
			if (sel >= shown.length) sel = 0;
			list.innerHTML = '';
			if (!shown.length) list.appendChild(E('div', { 'class': 'qs-cmd-empty' }, '—'));
			shown.forEach(function (it, n) {
				var a = E('a', { 'href': it.url, 'class': 'qs-cmd-item' + (n === sel ? ' on' : ''), 'data-k': it.key }, [
					ico(it.key), E('span', { 'class': 'qs-cmd-t' }, it.title), E('em', {}, it.section)
				]);
				a.addEventListener('mousemove', function () { sel = n; mark(); });
				list.appendChild(a);
			});
		}
		function mark() {
			list.querySelectorAll('.qs-cmd-item').forEach(function (a, n) { a.classList.toggle('on', n === sel); });
			var on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
		}
		function open() { wrap.classList.add('open'); input.value = ''; sel = 0; draw(); setTimeout(function () { input.focus(); }, 30); }
		function close() { wrap.classList.remove('open'); }

		input.addEventListener('input', function () { sel = 0; draw(); });
		input.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); mark(); e.preventDefault(); }
			else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
			else if (e.key === 'Enter' && shown[sel]) { location.href = shown[sel].url; }
		});
		wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
		document.addEventListener('keydown', function (e) {
			if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); wrap.classList.contains('open') ? close() : open(); }
			else if (e.key === 'Escape') close();
		});
		var btn = document.getElementById('qs-search');
		if (btn) btn.addEventListener('click', open);
	},

	render: function (tree) {
		var node = tree, url = '', crumbs = [];

		this.renderModeMenu(tree);

		var mode = L.env.requestpath.length ? L.env.requestpath[0] : (ui.menu.getChildren(tree)[0] || {}).name;
		var modeNode = mode && tree.children ? tree.children[mode] : null;
		if (modeNode) crumbs.push(modeNode.title);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
				if (node && i > 0) crumbs.push(node.title);
			}
			if (node) this.renderTabMenu(node, url);
		}

		this.renderCrumb(crumbs);
	},

	/* ---------- breadcrumb ---------- */
	renderCrumb: function (list) {
		var box = document.getElementById('qs-crumb');
		if (!box) return;
		list = list.filter(Boolean).slice(-2);
		list.forEach(function (t, i) {
			if (i) box.appendChild(E('span', { 'class': 'qs-sep' }, '/'));
			box.appendChild(E(i === list.length - 1 ? 'strong' : 'span', {}, [ _(t) ]));
		});
	},

	/* ---------- tabs (third level) ---------- */
	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu');
		var ul = E('ul', { 'class': 'tabs' });
		var children = ui.menu.getChildren(tree);
		var activeNode = null;

		children.forEach(function (child) {
			var isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);
			ul.appendChild(E('li', { 'class': 'tabmenu-item-%s %s'.format(child.name, isActive ? 'active' : '') }, [
				E('a', { 'href': L.url(url, child.name) }, [ _(child.title) ])
			]));
			if (isActive) activeNode = child;
		});

		if (ul.children.length == 0) return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	/* ---------- sidebar ---------- */
	renderMainMenu: function (tree, url, level) {
		var self = this;
		var ul = level ? E('ul', { 'class': 'dropdown-menu slide-menu' }) : document.querySelector('#topmenu');
		var children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1) return E([]);

		children.forEach(function (child) {
			var sub = self.renderMainMenu(child, url + '/' + child.name, (level || 0) + 1);
			var hasSub = !!sub.firstElementChild;
			var href = hasSub ? '#' : L.url(url, child.name);
			var isActive = (L.env.dispatchpath[level ? 2 : 1] == child.name) &&
			               (!level || L.env.dispatchpath[1] == url.split('/')[1]);

			var a = E('a', { 'class': hasSub ? 'menu' : '', 'href': href });

			if (!level) {
				a.appendChild(ico(child.name));
				a.appendChild(E('span', { 'class': 'qs-label' }, [ _(child.title) ]));
				if (hasSub) a.appendChild(ico('chevron')).classList.add('qs-chev');
			}
			else {
				a.appendChild(E('span', { 'class': 'qs-dot' }));
				a.appendChild(E('span', { 'class': 'qs-label' }, [ _(child.title) ]));
			}

			var li = E('li', {
				'class': (hasSub ? 'dropdown ' : '') + (isActive ? 'active ' : '') + (isActive && hasSub ? 'open' : ''),
				'data-k': level ? null : child.name
			}, [ a ]);

			if (hasSub) {
				var wrap = E('div', { 'class': 'qs-slide' }, [ sub ]);
				li.appendChild(wrap);
				a.addEventListener('click', function (ev) {
					ev.preventDefault();
					var willOpen = !li.classList.contains('open');
					if (document.documentElement.getAttribute('data-qs-layout') === 'side' || window.innerWidth <= 960)
						ul.querySelectorAll(':scope > li.open').forEach(function (o) { o.classList.remove('open'); });
					li.classList.toggle('open', willOpen);
				});
			}

			ul.appendChild(li);
		});

		ul.style.display = '';
		return ul;
	},

	renderModeMenu: function (tree) {
		var self = this;
		var ul = document.querySelector('#modemenu');
		var children = ui.menu.getChildren(tree);

		children.forEach(function (child, index) {
			var isActive = L.env.requestpath.length ? child.name === L.env.requestpath[0] : index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, [ _(child.title) ])
			]));

			if (isActive) self.renderMainMenu(child, child.name);
		});

		if (ul.children.length > 1) ul.style.display = '';
	},

	/* ---------- drawer, dark-mode button ---------- */
	bindChrome: function () {
		var root = document.documentElement;
		var burger = document.getElementById('qs-burger');
		var back = document.getElementById('qs-backdrop');
		var mode = document.getElementById('qs-mode');

		function setOpen(v) { root.classList.toggle('qs-drawer', v); }
		if (burger) burger.addEventListener('click', function () { setOpen(!root.classList.contains('qs-drawer')); });
		if (back) back.addEventListener('click', function () { setOpen(false); });
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

		function paintMode() {
			if (!mode) return;
			var dark = root.getAttribute('data-darkmode') === 'true';
			mode.innerHTML = '';
			mode.appendChild(ico(dark ? 'sun' : 'moon'));
		}
		paintMode();

		if (mode) mode.addEventListener('click', function () {
			var dark = root.getAttribute('data-darkmode') === 'true';
			if (window.QuickTheme) window.QuickTheme.set('dark', dark ? 'light' : 'dark');
			else root.setAttribute('data-darkmode', dark ? 'false' : 'true');
			paintMode();
		});

		new MutationObserver(paintMode).observe(root, { attributes: true, attributeFilter: [ 'data-darkmode' ] });
	}
});
