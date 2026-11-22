'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require poll';
'require quick.util as util';

/* ضبط الوقت والتاريخ: ساعة الراوتر الحية + مزامنة بضغطة مع المتصفح أو NTP + المنطقة الزمنية */

var TIMEZONES = [
	[ 'Asia/Aden',    'AST-3',  'اليمن — صنعاء / عدن (UTC+3)' ],
	[ 'Asia/Riyadh',  'AST-3',  'السعودية — الرياض (UTC+3)' ],
	[ 'Asia/Dubai',   'GST-4',  'الإمارات — دبي (UTC+4)' ],
	[ 'Asia/Kuwait',  'AST-3',  'الكويت (UTC+3)' ],
	[ 'Asia/Qatar',   'AST-3',  'قطر — الدوحة (UTC+3)' ],
	[ 'Asia/Baghdad', 'AST-3',  'العراق — بغداد (UTC+3)' ],
	[ 'Asia/Amman',   'EET-2EEST,M3.5.4/24,M10.5.5/1', 'الأردن — عمّان' ],
	[ 'Africa/Cairo', 'EET-2',  'مصر — القاهرة (UTC+2)' ],
	[ 'UTC',          'UTC0',   'التوقيت العالمي (UTC)' ]
];

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('system'),
			util.ctl([ 'time-info' ])
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	render: function (data) {
		var tinfo = data[1] || {};
		var routerClock = E('div', { 'style': 'font-size:1.5em;font-weight:700;direction:ltr;display:inline-block' }, tinfo.formatted || '—');
		var browserClock = E('div', { 'style': 'font-size:1.5em;font-weight:700;direction:ltr;display:inline-block;opacity:.85' }, new Date().toLocaleString('sv-SE'));
		var msg = E('div', { 'style': 'margin-top:.6em' });

		poll.add(function () {
			browserClock.textContent = new Date().toLocaleString('sv-SE');
			return util.ctl([ 'time-info' ]).then(function (r) {
				if (r && r.formatted) routerClock.textContent = r.formatted;
			});
		}, 3);

		var syncBrowserBtn = E('button', { 'class': 'cbi-button cbi-button-action important', 'type': 'button' }, _('مزامنة مع وقت المتصفح الآن'));
		syncBrowserBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			syncBrowserBtn.disabled = true;
			var epoch = Math.floor(Date.now() / 1000);
			util.ctl([ 'set-time', String(epoch) ]).then(function (r) {
				syncBrowserBtn.disabled = false;
				if (r && r.formatted) {
					routerClock.textContent = r.formatted;
					msg.innerHTML = '';
					msg.appendChild(util.note(_('تم ضبط ساعة الراوتر على وقت جهازك بنجاح ✓'), 'success'));
				}
			});
		});

		var syncNtpBtn = E('button', { 'class': 'cbi-button cbi-button-positive', 'type': 'button' }, _('مزامنة فورية عبر الإنترنت (NTP)'));
		syncNtpBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			syncNtpBtn.disabled = true;
			msg.innerHTML = '';
			msg.appendChild(util.note(_('جارٍ الاتصال بخادم الوقت NTP...'), 'info'));
			util.ctl([ 'ntp-sync' ]).then(function (r) {
				syncNtpBtn.disabled = false;
				msg.innerHTML = '';
				if (r && r.formatted) {
					routerClock.textContent = r.formatted;
					msg.appendChild(util.note(_('تم تحديث الوقت عبر NTP: ') + r.formatted, 'success'));
				} else {
					msg.appendChild(util.note(_('تعذرت المزامنة عبر NTP — تأكد من اتصال الإنترنت.'), 'warning'));
				}
			});
		});

		var clockCard = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('ساعة الراوتر الحالية والمزامنة الفورية')),
			E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8em;margin-bottom:.9em' }, [
				E('div', { 'class': 'cbi-section', 'style': 'padding:.7em .9em;margin:0' }, [
					E('div', { 'style': 'opacity:.7;font-size:.85em' }, _('وقت الراوتر الحالي')),
					routerClock
				]),
				E('div', { 'class': 'cbi-section', 'style': 'padding:.7em .9em;margin:0' }, [
					E('div', { 'style': 'opacity:.7;font-size:.85em' }, _('وقت جهازك (المتصفح)')),
					browserClock
				])
			]),
			E('div', { 'style': 'display:flex;gap:.6em;flex-wrap:wrap' }, [ syncBrowserBtn, syncNtpBtn ]),
			msg
		]);

		var m = new form.Map('system', _('المنطقة الزمنية وخوادم الوقت (NTP)'));
		var s = m.section(form.TypedSection, 'system', _('المنطقة الزمنية'));
		s.anonymous = true;
		s.addremove = false;

		var o = s.option(form.ListValue, 'zonename', _('المنطقة الزمنية'));
		TIMEZONES.forEach(function (tz) { o.value(tz[0], tz[2]); });
		o.write = function (sid, val) {
			uci.set('system', sid, 'zonename', val);
			TIMEZONES.forEach(function (tz) {
				if (tz[0] === val) uci.set('system', sid, 'timezone', tz[1]);
			});
		};

		var s2 = m.section(form.NamedSection, 'ntp', 'timeserver', _('خوادم المزامنة التلقائية (NTP)'));
		s2.addremove = false;
		o = s2.option(form.Flag, 'enabled', _('تفعيل عميل NTP تلقائياً'));
		o.default = o.enabled;
		o = s2.option(form.Flag, 'enable_server', _('تفعيل الراوتر كخادم NTP للشبكة المحلية'));
		o = s2.option(form.DynamicList, 'server', _('خوادم NTP'));
		o.placeholder = '0.openwrt.pool.ntp.org';

		return m.render().then(function (node) {
			return E('div', {}, [
				E('h2', {}, _('ضبط الوقت والتاريخ')),
				clockCard,
				node
			]);
		});
	}
});
