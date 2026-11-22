'use strict';
'require view';
'require rpc';
'require poll';
'require dom';
'require ui';
'require quick.util as util';

/* سجل المتصلين: يعرض الأجهزة المتصلة الآن + سجل الأجهزة السابقة مع قوة إشارة WiFi والبحث */

var callWifiStatus = rpc.declare({ object: 'network.wireless', method: 'status' });
var callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device' ], expect: { results: [] } });

function fmtTs(ts) {
	if (!ts) return '—';
	var d = new Date(ts * 1000);
	return d.toLocaleString('sv-SE');
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function () {
		return Promise.all([
			util.ctl([ 'clients-log' ]),
			L.resolveDefault(callWifiStatus(), {})
		]);
	},

	fetchWifiSignals: function (wstatus) {
		var ifnames = [];
		Object.keys(wstatus || {}).forEach(function (r) {
			((wstatus[r] && wstatus[r].interfaces) || []).forEach(function (i) {
				if (i.ifname) ifnames.push(i.ifname);
			});
		});
		return Promise.all(ifnames.map(function (ifn) { return L.resolveDefault(callAssoc(ifn), []); })).then(function (lists) {
			var map = {};
			lists.forEach(function (arr) {
				(arr || []).forEach(function (st) {
					if (st && st.mac) map[String(st.mac).toLowerCase()] = st;
				});
			});
			return map;
		});
	},

	render: function (data) {
		var self = this;
		var wstatus = data[1] || {};
		var search = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('ابحث بالاسم أو IP أو MAC...'), 'style': 'max-width:300px;width:100%' });
		var statsBar = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.7em;margin-bottom:.8em' });
		var tbl = E('table', { 'class': 'table' });
		var lastData = data[0] || {};
		var sigMap = {};

		function tile(lbl, val, col) {
			return E('div', { 'class': 'cbi-section', 'style': 'padding:.65em .9em;margin:0' }, [
				E('div', { 'style': 'opacity:.7;font-size:.85em' }, lbl),
				E('div', { 'style': 'font-size:1.35em;font-weight:700;color:' + (col || 'inherit') }, val)
			]);
		}

		function draw() {
			var q = (search.value || '').trim().toLowerCase();
			var recs = (lastData && lastData.records) || [];
			var onlineCount = recs.filter(function (r) { return r.online; }).length;
			var wifiCount = Object.keys(sigMap).length;

			dom.content(statsBar, [
				tile(_('متصل الآن'), String(onlineCount), '#34d399'),
				tile(_('متصل عبر WiFi'), String(wifiCount), '#60a5fa'),
				tile(_('إجمالي السجل المحفوظ'), String(recs.length))
			]);

			recs = recs.slice().sort(function (a, b) {
				if (a.online !== b.online) return a.online ? -1 : 1;
				return (b.last || 0) - (a.last || 0);
			}).filter(function (r) {
				if (!q) return true;
				return (r.name || '').toLowerCase().indexOf(q) > -1 ||
					(r.ip || '').toLowerCase().indexOf(q) > -1 ||
					(r.mac || '').toLowerCase().indexOf(q) > -1;
			});

			var rows = [ E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('الحالة')),
				E('th', { 'class': 'th' }, _('اسم الجهاز')),
				E('th', { 'class': 'th' }, 'IP'),
				E('th', { 'class': 'th' }, 'MAC'),
				E('th', { 'class': 'th' }, _('إشارة WiFi')),
				E('th', { 'class': 'th' }, _('أول ظهور')),
				E('th', { 'class': 'th' }, _('آخر نشاط'))
			]) ];

			recs.forEach(function (r) {
				var st = sigMap[String(r.mac || '').toLowerCase()];
				var sigTxt = st ? (st.signal + ' dBm') : (r.online ? _('سلكي / LAN') : '—');
				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, E('span', { 'style': 'font-weight:700;color:' + (r.online ? '#34d399' : '#94a3b8') }, r.online ? _('● متصل') : _('○ غير متصل'))),
					E('td', { 'class': 'td' }, E('b', {}, r.name || _('غير مسمى'))),
					E('td', { 'class': 'td', 'style': 'font-family:monospace' }, r.ip || '—'),
					E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:.9em' }, (r.mac || '').toUpperCase()),
					E('td', { 'class': 'td' }, sigTxt),
					E('td', { 'class': 'td', 'style': 'font-size:.85em;opacity:.85;direction:ltr' }, fmtTs(r.first)),
					E('td', { 'class': 'td', 'style': 'font-size:.85em;opacity:.85;direction:ltr' }, fmtTs(r.last))
				]));
			});

			if (rows.length === 1) {
				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'colspan': '7', 'style': 'text-align:center;opacity:.7' }, _('لا توجد سجلات مطابقة.'))
				]));
			}
			dom.content(tbl, rows);
		}

		function refresh() {
			return Promise.all([ util.ctl([ 'clients-log' ]), self.fetchWifiSignals(wstatus) ]).then(function (res) {
				lastData = res[0] || {};
				sigMap = res[1] || {};
				draw();
			});
		}

		search.addEventListener('input', draw);
		refresh();
		poll.add(refresh, 6);

		var clearBtn = E('button', { 'class': 'cbi-button cbi-button-negative', 'type': 'button' }, _('مسح السجل'));
		clearBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			util.ctl([ 'clients-log-clear' ]).then(function () {
				ui.addNotification(null, E('p', _('تم مسح سجل المتصلين ✓')), 'info');
				refresh();
			});
		});

		return E('div', {}, [
			E('h2', {}, _('سجل المتصلين')),
			statsBar,
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6em;margin-bottom:.8em' }, [
					search,
					clearBtn
				]),
				tbl
			])
		]);
	}
});
