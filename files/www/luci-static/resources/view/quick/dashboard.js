'use strict';
'require view';
'require rpc';
'require fs';
'require poll';
'require quick.util as util';

/* لوحة معلومات حية: المعالج والذاكرة والاتصال وسرعة الشبكة والأجهزة المتصلة */

var callInfo = rpc.declare({ object: 'system', method: 'info' });
var callBoard = rpc.declare({ object: 'system', method: 'board' });
var callIfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callDevs = rpc.declare({ object: 'luci-rpc', method: 'getNetworkDevices', expect: { '': {} } });
var callLeases = rpc.declare({ object: 'luci-rpc', method: 'getDHCPLeases', expect: { dhcp_leases: [] } });
var callWifi = rpc.declare({ object: 'network.wireless', method: 'status' });
var callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device' ], expect: { results: [] } });

var SVGNS = 'http://www.w3.org/2000/svg';
var N = 60;                 /* عدد نقاط الرسم */
var rxH = [], txH = [], lastNet = null;
var lastCpu = null;

function svg(tag, attrs) {
	var e = document.createElementNS(SVGNS, tag);
	Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
	return e;
}

function ring(color) {
	var c = 2 * Math.PI * 38;
	var s = svg('svg', { 'class': 'qd-ring', viewBox: '0 0 100 100', style: '--c:' + color });
	s.appendChild(svg('circle', { 'class': 'bg', cx: 50, cy: 50, r: 38 }));
	var fg = svg('circle', { 'class': 'fg', cx: 50, cy: 50, r: 38, 'stroke-dasharray': c, 'stroke-dashoffset': c });
	s.appendChild(fg);
	s._set = function (p) { fg.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(100, p)) / 100)); };
	return s;
}

function icon(name) {
	var sp = E('span', { 'class': 'qs-ico' });
	var P = {
		cpu: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
		ram: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11v2M11 11v2M15 11v2M7 17v3M12 17v3M17 17v3"/>',
		globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
		users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.8.8 3 2.6 3 5.6"/>',
		bolt: '<path d="M13 2.5L4.5 14H11l-1 7.5L19.5 10H13l0-7.5z"/>',
		temp: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/>',
		link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
	};
	sp.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || P.bolt) + '</svg>';
	return sp;
}

function fmtUp(s) {
	s = s | 0;
	var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	return (d ? d + 'd ' : '') + h + 'h ' + m + 'm';
}

function area(el, series, colors) {
	var W = 600, H = 150, max = 1;
	series.forEach(function (a) { a.forEach(function (v) { if (v > max) max = v; }); });
	max *= 1.15;
	el.innerHTML = '';
	[ .25, .5, .75 ].forEach(function (g) { el.appendChild(svg('line', { 'class': 'grid', x1: 0, x2: W, y1: H * g, y2: H * g })); });
	var defs = svg('defs');
	series.forEach(function (a, i) {
		var g = svg('linearGradient', { id: 'qdg' + i, x1: 0, y1: 0, x2: 0, y2: 1 });
		g.appendChild(svg('stop', { offset: '0', 'stop-color': colors[i], 'stop-opacity': '.45' }));
		g.appendChild(svg('stop', { offset: '1', 'stop-color': colors[i], 'stop-opacity': '0' }));
		defs.appendChild(g);
	});
	el.appendChild(defs);
	series.forEach(function (a, i) {
		if (a.length < 2) return;
		var step = W / (N - 1), off = (N - a.length) * step, d = '';
		a.forEach(function (v, k) { d += (k ? 'L' : 'M') + (off + k * step).toFixed(1) + ',' + (H - 6 - (v / max) * (H - 14)).toFixed(1); });
		el.appendChild(svg('path', { d: d + 'L' + W + ',' + H + 'L' + off + ',' + H + 'Z', fill: 'url(#qdg' + i + ')' }));
		el.appendChild(svg('path', { d: d, fill: 'none', stroke: colors[i], 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
	});
}

return view.extend({
	load: function () {
		return Promise.all([ callBoard(), L.resolveDefault(callIfaces(), []) ]);
	},

	handleSave: null, handleSaveApply: null, handleReset: null,

	render: function (data) {
		var board = data[0] || {};
		var q = {};
		function el(key, node) { q[key] = node; return node; }

		var cpuRing = ring('#2dd4bf'), ramRing = ring('#a78bfa');

		var hero = E('div', { 'class': 'qd-hero' }, [
			E('img', { src: '/luci-static/quick/logo.svg', alt: '' }),
			E('div', { 'class': 'qd-hero-main' }, [
				E('h2', {}, board.hostname || 'OpenWrt'),
				E('p', {}, (board.model || '') + (board.release && board.release.description ? ' · ' + board.release.description : '')),
				E('div', { 'class': 'qd-pills' }, [
					el('wanpill', E('span', { 'class': 'qd-pill' }, [ E('i', { 'class': 'qd-dot off' }), _('الاتصال') + ': …' ])),
					el('ip', E('span', { 'class': 'qd-pill' }, 'IP …')),
					el('up', E('span', { 'class': 'qd-pill gold' }, '⏱ …'))
				])
			])
		]);

		var cards = E('div', { 'class': 'qd-grid' }, [
			E('div', { 'class': 'qd-card', style: '--c:#2dd4bf' }, [
				E('h4', {}, [ icon('cpu'), _('المعالج') ]),
				E('div', { 'class': 'qd-ringwrap' }, [ cpuRing, E('div', {}, [ E('div', { 'class': 'qd-big' }, [ el('cpu', E('span', {}, '0')), E('small', {}, '%') ]), el('load', E('div', { 'class': 'qd-sub' }, 'Load …')) ]) ])
			]),
			E('div', { 'class': 'qd-card', style: '--c:#a78bfa' }, [
				E('h4', {}, [ icon('ram'), _('الذاكرة') ]),
				E('div', { 'class': 'qd-ringwrap' }, [ ramRing, E('div', {}, [ E('div', { 'class': 'qd-big' }, [ el('ram', E('span', {}, '0')), E('small', {}, '%') ]), el('ramsub', E('div', { 'class': 'qd-sub' }, '…')) ]) ])
			]),
			E('div', { 'class': 'qd-card', style: '--c:#60a5fa' }, [
				E('h4', {}, [ icon('globe'), _('السرعة الحالية') ]),
				E('div', { 'class': 'qd-big' }, [ el('rx', E('span', {}, '0')), E('small', {}, '↓') ]),
				el('tx', E('div', { 'class': 'qd-sub' }, '↑ 0'))
			]),
			E('div', { 'class': 'qd-card', style: '--c:#f472b6' }, [
				E('h4', {}, [ icon('users'), _('الأجهزة المتصلة') ]),
				E('div', { 'class': 'qd-big' }, [ el('clients', E('span', {}, '0')) ]),
				el('wifi', E('div', { 'class': 'qd-sub' }, 'Wi-Fi …'))
			]),
			E('div', { 'class': 'qd-card', style: '--c:#fbbf24' }, [
				E('h4', {}, [ icon('link'), _('الاتصالات النشطة') ]),
				E('div', { 'class': 'qd-big' }, [ el('conn', E('span', {}, '–')) ]),
				el('connsub', E('div', { 'class': 'qd-sub' }, 'conntrack'))
			]),
			el('tempcard', E('div', { 'class': 'qd-card', style: '--c:#fb7185;display:none' }, [
				E('h4', {}, [ icon('temp'), _('الحرارة') ]),
				E('div', { 'class': 'qd-big' }, [ el('temp', E('span', {}, '–')), E('small', {}, '°C') ])
			]))
		]);

		var chart = svg('svg', { 'class': 'qd-chart', viewBox: '0 0 600 150', preserveAspectRatio: 'none' });
		var traffic = E('div', { 'class': 'qd-card qd-wide' }, [
			E('h4', {}, [ icon('bolt'), _('حركة الشبكة المباشرة') ]),
			chart,
			E('div', { 'class': 'qd-legend' }, [
				E('span', {}, [ E('i', { style: 'background:#60a5fa' }), _('تنزيل') + ' ', el('rxl', E('b', {}, '0')) ]),
				E('span', {}, [ E('i', { style: 'background:#f472b6' }), _('رفع') + ' ', el('txl', E('b', {}, '0')) ]),
				el('tot', E('span', {}, ''))
			])
		]);

		var list = el('list', E('div', { 'class': 'qd-clients' }));
		var clientsCard = E('div', { 'class': 'qd-card qd-wide' }, [ E('h4', {}, [ icon('users'), _('قائمة الأجهزة') ]), list ]);

		var node = E('div', {}, [ hero, cards, traffic, clientsCard ]);

		function rate(b) { return util.fmtRate(b); }
		var first = true;

		function tick() {
			return Promise.all([
				callInfo(), L.resolveDefault(callIfaces(), []), L.resolveDefault(callDevs(), {}), L.resolveDefault(callLeases(), []),
				L.resolveDefault(fs.read_direct('/proc/stat'), ''), L.resolveDefault(fs.read_direct('/proc/sys/net/netfilter/nf_conntrack_count'), ''),
				L.resolveDefault(fs.read_direct('/proc/sys/net/netfilter/nf_conntrack_max'), ''), L.resolveDefault(callWifi(), {}),
				L.resolveDefault(fs.read_direct('/sys/class/thermal/thermal_zone0/temp'), '')
			]).then(function (r) {
				var info = r[0] || {}, ifs = r[1] || [], devs = r[2] || {}, leases = r[3] || [];

				/* ذاكرة + حمل + مدة التشغيل */
				var m = info.memory || {};
				if (m.total) {
					var used = m.total - (m.free || 0) - (m.buffered || 0) - (m.cached || 0);
					var rp = Math.round(used * 100 / m.total);
					q.ram.textContent = rp; ramRing._set(rp);
					q.ramsub.textContent = util.fmtBytes(used) + ' / ' + util.fmtBytes(m.total);
				}
				if (info.load) q.load.textContent = 'Load ' + info.load.map(function (v) { return (v / 65535).toFixed(2); }).join(' · ');
				q.up.textContent = '⏱ ' + fmtUp(info.uptime);

				/* المعالج */
				var line = String(r[4]).split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
				if (line.length > 4) {
					var idle = line[3] + (line[4] || 0), tot = line.reduce(function (a, b) { return a + b; }, 0);
					if (lastCpu) {
						var dt = tot - lastCpu.t, di = idle - lastCpu.i;
						var cp = dt > 0 ? Math.round((dt - di) * 100 / dt) : 0;
						q.cpu.textContent = cp; cpuRing._set(cp);
					}
					lastCpu = { t: tot, i: idle };
				}

				/* الاتصال: الواجهة التي عليها المسار الافتراضي */
				var wan = null;
				ifs.forEach(function (i) {
					if (!wan && i.up && (i.route || []).some(function (x) { return x.target === '0.0.0.0' && !x.mask; })) wan = i;
				});
				if (!wan) ifs.forEach(function (i) { if (!wan && i.interface === 'wan') wan = i; });
				var online = !!(wan && wan.up);
				q.wanpill.innerHTML = '';
				q.wanpill.appendChild(E('i', { 'class': 'qd-dot' + (online ? '' : ' off') }));
				q.wanpill.appendChild(document.createTextNode(online ? _('متصل بالإنترنت') : _('غير متصل')));
				var addr = wan && (wan['ipv4-address'] || [])[0];
				q.ip.textContent = 'IP ' + (addr ? addr.address : '—') + (wan ? ' · ' + wan.interface : '');

				/* السرعة */
				var dev = wan && (wan.l3_device || wan.device), st = dev && devs[dev] && devs[dev].stats;
				if (st) {
					var now = Date.now();
					if (lastNet && lastNet.dev === dev) {
						var s = (now - lastNet.t) / 1000;
						var rx = Math.max(0, (st.rx_bytes - lastNet.rx) / s), tx = Math.max(0, (st.tx_bytes - lastNet.tx) / s);
						rxH.push(rx); txH.push(tx);
						if (rxH.length > N) { rxH.shift(); txH.shift(); }
						q.rx.textContent = rate(rx);
						q.tx.textContent = '↑ ' + rate(tx);
						q.rxl.textContent = rate(rx); q.txl.textContent = rate(tx);
						area(chart, [ rxH, txH ], [ '#60a5fa', '#f472b6' ]);
					}
					lastNet = { dev: dev, t: now, rx: st.rx_bytes, tx: st.tx_bytes };
					q.tot.textContent = _('الإجمالي منذ التشغيل') + ': ↓ ' + util.fmtBytes(st.rx_bytes) + ' · ↑ ' + util.fmtBytes(st.tx_bytes);
				}

				/* الأجهزة */
				q.clients.textContent = leases.length;
				q.list.innerHTML = '';
				leases.slice(0, 40).forEach(function (l) {
					var nm = l.hostname || l.macaddr || '?';
					q.list.appendChild(E('div', { 'class': 'qd-client' }, [
						E('div', { 'class': 'qd-av' }, String(nm).charAt(0).toUpperCase()),
						E('div', {}, [ E('b', {}, nm), E('span', {}, (l.ipaddr || '') + ' · ' + (l.macaddr || '')) ])
					]));
				});
				if (!leases.length) q.list.appendChild(E('div', { 'class': 'qw-empty' }, _('لا توجد أجهزة في جدول DHCP.')));

				/* اتصالات */
				var cc = parseInt(r[5], 10), cm = parseInt(r[6], 10);
				if (cc >= 0) { q.conn.textContent = cc; q.connsub.textContent = cm ? _('من أصل ') + cm : 'conntrack'; }

				/* حرارة */
				var t = parseInt(r[8], 10);
				if (t > 0) { q.tempcard.style.display = ''; q.temp.textContent = (t / (t > 1000 ? 1000 : 1)).toFixed(0); }

				/* عملاء Wi-Fi */
				var ws = r[7] || {}, names = [];
				Object.keys(ws).forEach(function (rn) { ((ws[rn].interfaces || [])).forEach(function (i) { if (i.ifname) names.push(i.ifname); }); });
				return Promise.all(names.map(function (n) { return L.resolveDefault(callAssoc(n), []); })).then(function (all) {
					var total = all.reduce(function (a, b) { return a + (b ? b.length : 0); }, 0);
					q.wifi.textContent = 'Wi-Fi: ' + total + ' · ' + _('سلكي/أخرى') + ': ' + Math.max(0, leases.length - total);
				});
			}).catch(function () {});
		}

		tick().then(function () { if (first) { first = false; poll.add(tick, 3); } });
		return node;
	}
});
