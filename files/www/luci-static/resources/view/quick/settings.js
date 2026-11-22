'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require quick.util as util';
'require quick.wifi as wifi';

var callWifiStatus = rpc.declare({ object: 'network.wireless', method: 'status' });
var callScan = rpc.declare({ object: 'iwinfo', method: 'scan', params: [ 'device' ], expect: { results: [] } });
var callFreq = rpc.declare({ object: 'iwinfo', method: 'freqlist', params: [ 'device' ], expect: { results: [] } });
var callInfo = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ] });
var callTxList = rpc.declare({ object: 'iwinfo', method: 'txpowerlist', params: [ 'device' ], expect: { results: [] } });

/* القسم 1: الإعدادات السريعة
   dBm، القناة، اسم الشبكة وحمايتها، الميش، أوضاع الشبكة، طرق الربط مع ميكروتك، VLAN */

return view.extend({
	load: function () {
		return Promise.all([ uci.load('wireless'), uci.load('network'), uci.load('dhcp'), L.resolveDefault(callWifiStatus(), {}) ]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

		/* ================= تحكم قدرة البث (dBm) المربوطة بالهاردوير الحقيقي ================= */
	renderTxPowerCard: function (status) {
		var radios = Object.keys(status || {}).map(function (name) {
			var r = status[name] || {}, ifs = (r.interfaces || []).filter(function (i) { return i.ifname; });
			return { name: name, up: !!r.up, ifname: ifs.length ? ifs[0].ifname : null, cfg: r.config || {} };
		});

		var grid = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.9em' });

		if (!radios.length) {
			grid.appendChild(E('div', { 'class': 'qw-empty' }, _('لم يتم العثور على بطاقات واي فاي نشطة.')));
		}

		radios.forEach(function (radio) {
			var band = ({ '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' })[radio.cfg.band] || radio.cfg.band || '';
			var selectedVal = uci.get('wireless', radio.name, 'txpower') || 'auto';

			var selBadge = E('span', { 'style': 'display:inline-block;padding:.2em .65em;border-radius:999px;background:rgba(124,92,255,.22);border:1px solid rgba(124,92,255,.5);font-weight:700;font-size:1.05em' },
				selectedVal === 'auto' ? _('تلقائي (Auto)') : (selectedVal + ' dBm'));
			var realBadge = E('span', { 'style': 'display:inline-block;padding:.2em .65em;border-radius:999px;background:rgba(52,211,153,.18);border:1px solid rgba(52,211,153,.45);color:#34d399;font-weight:700;font-size:1.05em' }, _('جارٍ القراءة...'));

			var slider = E('input', { 'type': 'range', 'min': '1', 'max': '27', 'step': '1', 'value': (selectedVal === 'auto' ? '20' : String(selectedVal)), 'style': 'width:100%;accent-color:var(--qs-accent,#7c5cff);cursor:pointer' });
			var dropdown = E('select', { 'class': 'cbi-input-select', 'style': 'min-width:130px' }, [
				E('option', { value: 'auto' }, _('تلقائي (Auto)'))
			]);
			var applyBtn = E('button', { 'class': 'cbi-button cbi-button-apply important', 'type': 'button' }, _('تطبيق dBm'));
			var note = E('div', { 'style': 'font-size:.82em;opacity:.75;margin-top:.4em' }, '');

			function syncUI(val) {
				selBadge.textContent = (val === 'auto' || !val) ? _('تلقائي (Auto)') : (val + ' dBm');
				dropdown.value = val || 'auto';
				if (val && val !== 'auto') slider.value = String(val);
			}

			function refreshReal() {
				if (!radio.ifname) {
					realBadge.textContent = _('الراديو متوقف');
					return;
				}
				Promise.all([
					L.resolveDefault(callInfo(radio.ifname), {}),
					L.resolveDefault(callTxList(radio.ifname), [])
				]).then(function (res) {
					var info = res[0] || {}, list = res[1] || [];
					if (info.txpower != null) {
						var mw = Math.round(Math.pow(10, info.txpower / 10));
						realBadge.textContent = info.txpower + ' dBm (' + mw + ' mW)';
					} else {
						realBadge.textContent = _('غير متاح');
					}

					/* تعبئة قائمة القيم الحقيقية المدعومة من هاردوير الجهاز */
					var curSel = dropdown.value || selectedVal;
					dropdown.innerHTML = '';
					dropdown.appendChild(E('option', { value: 'auto' }, _('تلقائي (Auto)')));
					var vals = [];
					if (list && list.length) {
						var minV = 99, maxV = 1;
						list.forEach(function (item) {
							if (item && item.dbm != null && vals.indexOf(item.dbm) < 0) {
								vals.push(item.dbm);
								if (item.dbm < minV) minV = item.dbm;
								if (item.dbm > maxV) maxV = item.dbm;
								dropdown.appendChild(E('option', { value: String(item.dbm) }, item.dbm + ' dBm (' + (item.mw || Math.round(Math.pow(10, item.dbm / 10))) + ' mW)'));
							}
						});
						if (vals.length) {
							slider.min = String(minV);
							slider.max = String(maxV);
							note.textContent = _('المدى المدعوم حقيقياً في هاردوير الجهاز: ') + minV + ' – ' + maxV + ' dBm';
						}
					} else {
						for (var d = 1; d <= 27; d++) {
							dropdown.appendChild(E('option', { value: String(d) }, d + ' dBm'));
						}
					}
					syncUI(curSel);
				});
			}

			slider.addEventListener('input', function () {
				syncUI(slider.value);
			});
			dropdown.addEventListener('change', function () {
				syncUI(dropdown.value);
			});

			applyBtn.addEventListener('click', function (ev) {
				ev.preventDefault();
				var v = dropdown.value;
				applyBtn.disabled = true;
				realBadge.textContent = _('جارٍ التطبيق...');
				util.ctl([ 'txpower-set', radio.name, v ]).then(function (r) {
					applyBtn.disabled = false;
					if (r && r.ok) {
						selectedVal = v;
						syncUI(v);
						ui.addNotification(null, E('p', _('تم ضبط قدرة البث لـ ') + radio.name + _(' على ') + (v === 'auto' ? 'Auto' : v + ' dBm') + _(' وتحديث الهاردوير ✓')), 'info');
						setTimeout(refreshReal, 1200);
					} else {
						ui.addNotification(null, E('p', _('تعذر التعديل: ') + (r && r.error ? r.error : '')), 'warning');
						refreshReal();
					}
				});
			});

			refreshReal();

			grid.appendChild(E('div', { 'class': 'cbi-section', 'style': 'padding:.9em 1.1em;margin:0' }, [
				E('div', { 'style': 'font-size:1.1em;font-weight:700;margin-bottom:.6em' }, radio.name + (band ? ' · ' + band : '')),
				E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5em;margin-bottom:.7em' }, [
					E('div', {}, [ E('div', { 'style': 'font-size:.8em;opacity:.7;margin-bottom:.2em' }, _('القيمة المختارة')), selBadge ]),
					E('div', {}, [ E('div', { 'style': 'font-size:.8em;opacity:.7;margin-bottom:.2em' }, _('القدرة الحقيقية بالجهاز الآن')), realBadge ])
				]),
				E('div', { 'style': 'margin:.6em 0' }, [ slider ]),
				E('div', { 'style': 'display:flex;gap:.5em;align-items:center;flex-wrap:wrap' }, [ dropdown, applyBtn ]),
				note
			]));
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('التحكم المباشر بقدرة البث الحقيقية (Real dBm)')),
			E('p', { 'class': 'cbi-section-descr' }, _('يعرض القيمة التي اخترتها ومقابلها القدرة الحقيقية الفعلية الصادرة من شريحة الواي فاي في الجهاز (مربوطة مباشرة بتعريف الهاردوير عبر iwinfo).')),
			grid
		]);
	},

	/* ================= تحليل القنوات واختيار الأفضل ================= */
	renderAnalyzer: function (status) {
		var radios = Object.keys(status || {}).map(function (name) {
			var r = status[name] || {}, ifs = (r.interfaces || []).filter(function (i) { return i.ifname; });
			return { name: name, up: !!r.up, ifname: ifs.length ? ifs[0].ifname : null, cfg: r.config || {} };
		});

		var sel = E('select', { 'class': 'cbi-input-select' }, radios.map(function (r) {
			var band = ({ '2g': '2.4GHz', '5g': '5GHz', '6g': '6GHz' })[r.cfg.band] || r.cfg.band || '';
			return E('option', { value: r.name }, r.name + (band ? ' · ' + band : '') + (r.ifname ? '' : ' (' + _('لا توجد شبكة نشطة') + ')'));
		}));
		var scanBtn = E('button', { 'class': 'cbi-button cbi-button-action', 'type': 'button' }, _('ابدأ فحص القنوات'));
		var out = E('div', {});
		var card = E('div', { 'class': 'cbi-section qw-card' }, [
			E('h3', {}, _('تحليل القنوات واختيار أفضل قناة')),
			E('p', { 'class': 'cbi-section-descr' }, _('يفحص الشبكات المجاورة ويحسب ازدحام كل قناة (مع التداخل بين القنوات المتجاورة وقوة الإشارة) ثم يرشّح القناة الأقل ازدحاماً. الفحص يستغرق عدة ثوانٍ وقد ينقطع الواي فاي لحظياً.')),
			E('div', { 'class': 'qw-top' }, [ sel, scanBtn ]),
			out
		]);

		if (!radios.length)
			out.appendChild(E('div', { 'class': 'qw-empty' }, _('لا يوجد راديو لاسلكي نشط.')));

		function applyChannel(radio, ch) {
			uci.set('wireless', radio, 'channel', String(ch));
			return uci.save().then(function () {
				ui.addNotification(null, E('p', _('تم تعيين القناة ') + ch + _(' على ') + radio + _('. اضغط «حفظ وتطبيق» لتفعيلها.')), 'info');
				setTimeout(function () { location.reload(); }, 1400);
			});
		}

		function show(radio, res, info) {
			out.innerHTML = '';
			if (!res) { out.appendChild(E('div', { 'class': 'qw-empty' }, _('تعذر قراءة قائمة القنوات المسموحة لهذا الراديو.'))); return; }
			var b = res.best, cur = res.current;
			var msg = res.stay
				? _('قناتك الحالية (') + cur.ch + _(') قريبة من الأفضل، لا حاجة للتغيير.')
				: _('ازدحام القناة: ') + b.pct + '% · ' + wifi.levelName(b.level) + (b.dfs ? ' · DFS' : '');
			var act = E('div', { 'class': 'qw-act' }, [
				E('button', { 'class': 'cbi-button cbi-button-apply important', 'type': 'button', click: function () { applyChannel(radio, b.ch); } }, _('تطبيق القناة ') + b.ch)
			]);
			out.appendChild(E('div', { 'class': 'qw-best' }, [
				E('div', { 'class': 'qw-crown' }, String(b.ch)),
				E('div', {}, [
					E('h4', {}, (res.stay ? _('الأفضل: القناة ') : _('أفضل قناة: ')) + b.ch + ' (' + b.mhz + ' MHz)'),
					E('p', {}, msg + (cur && !res.stay ? ' · ' + _('الحالية ') + cur.ch + ': ' + cur.pct + '%' : ''))
				]),
				act
			]));

			if (res.band === '2.4' && res.width > 20 && b.pct >= 40)
				out.appendChild(E('div', { 'class': 'alert-message warning', 'style': 'margin:0 0 14px' }, _('تنبيه: عرض القناة ') + res.width + _(' MHz على 2.4GHz يضاعف التداخل. مع كثرة الشبكات المجاورة الأفضل ضبطه على 20 MHz (HT20/HE20) من الإعدادات أدناه.')));
			out.appendChild(E('div', { 'class': 'qw-bars' }, res.rows.map(function (r) {
				return E('div', { 'class': 'qw-col lv' + r.level + (r.ch === b.ch ? ' best' : '') + (cur && r.ch === cur.ch ? ' cur' : ''),
					'title': 'CH ' + r.ch + ' · ' + r.pct + '% · ' + r.count + ' ' + _('شبكة') + (r.dfs ? ' · DFS' : '') }, [
					E('span', { 'class': 'c' }, r.pct + '%'),
					E('div', { 'class': 'bar', 'style': 'height:' + Math.max(4, r.pct * 0.78) + '%' }),
					E('span', { 'class': 'n' }, String(r.ch))
				]);
			})));
			out.appendChild(E('div', { 'class': 'qw-lbls' }, [
				E('span', {}, [ E('i', { 'style': 'background:#34d399' }), _('مثالية') ]),
				E('span', {}, [ E('i', { 'style': 'background:#a3e635' }), _('جيدة') ]),
				E('span', {}, [ E('i', { 'style': 'background:#fbbf24' }), _('مزدحمة') ]),
				E('span', {}, [ E('i', { 'style': 'background:#fb7185' }), _('مزدحمة جداً') ]),
				E('span', {}, '★ ' + _('الأفضل') + ' · ● ' + _('الحالية')),
				E('span', {}, _('عرض القناة المحسوب: ') + res.width + ' MHz')
			]));

			var alt = res.ranked.slice(1, 4);
			if (alt.length) {
				out.appendChild(E('h3', { 'style': 'margin-top:6px' }, _('بدائل جيدة')));
				out.appendChild(E('div', { 'class': 'qw-nets' }, alt.map(function (r) {
					return E('div', { 'class': 'qw-net alt' }, [
						E('b', {}, _('القناة ') + r.ch + (r.dfs ? ' · DFS' : '')),
						E('span', {}, r.pct + '%'),
						E('button', { 'class': 'cbi-button', 'type': 'button', click: function () { applyChannel(radio, r.ch); } }, _('استخدم هذه'))
					]);
				})));
			}

			var near = res.nets.slice().sort(function (a, b) { return b.signal - a.signal; }).slice(0, 12);
			out.appendChild(E('h3', { 'style': 'margin-top:18px' }, _('الشبكات المجاورة') + ' (' + res.nets.length + ')'));
			out.appendChild(near.length ? E('div', { 'class': 'qw-nets' }, near.map(function (n) {
				var pct = Math.max(4, Math.min(100, Math.round((n.signal + 100) * 1.6)));
				return E('div', { 'class': 'qw-net' }, [
					E('b', {}, n.ssid || _('(مخفية)')),
					E('span', {}, 'CH ' + n.channel),
					E('div', { 'class': 'qw-sig', 'title': n.signal + ' dBm' }, [ E('i', { 'style': 'width:' + pct + '%' }) ])
				]);
			})) : E('div', { 'class': 'qw-empty' }, _('لم تُرصد شبكات مجاورة — القنوات كلها فاضية.')));
		}

		scanBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			var radio = radios.filter(function (r) { return r.name === sel.value; })[0];
			if (!radio || !radio.ifname) {
				out.innerHTML = '';
				out.appendChild(E('div', { 'class': 'qw-empty' }, _('هذا الراديو لا يملك شبكة نشطة للفحص. فعّل شبكة عليه أولاً.')));
				return;
			}
			scanBtn.disabled = true;
			out.innerHTML = '';
			out.appendChild(E('div', { 'class': 'qw-empty' }, [ E('span', { 'class': 'qw-spin' }), _('جارٍ فحص القنوات...') ]));

			Promise.all([ callScan(radio.ifname), callFreq(radio.ifname), L.resolveDefault(callInfo(radio.ifname), {}) ]).then(function (r) {
				var info = r[2] || {};
				var width = +(String(radio.cfg.htmode || '').match(/(\d+)$/) || [ 0, 20 ])[1] || 20;
				var current = +radio.cfg.channel || +info.channel || 0;
				if (isNaN(current)) current = +info.channel || 0;
				var res = wifi.analyze(r[0], r[1], { width: width, current: current, own: info.bssid ? [ info.bssid ] : [] });
				show(radio.name, res, info);
			}).catch(function (e) {
				out.innerHTML = '';
				out.appendChild(E('div', { 'class': 'qw-empty' }, _('فشل الفحص: ') + (e && e.message ? e.message : e)));
			}).then(function () { scanBtn.disabled = false; });
		});

		return card;
	},

	render: function (data) {
		var m, s, o, maps = [];

		/* ================= الراديو وقدرة البث ================= */
		m = new form.Map('wireless', _('الإعدادات السريعة'),
			_('قدرة البث والقناة واسم الشبكة وحمايتها والميش وأوضاع الشبكة وطرق الربط. بعد الحفظ والتطبيق قد ينقطع الواي فاي لثواني.'));
		maps.push(m);

		s = m.section(form.TypedSection, 'wifi-device', _('الراديو وقدرة البث (dBm)'));
		s.anonymous = false;

		o = s.option(form.Value, 'txpower', _('قدرة البث (dBm)'),
			_('اتركها فاضية للوضع التلقائي. القيم العالية ترفع الحرارة وقد تخالف أنظمة بلدك، وبعض الأجهزة تتجاهلها أو تحدّها.'));
		o.datatype = 'range(1,30)';
		o.placeholder = 'auto';
		o.rmempty = true;

		o = s.option(form.Value, 'channel', _('القناة'));
		o.placeholder = 'auto';
		[ 'auto', 1, 6, 11, 36, 40, 44, 48, 149, 153, 157, 161 ].forEach(function (c) { o.value(c); });
		o.rmempty = true;

		o = s.option(form.Value, 'htmode', _('عرض القناة'));
		[ 'HT20', 'HT40', 'VHT20', 'VHT40', 'VHT80', 'HE20', 'HE40', 'HE80' ].forEach(function (c) { o.value(c); });
		o.rmempty = true;

		o = s.option(form.Value, 'country', _('رمز الدولة'), _('مثال: YE أو SA أو AE'));
		o.placeholder = 'YE';
		o.datatype = 'rangelength(2,2)';
		o.rmempty = true;

		o = s.option(form.Flag, 'disabled', _('تعطيل الراديو'));

		/* ============ الشبكات اللاسلكية: الاسم والحماية والميش ============ */
		m = new form.Map('wireless', _('الشبكات اللاسلكية'),
			_('اسم الشبكة والحماية والوضع. وضع Client يربطك بشبكة أخرى (مثل ميكروتك)، وMesh لشبكة 802.11s بين راوترات OpenWrt.'));
		maps.push(m);

		s = m.section(form.TypedSection, 'wifi-iface', _('الشبكات'));
		s.anonymous = true;
		s.addremove = true;

		o = s.option(form.Value, 'device', _('الراديو'));
		o.default = 'radio0';
		o.datatype = 'uciname';

		o = s.option(form.ListValue, 'mode', _('الوضع'),
			_('ap: بث شبكة. sta: عميل (يتصل بشبكة ثانية مثل ميكروتك). mesh: ميش 802.11s (يحتاج wpad-mesh). adhoc: نقطة لنقطة.'));
		o.value('ap', _('Access Point (بث شبكة)'));
		o.value('sta', _('Client (اتصال بشبكة أخرى)'));
		o.value('mesh', _('Mesh (802.11s)'));
		o.value('adhoc', _('Ad-Hoc'));
		o.default = 'ap';

		o = s.option(form.Value, 'ssid', _('اسم الشبكة (SSID)'));
		o.depends('mode', 'ap');
		o.depends('mode', 'sta');
		o.depends('mode', 'adhoc');
		o.datatype = 'maxlength(32)';

		o = s.option(form.Value, 'bssid', _('BSSID (اختياري)'), _('لتثبيت الاتصال على جهاز بعينه (مثلاً ميكروتك محدد).'));
		o.depends('mode', 'sta');
		o.datatype = 'macaddr';
		o.modalonly = true;

		o = s.option(form.Value, 'mesh_id', _('Mesh ID'));
		o.depends('mode', 'mesh');
		o.default = 'quick-mesh';

		o = s.option(form.Flag, 'mesh_fwding', _('تمرير الحزم بين عقد الميش'));
		o.depends('mode', 'mesh');
		o.default = o.enabled;
		o.modalonly = true;

		o = s.option(form.ListValue, 'encryption', _('حماية الشبكة'),
			_('الميش يدعم SAE (WPA3) فقط. WPA3 قد لا تدعمه الأجهزة القديمة، اختر المختلط لها.'));
		o.value('none', _('بدون حماية'));
		o.value('psk2+ccmp', 'WPA2-PSK (AES)');
		o.value('psk-mixed+ccmp', 'WPA/WPA2 مختلط');
		o.value('sae', 'WPA3-SAE');
		o.value('sae-mixed', 'WPA2/WPA3 مختلط');
		o.default = 'psk2+ccmp';

		o = s.option(form.Value, 'key', _('كلمة السر'), _('من 8 إلى 63 حرف.'));
		o.password = true;
		o.datatype = 'wpakey';
		[ 'psk2+ccmp', 'psk-mixed+ccmp', 'sae', 'sae-mixed' ].forEach(function (e) { o.depends('encryption', e); });

		o = s.option(form.Value, 'network', _('ربط الشبكة بواجهة'), _('مثال: lan أو wwan (للعميل) أو guest أو vlan20.'));
		o.default = 'lan';
		o.rmempty = false;

		o = s.option(form.ListValue, 'ieee80211w', _('حماية الإطارات (802.11w)'));
		o.value('', _('افتراضي'));
		o.value('0', _('معطّل'));
		o.value('1', _('اختياري'));
		o.value('2', _('إجباري'));
		o.modalonly = true;

		o = s.option(form.Flag, 'wds', _('WDS / 4addr (للربط الشفاف مع ميكروتك)'),
			_('يفعّل وضع 4 عناوين. يجب تفعيله على الطرفين (AP على ميكروتك بوضع WDS مقابل Client هنا).'));
		o.depends('mode', 'ap');
		o.depends('mode', 'sta');

		o = s.option(form.Flag, 'hidden', _('إخفاء اسم الشبكة'));
		o.depends('mode', 'ap');
		o.modalonly = true;

		o = s.option(form.Flag, 'disabled', _('تعطيل هذه الشبكة'));

		/* =============== أوضاع الشبكة وطرق الربط =============== */
		m = new form.Map('network', _('أوضاع الشبكة وطرق الربط'),
			_('غيّر وضع الراوتر وعدّل واجهات الربط (WAN و Client و Relay) حسب طريقة اتصالك بالميكروتك.'));
		maps.push(m);

		/* وضع الراوتر: راوتر عادي أو نقطة وصول (DHCP متوقف) */
		s = m.section(form.NamedSection, 'lan', 'interface', _('الشبكة المحلية (LAN)'));
		s.addremove = false;

		o = s.option(form.ListValue, 'proto', _('طريقة العنوان'));
		o.value('static', _('ثابت'));
		o.value('dhcp', _('DHCP (يأخذ عنوان من ميكروتك)'));
		o.default = 'static';

		o = s.option(form.Value, 'ipaddr', _('عنوان IP'));
		o.datatype = 'ip4addr';
		o.depends('proto', 'static');

		o = s.option(form.Value, 'netmask', _('القناع'));
		o.datatype = 'ip4addr';
		o.value('255.255.255.0');
		o.value('255.255.0.0');
		o.depends('proto', 'static');

		o = s.option(form.Value, 'gateway', _('البوابة'), _('عنوان الميكروتك إذا كان الراوتر خلفه.'));
		o.datatype = 'ip4addr';
		o.depends('proto', 'static');

		o = s.option(form.DynamicList, 'dns', _('خوادم DNS'));
		o.datatype = 'ip4addr';
		o.depends('proto', 'static');

		/* وضع DHCP على lan */
		var md = new form.Map('dhcp', _('وضع الراوتر'),
			_('راوتر: يوزّع العناوين ويعمل NAT. نقطة وصول (AP/Bridge): يوقف توزيع DHCP ويترك الميكروتك يوزّع.'));
		maps.push(md);

		s = md.section(form.NamedSection, 'lan', 'dhcp', _('توزيع العناوين على LAN'));
		s.addremove = false;

		o = s.option(form.ListValue, 'netmode', _('الوضع'));
		o.value('router', _('راوتر (DHCP شغّال)'));
		o.value('ap', _('نقطة وصول / Bridge (DHCP متوقف)'));
		o.cfgvalue = function (sid) { return uci.get('dhcp', sid, 'ignore') == '1' ? 'ap' : 'router'; };
		o.write = function (sid, v) { if (v == 'ap') uci.set('dhcp', sid, 'ignore', '1'); else uci.unset('dhcp', sid, 'ignore'); };
		o.remove = function () {};
		o.rmempty = false;

		o = s.option(form.Value, 'start', _('بداية العناوين'));
		o.datatype = 'uinteger';
		o.depends('netmode', 'router');

		o = s.option(form.Value, 'limit', _('عدد العناوين'));
		o.datatype = 'uinteger';
		o.depends('netmode', 'router');

		o = s.option(form.Value, 'leasetime', _('مدة التأجير'), _('مثال: 12h أو 1d'));
		o.depends('netmode', 'router');

		/* واجهات الربط: WAN / wwan / relay ... */
		m = new form.Map('network', _('واجهات الربط'),
			_('أضف أو عدّل واجهة الربط: DHCP أو ثابت أو PPPoE (مع خادم PPPoE في الميكروتك) أو Relay (جسر شبه شفاف مع ميكروتك عبر واي فاي).'));
		maps.push(m);

		s = m.section(form.GridSection, 'interface', _('الواجهات'));
		s.anonymous = false;
		s.addremove = true;
		s.sortable = false;
		s.filter = function (sid) {
			var p = uci.get('network', sid, 'proto');
			return sid != 'loopback' && sid != 'lan' && p != 'wireguard' && sid != 'globals';
		};

		o = s.option(form.ListValue, 'proto', _('الطريقة'));
		o.value('dhcp', _('DHCP عميل'));
		o.value('static', _('عنوان ثابت'));
		o.value('pppoe', _('PPPoE'));
		o.value('relay', _('Relay (جسر مع ميكروتك)'));
		o.value('none', _('بدون'));
		o.default = 'dhcp';

		o = s.option(form.Value, 'device', _('الجهاز'), _('مثل wan أو eth1 أو br-lan.10 (VLAN). اتركه فاضي للواي فاي العميل (يربطه wifi-iface بالاسم).'));
		o.modalonly = true;

		o = s.option(form.Value, 'ipaddr', _('IP'));
		o.datatype = 'ip4addr';
		o.depends('proto', 'static');
		o.depends('proto', 'relay');

		o = s.option(form.Value, 'netmask', _('القناع'));
		o.datatype = 'ip4addr';
		o.value('255.255.255.0');
		o.depends('proto', 'static');
		o.modalonly = true;

		o = s.option(form.Value, 'gateway', _('البوابة'));
		o.datatype = 'ip4addr';
		o.depends('proto', 'static');
		o.modalonly = true;

		o = s.option(form.DynamicList, 'dns', _('DNS'));
		o.datatype = 'ip4addr';
		o.depends('proto', 'static');
		o.depends('proto', 'dhcp');
		o.modalonly = true;

		o = s.option(form.Value, 'username', _('اسم مستخدم PPPoE'));
		o.depends('proto', 'pppoe');
		o.modalonly = true;

		o = s.option(form.Value, 'password', _('كلمة سر PPPoE'));
		o.password = true;
		o.depends('proto', 'pppoe');
		o.modalonly = true;

		o = s.option(form.DynamicList, 'network', _('الشبكات المربوطة (Relay)'), _('اكتب lan ثم wwan.'));
		o.depends('proto', 'relay');
		o.modalonly = true;

		o = s.option(form.Value, 'mtu', _('MTU'));
		o.datatype = 'range(576,9200)';
		o.modalonly = true;

		o = s.option(form.Value, 'metric', _('Metric'));
		o.datatype = 'uinteger';
		o.modalonly = true;

		o = s.option(form.Flag, 'peerdns', _('استخدم DNS القادم من الطرف الآخر'));
		o.default = o.enabled;
		o.depends('proto', 'dhcp');
		o.depends('proto', 'pppoe');
		o.modalonly = true;

		/* =============== VLAN =============== */
		m = new form.Map('network', _('VLAN'),
			_('تعريف VLAN على الجسر (أجهزة DSA، وهي أغلب الراوترات الحديثة). :t = tagged ، :u* = untagged مع PVID. مثال لمنفذ يوصل الميكروتك كـ trunk: lan4:t'));
		maps.push(m);

		s = m.section(form.TypedSection, 'bridge-vlan', _('جدول VLAN'));
		s.anonymous = true;
		s.addremove = true;

		o = s.option(form.Value, 'device', _('الجسر'));
		o.default = 'br-lan';
		o.datatype = 'netdevname';

		o = s.option(form.Value, 'vlan', _('رقم VLAN'));
		o.datatype = 'range(1,4094)';
		o.rmempty = false;

		o = s.option(form.Flag, 'local', _('وصول محلي للراوتر'), _('يسمح للراوتر نفسه بالتعامل مع هذا الـ VLAN.'));
		o.default = o.enabled;

		o = s.option(form.DynamicList, 'ports', _('المنافذ'));
		o.placeholder = 'lan1:t';

		/* ============== دليل الميكروتك ============== */
		var guide = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('طرق الربط على الميكروتك')),
			E('ul', {}, [
				E('li', {}, [ E('b', {}, 'WDS: '), _('على ميكروتك اجعل الواي فاي AP-bridge مع WDS مفعّل، وهنا وضع Client مع تفعيل WDS/4addr وربط الشبكة بـ lan.') ]),
				E('li', {}, [ E('b', {}, 'Client + Relay: '), _('أنشئ واجهة wwan (DHCP)، اربط الواي فاي Client بها، ثم أضف واجهة Relay تجمع lan و wwan.') ]),
				E('li', {}, [ E('b', {}, 'VLAN Trunk: '), _('على الكيبل بين الراوترين: عرّف VLAN على الجسر ومنفذ الميكروتك بـ :t، وأنشئ VLAN بنفس الرقم على bridge الميكروتك.') ]),
				E('li', {}, [ E('b', {}, 'WAN من ميكروتك: '), _('واجهة wan بـ DHCP (الأسهل) أو عنوان ثابت أو PPPoE إذا فعّلت PPPoE Server على الميكروتك.') ]),
				E('li', {}, [ E('b', {}, 'Mesh 802.11s: '), _('يعمل بين أجهزة OpenWrt. ميكروتك RouterOS لا يدعم 802.11s، فاستخدم WDS أو Client للربط معه.') ])
			])
		]);

		var txCard = this.renderTxPowerCard(data[3]);
		var analyzer = this.renderAnalyzer(data[3]);
		return Promise.all(maps.map(function (x) { return x.render(); })).then(function (nodes) {
			return E('div', {}, [ txCard, analyzer, guide ].concat(nodes));
		});
	}
});
