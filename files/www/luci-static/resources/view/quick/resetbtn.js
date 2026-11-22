'use strict';
'require view';
'require form';
'require uci';
'require quick.util as util';

/* إعدادات زر الفورمات (Reset Button): تفعيل طبيعي / إعادة تشغيل فقط / تعطيل كامل لمنع تصفير الزبون */

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('quick'),
			util.ctl([ 'resetbtn-status' ])
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	render: function (data) {
		var st = data[1] || {};
		var modeLabels = {
			normal: _('وضع طبيعي (إعادة تشغيل + فورمات عند الضغط المطوّل)'),
			reboot_only: _('إعادة تشغيل فقط (الفورمات محظور 🔒)'),
			disabled: _('معطّل بالكامل (لا يعمل الزر نهائياً 🔒)')
		};
		var col = st.mode === 'disabled' ? '#34d399' : (st.mode === 'reboot_only' ? '#fbbf24' : '#60a5fa');

		var statusCard = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('الحالة الحالية لزر الفورمات (Reset)')),
			E('div', { 'style': 'font-size:1.15em;font-weight:700;color:' + col + ';margin:.4em 0' }, modeLabels[st.mode] || st.mode || '—'),
			E('p', { 'class': 'cbi-section-descr' }, _('مهم جداً لأجهزة الزبائن: تعطيل زر الفورمات أو تحويله إلى «إعادة تشغيل فقط» يمنع الزبون من تصفير الراوتر وحذف إعداداتك وربط الشبكة.'))
		]);

		var m = new form.Map('quick', _('تخصيص سلوك زر الفورمات'));
		var s = m.section(form.NamedSection, 'resetbtn', 'resetbtn', _('إعدادات الزر الفيزيائي'));
		s.addremove = false;

		var o = s.option(form.ListValue, 'mode', _('وظيفة زر Reset'));
		o.value('normal', _('طبيعي (ضغط قصير: إعادة تشغيل · ضغط مطوّل: فورمات)'));
		o.value('reboot_only', _('إعادة تشغيل فقط (منع الفورمات وحماية الإعدادات)'));
		o.value('disabled', _('تعطيل الزر بالكامل (تجاهل أي ضغطة)'));
		o.default = 'normal';

		o = s.option(form.Value, 'hold_secs', _('مدة الضغط المطوّل للفورمات (بالثواني)'));
		o.datatype = 'range(2,30)';
		o.default = '5';
		o.depends('mode', 'normal');

		return m.render().then(function (node) {
			return E('div', {}, [
				E('h2', {}, _('إعدادات زر الفورمات')),
				statusCard,
				node
			]);
		});
	}
});
