'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require quick.util as util';

/* جدول تشغيل وإيقاف الواي فاي تلقائياً + تحكم فوري بتشغيل/إيقاف الراديو */

var callWifiStatus = rpc.declare({ object: 'network.wireless', method: 'status' });

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('quick'),
			uci.load('wireless'),
			L.resolveDefault(callWifiStatus(), {})
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	render: function (data) {
		var wstatus = data[2] || {};
		var radios = Object.keys(wstatus);

		var stateGrid = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.7em;margin-bottom:.8em' });
		radios.forEach(function (r) {
			var info = wstatus[r] || {}, cfg = info.config || {};
			var band = ({ '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' })[cfg.band] || cfg.band || '';
			var isUp = !!info.up && !info.disabled;
			stateGrid.appendChild(E('div', { 'class': 'cbi-section', 'style': 'padding:.7em .9em;margin:0' }, [
				E('div', { 'style': 'opacity:.75;font-size:.85em' }, r + (band ? ' · ' + band : '')),
				E('div', { 'style': 'font-size:1.25em;font-weight:700;color:' + (isUp ? '#34d399' : '#fb7185') }, isUp ? _('شغّال (ON) ✓') : _('متوقف (OFF) ✗'))
			]));
		});

		function toggleBtn(label, act, cls) {
			var b = E('button', { 'class': 'cbi-button ' + cls, 'type': 'button' }, label);
			b.addEventListener('click', function (ev) {
				ev.preventDefault();
				b.disabled = true;
				util.ctl([ 'wifi-toggle', act, 'all' ]).then(function (r) {
					b.disabled = false;
					if (r && r.ok) {
						ui.addNotification(null, E('p', act === 'on' ? _('تم تشغيل الواي فاي بنجاح ✓') : _('تم إيقاف الواي فاي بنجاح.')), 'info');
						setTimeout(function () { location.reload(); }, 1500);
					}
				});
			});
			return b;
		}

		var liveCard = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('الحالة الفورية للواي فاي والتحكم اليدوي')),
			stateGrid,
			E('div', { 'style': 'display:flex;gap:.6em;flex-wrap:wrap' }, [
				toggleBtn(_('تشغيل كل الواي فاي الآن'), 'on', 'cbi-button-positive'),
				toggleBtn(_('إيقاف كل الواي فاي الآن'), 'off', 'cbi-button-negative')
			])
		]);

		var m = new form.Map('quick', _('جدول تشغيل وإيقاف WiFi التلقائي'),
			_('حدد وقت إطفاء الواي فاي ليلاً ووقت إعادة تشغيله صباحاً تلقائياً. تأكد أن ساعة الراوتر مضبوطة من صفحة «ضبط الوقت والتاريخ».'));
		var s = m.section(form.NamedSection, 'wifisched', 'wifisched', _('إعدادات الجدول'));
		s.addremove = false;

		var o = s.option(form.Flag, 'enabled', _('تفعيل جدول تشغيل WiFi'));
		o.default = o.disabled;

		o = s.option(form.ListValue, 'target', _('الراديو المستهدف'));
		o.value('all', _('كل شبكات الواي فاي (2.4GHz + 5GHz)'));
		radios.forEach(function (r) {
			var band = (wstatus[r] && wstatus[r].config && wstatus[r].config.band) || '';
			o.value(r, r + (band ? ' (' + band + ')' : ''));
		});
		o.default = 'all';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'off_hour', _('ساعة الإطفاء (OFF)'));
		for (var h = 0; h < 24; h++) o.value(String(h), (h < 10 ? '0' : '') + h);
		o.default = '2';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'off_min', _('دقيقة الإطفاء'));
		[ '0', '15', '30', '45' ].forEach(function (mn) { o.value(mn, (mn.length === 1 ? '0' : '') + mn); });
		o.default = '0';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'on_hour', _('ساعة التشغيل (ON)'));
		for (var h2 = 0; h2 < 24; h2++) o.value(String(h2), (h2 < 10 ? '0' : '') + h2);
		o.default = '7';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'on_min', _('دقيقة التشغيل'));
		[ '0', '15', '30', '45' ].forEach(function (mn) { o.value(mn, (mn.length === 1 ? '0' : '') + mn); });
		o.default = '0';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'days', _('أيام التطبيق'));
		o.value('*', _('كل أيام الأسبوع'));
		o.value('0-4', _('الأحد إلى الخميس (أيام الدوام)'));
		o.value('5,6', _('الجمعة والسبت (عطلة نهاية الأسبوع)'));
		o.default = '*';
		o.depends('enabled', '1');

		return m.render().then(function (node) {
			return E('div', {}, [
				E('h2', {}, _('جدول تشغيل WiFi')),
				liveCard,
				node
			]);
		});
	}
});
