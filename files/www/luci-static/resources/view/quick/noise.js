'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require dom';
'require quick.util as util';

/* معالج التشويش: قياس الضوضاء الحقيقية لكل راديو + قوالب جاهزة لمعالجة التشويش + ضبط RTS/Frag/Distance/Cell Density */

var callWifiStatus = rpc.declare({ object: 'network.wireless', method: 'status' });
var callInfo = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ] });

var PRESETS = {
	calm:   { name: 'بيئة هادئة (قياسي)',          rts: '',     frag: '',     beacon_int: '100', distance: '',    cell_density: '0', htmode2: 'HT20', noscan: '0' },
	medium: { name: 'تشويش متوسط (أحياء سكنية)',   rts: '1000', frag: '2346', beacon_int: '100', distance: '150', cell_density: '2', htmode2: 'HT20', noscan: '0' },
	heavy:  { name: 'تشويش عالي جداً (أبراج ومناطق مزدحمة)', rts: '500', frag: '1500', beacon_int: '150', distance: '300', cell_density: '3', htmode2: 'HT20', noscan: '0' }
};

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('wireless'),
			L.resolveDefault(callWifiStatus(), {})
		]).then(function (res) {
			var status = res[1] || {};
			var radios = Object.keys(status);
			var jobs = radios.map(function (r) {
				var ifs = (status[r] && status[r].interfaces || []).filter(function (i) { return i.ifname; });
				return ifs.length ? L.resolveDefault(callInfo(ifs[0].ifname), {}) : Promise.resolve({});
			});
			return Promise.all(jobs).then(function (infos) {
				return { status: status, radios: radios, infos: infos };
			});
		});
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	applyPreset: function (key, radios) {
		var p = PRESETS[key];
		if (!p) return;
		radios.forEach(function (r) {
			var band = uci.get('wireless', r, 'band');
			if (p.rts) uci.set('wireless', r, 'rts', p.rts); else uci.unset('wireless', r, 'rts');
			if (p.frag) uci.set('wireless', r, 'frag', p.frag); else uci.unset('wireless', r, 'frag');
			if (p.beacon_int) uci.set('wireless', r, 'beacon_int', p.beacon_int);
			if (p.distance) uci.set('wireless', r, 'distance', p.distance); else uci.unset('wireless', r, 'distance');
			uci.set('wireless', r, 'cell_density', p.cell_density);
			if (band === '2g') uci.set('wireless', r, 'htmode', p.htmode2);
		});
		uci.save().then(function () {
			ui.addNotification(null, E('p', _('تم تجهيز قالب: ') + p.name + _(' — اضغط «حفظ وتطبيق» في الأسفل لتفعيله على الراوتر.')), 'info');
			setTimeout(function () { location.reload(); }, 1000);
		});
	},

	renderDiag: function (ctx) {
		var grid = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8em;margin-bottom:.8em' });

		ctx.radios.forEach(function (r, idx) {
			var info = ctx.infos[idx] || {};
			var cfg = (ctx.status[r] && ctx.status[r].config) || {};
			var band = ({ '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' })[cfg.band] || cfg.band || '';
			var noise = (info.noise != null) ? info.noise : -95;
			var quality = noise <= -92 ? _('ممتاز (تشويش منخفض)') : (noise <= -85 ? _('متوسط') : _('مرتفع (يحتاج معالجة)'));
			var qcol = noise <= -92 ? '#34d399' : (noise <= -85 ? '#fbbf24' : '#fb7185');

			grid.appendChild(E('div', { 'class': 'cbi-section', 'style': 'padding:.8em 1em;margin:0' }, [
				E('div', { 'style': 'font-weight:700;margin-bottom:.4em' }, r + (band ? ' · ' + band : '')),
				E('div', { 'style': 'font-size:.9em;opacity:.85;line-height:1.8' }, [
					E('div', {}, _('القناة الحالية: ') + (info.channel || cfg.channel || 'auto') + ' (' + (cfg.htmode || '20MHz') + ')'),
					E('div', { 'style': 'color:' + qcol + ';font-weight:700' }, _('الضوضاء: ') + noise + ' dBm — ' + quality),
					E('div', {}, _('القدرة الفعلية: ') + (info.txpower != null ? info.txpower + ' dBm' : '—'))
				])
			]));
		});

		var self = this;
		var btns = E('div', { 'style': 'display:flex;gap:.6em;flex-wrap:wrap;margin-top:.6em' }, [
			E('button', { 'class': 'cbi-button cbi-button-positive', 'type': 'button', click: function () { self.applyPreset('calm', ctx.radios); } }, _('قالب: بيئة هادئة')),
			E('button', { 'class': 'cbi-button cbi-button-action', 'type': 'button', click: function () { self.applyPreset('medium', ctx.radios); } }, _('قالب: تشويش متوسط')),
			E('button', { 'class': 'cbi-button cbi-button-negative', 'type': 'button', click: function () { self.applyPreset('heavy', ctx.radios); } }, _('قالب: تشويش عالي جداً'))
		]);

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('فحص التشويش والقوالب الذكية الجاهزة')),
			E('p', { 'class': 'cbi-section-descr' }, _('اختر قالباً جاهزاً حسب مستوى الزحام حول جهاز ZTE E8822، أو عدّل القيم يدوياً بالأسفل.')),
			grid,
			btns
		]);
	},

	render: function (ctx) {
		var m, s, o;
		m = new form.Map('wireless', _('إعدادات معالجة التشويش المتقدمة'),
			_('تقليل عتبة RTS/CTS وتفعيل كثافة الخلايا (Cell Density) وضبط عرض القناة 20MHz يحسّن الثبات والبنق بشكل ملحوظ في المناطق المزدحمة.'));

		s = m.section(form.TypedSection, 'wifi-device', _('معالجة التشويش لكل راديو'));
		s.anonymous = false;

		o = s.option(form.ListValue, 'cell_density', _('مستوى كثافة الشبكات (Cell Density)'),
			_('يرفع الحد الأدنى لسرعة الإرسال ويقلل التداخل في الأماكن المزدحمة.'));
		o.value('0', _('عادي (0 - افتراضي)'));
		o.value('1', _('متوسط (1)'));
		o.value('2', _('عالي (2 - موصى به للأحياء)'));
		o.value('3', _('عالي جداً (3 - مناطق الأبراج المزدحمة)'));
		o.default = '0';

		o = s.option(form.Value, 'rts', _('عتبة RTS/CTS'),
			_('القيمة 500 إلى 1000 تقلل تصادم الحزم عند وجود تشويش عالي. اتركها فارغة للتلقائي (2347).'));
		o.datatype = 'range(256,2347)';
		o.placeholder = '2347';
		o.rmempty = true;

		o = s.option(form.Value, 'frag', _('عتبة التجزئة (Fragmentation)'),
			_('القيمة 1500 إلى 2346 تساعد في استقرار الإشارة عند التشويش الشديد.'));
		o.datatype = 'range(256,2346)';
		o.placeholder = '2346';
		o.rmempty = true;

		o = s.option(form.Value, 'beacon_int', _('فاصل الإشارة (Beacon Interval)'),
			_('الافتراضي 100ms. رفعه إلى 150ms يقلل استهلاك الهواء في المناطق المزدحمة.'));
		o.datatype = 'range(50,1000)';
		o.placeholder = '100';
		o.rmempty = true;

		o = s.option(form.Value, 'distance', _('تحسين المسافة (بالمتر)'),
			_('اضبطه حسب أبعد عميل متصل بالراوتر (مثلاً 100 أو 300 متر).'));
		o.datatype = 'range(0,20000)';
		o.placeholder = 'auto';
		o.rmempty = true;

		o = s.option(form.Value, 'htmode', _('عرض القناة (لمنع التداخل)'),
			_('على 2.4GHz يُنصح بـ HT20 دائماً عند وجود تشويش.'));
		[ 'HT20', 'HT40', 'VHT20', 'VHT40', 'VHT80' ].forEach(function (c) { o.value(c); });
		o.rmempty = true;

		return m.render().then(L.bind(function (node) {
			return E('div', {}, [
				E('h2', {}, _('معالج التشويش')),
				this.renderDiag(ctx),
				node
			]);
		}, this));
	}
});
