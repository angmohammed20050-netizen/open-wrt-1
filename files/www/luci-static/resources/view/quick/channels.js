'use strict';
'require view';
'require uci';
'require rpc';
'require ui';
'require quick.wifi as wifi';

/* صفحة مستقلة ومتكاملة لتحليل القنوات واختيار القناة الأقل ازدحاماً */

var callWifiStatus = rpc.declare({ object: 'network.wireless', method: 'status' });
var callScan = rpc.declare({ object: 'iwinfo', method: 'scan', params: [ 'device' ], expect: { results: [] } });
var callFreq = rpc.declare({ object: 'iwinfo', method: 'freqlist', params: [ 'device' ], expect: { results: [] } });
var callInfo = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ] });

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function () {
		return Promise.all([ uci.load('wireless'), L.resolveDefault(callWifiStatus(), {}) ]);
	},

	render: function (data) {
		var status = data[1] || {};
		var radios = Object.keys(status).map(function (name) {
			var r = status[name] || {}, ifs = (r.interfaces || []).filter(function (i) { return i.ifname; });
			return { name: name, up: !!r.up, ifname: ifs.length ? ifs[0].ifname : null, cfg: r.config || {} };
		});

		var sel = E('select', { 'class': 'cbi-input-select' }, radios.map(function (r) {
			var band = ({ '2g': '2.4GHz', '5g': '5GHz', '6g': '6GHz' })[r.cfg.band] || r.cfg.band || '';
			return E('option', { value: r.name }, r.name + (band ? ' · ' + band : '') + (r.ifname ? '' : ' (' + _('لا توجد شبكة نشطة') + ')'));
		}));
		var scanBtn = E('button', { 'class': 'cbi-button cbi-button-action important', 'type': 'button' }, _('ابدأ فحص وتحليل القنوات'));
		var out = E('div', {});

		function applyChannel(radio, ch) {
			uci.set('wireless', radio, 'channel', String(ch));
			uci.save().then(function () {
				return uci.apply();
			}).then(function () {
				ui.addNotification(null, E('p', _('تم تثبيت القناة ') + ch + _(' على ') + radio + _(' وتطبيقها بنجاح ✓')), 'info');
			});
		}

		function show(radio, res) {
			out.innerHTML = '';
			if (!res) { out.appendChild(E('div', { 'class': 'qw-empty' }, _('تعذر قراءة قائمة القنوات المسموحة لهذا الراديو.'))); return; }
			var b = res.best, cur = res.current;
			var msg = res.stay
				? _('قناتك الحالية (') + cur.ch + _(') ممتازة وقريبة من الأفضل.')
				: _('ازدحام القناة: ') + b.pct + '% · ' + wifi.levelName(b.level) + (b.dfs ? ' · DFS' : '');

			out.appendChild(E('div', { 'class': 'qw-best' }, [
				E('div', { 'class': 'qw-crown' }, String(b.ch)),
				E('div', {}, [
					E('h4', {}, _('أفضل قناة مرشّحة: القناة ') + b.ch + ' (' + b.mhz + ' MHz)'),
					E('p', {}, msg + (cur && !res.stay ? ' · ' + _('الحالية ') + cur.ch + ': ' + cur.pct + '%' : ''))
				]),
				E('div', { 'class': 'qw-act' }, [
					E('button', { 'class': 'cbi-button cbi-button-apply important', 'type': 'button', click: function () { applyChannel(radio, b.ch); } }, _('تطبيق القناة ') + b.ch + _(' فوراً'))
				])
			]));

			out.appendChild(E('div', { 'class': 'qw-bars' }, res.rows.map(function (r) {
				return E('div', {
					'class': 'qw-col lv' + r.level + (r.ch === b.ch ? ' best' : '') + (cur && r.ch === cur.ch ? ' cur' : ''),
					'title': 'CH ' + r.ch + ' · ' + r.pct + '% · ' + r.count + ' شبكة'
				}, [
					E('span', { 'class': 'c' }, r.pct + '%'),
					E('div', { 'class': 'bar', 'style': 'height:' + Math.max(4, r.pct * 0.78) + '%' }),
					E('span', { 'class': 'n' }, String(r.ch))
				]);
			})));

			var alt = res.ranked.slice(1, 4);
			if (alt.length) {
				out.appendChild(E('h3', { 'style': 'margin-top:14px' }, _('قنوات بديلة ممتازة')));
				out.appendChild(E('div', { 'class': 'qw-nets' }, alt.map(function (r) {
					return E('div', { 'class': 'qw-net alt' }, [
						E('b', {}, _('القناة ') + r.ch + (r.dfs ? ' · DFS' : '')),
						E('span', {}, r.pct + '%'),
						E('button', { 'class': 'cbi-button', 'type': 'button', click: function () { applyChannel(radio, r.ch); } }, _('تطبيق'))
					]);
				})));
			}

			var near = res.nets.slice().sort(function (a, b) { return b.signal - a.signal; });
			out.appendChild(E('h3', { 'style': 'margin-top:18px' }, _('جميع الشبكات المجاورة المرصودة') + ' (' + near.length + ')'));
			if (!near.length) {
				out.appendChild(E('div', { 'class': 'qw-empty' }, _('لم تُرصد شبكات مجاورة — الجو نظيف تماماً!')));
				return;
			}
			var tbl = E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('اسم الشبكة (SSID)')),
					E('th', { 'class': 'th' }, 'BSSID'),
					E('th', { 'class': 'th' }, _('القناة')),
					E('th', { 'class': 'th' }, _('قوة الإشارة'))
				])
			].concat(near.map(function (n) {
				return E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, E('b', {}, n.ssid || _('(مخفية)'))),
					E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:.9em' }, n.bssid || '—'),
					E('td', { 'class': 'td' }, 'CH ' + n.channel),
					E('td', { 'class': 'td' }, n.signal + ' dBm')
				]);
			})));
			out.appendChild(tbl);
		}

		scanBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			var radio = radios.filter(function (r) { return r.name === sel.value; })[0];
			if (!radio || !radio.ifname) {
				out.innerHTML = '';
				out.appendChild(E('div', { 'class': 'qw-empty' }, _('هذا الراديو غير نشط حالياً.')));
				return;
			}
			scanBtn.disabled = true;
			out.innerHTML = '';
			out.appendChild(E('div', { 'class': 'qw-empty' }, [ E('span', { 'class': 'qw-spin' }), _('جارٍ مسح الطيف الترددي وتحليل القنوات...') ]));

			Promise.all([ callScan(radio.ifname), callFreq(radio.ifname), L.resolveDefault(callInfo(radio.ifname), {}) ]).then(function (r) {
				var info = r[2] || {};
				var width = +(String(radio.cfg.htmode || '').match(/(\d+)$/) || [ 0, 20 ])[1] || 20;
				var current = +radio.cfg.channel || +info.channel || 0;
				if (isNaN(current)) current = +info.channel || 0;
				var res = wifi.analyze(r[0], r[1], { width: width, current: current, own: info.bssid ? [ info.bssid ] : [] });
				show(radio.name, res);
			}).catch(function (e) {
				out.innerHTML = '';
				out.appendChild(E('div', { 'class': 'qw-empty' }, _('فشل الفحص: ') + (e && e.message ? e.message : e)));
			}).then(function () { scanBtn.disabled = false; });
		});

		return E('div', {}, [
			E('h2', {}, _('تحليل القنوات')),
			E('div', { 'class': 'cbi-section qw-card' }, [
				E('h3', {}, _('محلل القنوات اللاسلكية (Spectrum Analyzer)')),
				E('p', { 'class': 'cbi-section-descr' }, _('يمسح جميع الشبكات المجاورة على 2.4GHz و 5GHz، ويحسب التداخل الفعلي لكل قناة، ويرشّح أفضل قناة للتطبيق بضغطة زر.')),
				E('div', { 'class': 'qw-top' }, [ sel, scanBtn ]),
				out
			])
		]);
	}
});
