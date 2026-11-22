'use strict';
'require view';
'require form';
'require uci';
'require poll';
'require dom';
'require ui';
'require quick.util as util';

/* القسم 2: قياس السرعة والحظر
   قياس السرعة، فحص البينج، استهلاك وسرعة كل مستخدم، تحديد السرعة والكمية، حظر المواقع بالرابط */

var prev = {};

return view.extend({
	load: function () {
		return Promise.all([ uci.load('quick'), util.ctl([ 'clients' ]) ]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	/* ------------------------------------------------ قياس السرعة ---- */
	renderSpeed: function () {
		var out = E('div', { 'class': 'qs-big', 'style': 'font-size:2.6em;font-weight:700;margin:.2em 0' }, '— Mbps');
		var meta = E('div', { 'style': 'opacity:.75' }, _('اضغط ابدأ لقياس سرعة التنزيل الحالية للراوتر.'));
		var btn = E('button', { 'class': 'cbi-button cbi-button-action important' }, _('ابدأ قياس السرعة'));

		btn.addEventListener('click', function (ev) {
			ev.preventDefault();
			btn.disabled = true;
			out.textContent = '…';
			meta.textContent = _('جاري التحميل من رابط الاختبار، لا تغلق الصفحة.');
			util.ctl([ 'speed' ]).then(function (r) {
				btn.disabled = false;
				if (r.error || !r.ok) {
					out.textContent = '— Mbps';
					meta.textContent = _('فشل القياس: ') + (r.error || _('ما وصلت بيانات. تأكد من الإنترنت ومن رابط الاختبار في الإعدادات.'));
					return;
				}
				out.textContent = r.mbps + ' Mbps';
				meta.textContent = util.fmtBytes(r.bytes) + ' ' + _('خلال') + ' ' + r.seconds + ' ' + _('ثانية (تنزيل). الرقم يقل عن سرعة الخط إذا كان معالج الراوتر هو عنق الزجاجة.');
			});
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('قياس سرعة الإنترنت')), out, meta, E('div', { 'style': 'margin-top:.6em' }, btn)
		]);
	},

	/* ------------------------------------------------------ البينج ---- */
	renderPing: function () {
		var host = E('input', { 'class': 'cbi-input-text', 'list': 'qs-ping-hosts', 'value': '1.1.1.1', 'style': 'max-width:16em' });
		var dl = E('datalist', { 'id': 'qs-ping-hosts' }, [ '1.1.1.1', '8.8.8.8', '9.9.9.9', 'google.com' ].map(function (h) { return E('option', { 'value': h }); }));
		var count = E('select', { 'class': 'cbi-input-select', 'style': 'width:auto' },
			[ 4, 8, 12, 20 ].map(function (n) { return E('option', { 'value': n }, n + ' ' + _('حزمة')); }));
		var btn = E('button', { 'class': 'cbi-button cbi-button-action' }, _('فحص البينج'));
		var tbody = E('tbody');
		var table = E('table', { 'class': 'table' }, [
			E('thead', {}, E('tr', { 'class': 'tr table-titles' },
				[ _('الخادم'), _('مرسلة'), _('مستلمة'), _('فقد'), _('أقل'), _('متوسط'), _('أعلى') ].map(function (t) { return E('th', { 'class': 'th' }, t); }))),
			tbody
		]);

		function run(h, n) {
			return util.ctl([ 'ping', h, String(n) ]).then(function (r) {
				var cells = r.error
					? [ h, { colspan: 6, text: r.error } ]
					: [ r.host, r.sent, r.received, r.loss + '%', r.min == null ? '—' : r.min + ' ms', r.avg == null ? '—' : r.avg + ' ms', r.max == null ? '—' : r.max + ' ms' ];
				var tr = E('tr', { 'class': 'tr' });
				cells.forEach(function (c) {
					if (c && typeof c === 'object') tr.appendChild(E('td', { 'class': 'td', 'colspan': c.colspan }, c.text));
					else tr.appendChild(E('td', { 'class': 'td' }, String(c)));
				});
				tbody.insertBefore(tr, tbody.firstChild);
			});
		}

		btn.addEventListener('click', function (ev) {
			ev.preventDefault();
			btn.disabled = true;
			run(host.value.trim(), count.value).then(function () { btn.disabled = false; });
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('فحص البينج')),
			E('div', { 'style': 'display:flex;gap:.5em;flex-wrap:wrap;align-items:center' }, [ host, dl, count, btn ]),
			E('div', { 'style': 'margin-top:.6em;overflow:auto' }, table)
		]);
	},

	/* -------------------------------- المستخدمون: استهلاك وسرعة ---- */
	renderClients: function (initial) {
		var tbody = E('tbody');
		var table = E('table', { 'class': 'table' }, [
			E('thead', {}, E('tr', { 'class': 'tr table-titles' },
				[ _('الجهاز'), 'IP', 'MAC', '↓ ' + _('الآن'), '↑ ' + _('الآن'), '↓ ' + _('الإجمالي'), '↑ ' + _('الإجمالي'), _('الحالة'), '' ].map(function (t) { return E('th', { 'class': 'th' }, t); }))),
			tbody
		]);

		function limitIt(c) {
			return uci.load('quick').then(function () {
				var sid = uci.add('quick', 'limit');
				uci.set('quick', sid, 'name', c.name || c.mac);
				uci.set('quick', sid, 'ip', c.ip);
				uci.set('quick', sid, 'down_kbps', '0');
				uci.set('quick', sid, 'up_kbps', '0');
				uci.set('quick', sid, 'quota_mb', '0');
				uci.set('quick', sid, 'enabled', '1');
				return uci.save();
			}).then(function () { location.reload(); });
		}

		function update(data) {
			if (!data || data.error) return;
			var now = Date.now() / 1000, rows = [];
			(data.clients || []).forEach(function (c) {
				var p = prev[c.ip], dn = 0, up = 0;
				if (p && now > p.t) { dn = Math.max(0, (c.down - p.down) / (now - p.t)); up = Math.max(0, (c.up - p.up) / (now - p.t)); }
				prev[c.ip] = { t: now, up: c.up, down: c.down };

				var act = E('button', { 'class': 'cbi-button cbi-button-neutral' }, c.limited ? _('محدّد') : _('تحديد'));
				act.disabled = !!c.limited;
				act.addEventListener('click', function (ev) { ev.preventDefault(); limitIt(c); });

				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, c.name || '—'),
					E('td', { 'class': 'td' }, c.ip),
					E('td', { 'class': 'td' }, c.mac),
					E('td', { 'class': 'td' }, util.fmtRate(dn)),
					E('td', { 'class': 'td' }, util.fmtRate(up)),
					E('td', { 'class': 'td' }, util.fmtBytes(c.down)),
					E('td', { 'class': 'td' }, util.fmtBytes(c.up)),
					E('td', { 'class': 'td' }, c.limited ? '🔒 ' + _('عليه حد') : '—'),
					E('td', { 'class': 'td' }, act)
				]));
			});
			if (!rows.length) rows.push(E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 9 }, _('ما فيه أجهزة متصلة حالياً.'))));
			dom.content(tbody, rows);
		}

		update(initial);
		poll.add(function () { return util.ctl([ 'clients' ]).then(update); }, 3);

		var reset = E('button', { 'class': 'cbi-button cbi-button-negative' }, _('تصفير العدّادات'));
		reset.addEventListener('click', function (ev) {
			ev.preventDefault();
			prev = {};
			util.ctl([ 'usage-reset' ]).then(function () { ui.addNotification(null, E('p', _('تم تصفير عدّادات الاستهلاك.')), 'info'); });
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('قياس السرعة والاستهلاك لكل مستخدم')),
			E('p', { 'class': 'cbi-section-descr' }, _('تتحدث الأرقام كل 3 ثواني. العدّاد يحسب منذ آخر تفعيل أو تصفير. يحتاج nftables (fw4) ويتعطل مع flow offloading.')),
			E('div', { 'style': 'overflow:auto' }, table),
			E('div', { 'style': 'margin-top:.6em' }, reset)
		]);
	},

	render: function (data) {
		var clients = (data[1] && data[1].clients) || [];
		var m, s, o, maps = [];

		/* ---------------- حدود السرعة والكمية ---------------- */
		m = new form.Map('quick', _('تحديد السرعة والكمية'),
			_('حدّد سرعة التنزيل والرفع (كيلوبت/ثانية) وكمية الاستهلاك (ميغابايت) لكل جهاز. الصفر = بدون حد. عند الوصول للكمية ينقطع الجهاز عن الإنترنت حتى تصفير العدّاد أو إعادة التفعيل. ثبّت عنوان الجهاز من «الحماية من السرقة» حتى لا يتغير IP.'));
		maps.push(m);

		s = m.section(form.GridSection, 'limit', _('الحدود'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = false;

		o = s.option(form.Value, 'name', _('الاسم'));
		o.rmempty = true;

		o = s.option(form.Value, 'ip', _('عنوان الجهاز (IP)'));
		o.datatype = 'ip4addr';
		o.rmempty = false;
		clients.forEach(function (c) { o.value(c.ip, c.ip + (c.name ? ' (' + c.name + ')' : '')); });

		o = s.option(form.Value, 'down_kbps', _('تنزيل (Kbps)'));
		o.datatype = 'uinteger';
		o.default = '0';

		o = s.option(form.Value, 'up_kbps', _('رفع (Kbps)'));
		o.datatype = 'uinteger';
		o.default = '0';

		o = s.option(form.Value, 'quota_mb', _('الكمية (MB)'));
		o.datatype = 'uinteger';
		o.default = '0';

		o = s.option(form.Flag, 'enabled', _('مفعّل'));
		o.default = o.enabled;
		o.editable = true;

		/* ---------------- حظر المواقع ---------------- */
		m = new form.Map('quick', _('حظر المواقع'),
			_('الصق رابط الموقع وسيُحظر الدومين كاملاً وما تحته (مثال: الصق https://www.example.com/page فيُحظر example.com). الحظر يتم عبر DNS الراوتر.'));
		maps.push(m);

		s = m.section(form.GridSection, 'block', _('المواقع المحظورة'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = false;

		o = s.option(form.Value, 'url', _('الرابط أو الدومين'));
		o.rmempty = false;
		o.validate = function (sid, v) {
			if (!v) return _('اكتب رابط الموقع');
			return /^[A-Za-z0-9._~:\/?#@!$&'()*+,;=%-]+$/.test(v) ? true : _('رابط غير صالح');
		};

		o = s.option(form.Value, 'comment', _('ملاحظة'));
		o.rmempty = true;

		o = s.option(form.Flag, 'enabled', _('مفعّل'));
		o.default = o.enabled;
		o.editable = true;

		/* ---------------- إعدادات القسم ---------------- */
		m = new form.Map('quick', _('إعدادات القياس والحظر'));
		maps.push(m);

		s = m.section(form.NamedSection, 'main', 'main');

		o = s.option(form.Value, 'speed_url', _('رابط اختبار السرعة'), _('ملف كبير يُحمَّل لقياس سرعة التنزيل (http أو https).'));
		o.rmempty = false;
		o.validate = function (sid, v) { return /^https?:\/\/\S+$/.test(v) ? true : _('رابط غير صالح'); };

		o = s.option(form.Value, 'speed_secs', _('مدة القياس (ثواني)'), _('من 2 إلى 15.'));
		o.datatype = 'range(2,15)';

		o = s.option(form.Flag, 'force_dns', _('إجبار كل الأجهزة على DNS الراوتر'), _('يمنع تجاوز حظر المواقع بتغيير DNS في الجهاز.'));
		o = s.option(form.Flag, 'block_dot', _('حظر DNS-over-TLS (المنفذ 853)'), _('يمنع التحايل على الحظر عبر DNS مشفّر. DoH على 443 لا يمكن حظره بهذه الطريقة.'));
		o = s.option(form.Flag, 'offload_auto', _('تعطيل flow offloading تلقائياً عند وجود حدود'),
			_('بدونه تتجاوز الاتصالات المفتوحة الحدود والعدّاد. تعطيله قد يقلل أقصى سرعة للراوتر.'));
		o.default = o.enabled;

		return Promise.all(maps.map(function (x) { return x.render(); })).then(L.bind(function (nodes) {
			return E('div', {}, [
				E('h2', {}, _('قياس السرعة والحظر')),
				this.renderSpeed(),
				this.renderPing(),
				this.renderClients(data[1])
			].concat(nodes));
		}, this));
	}
});
