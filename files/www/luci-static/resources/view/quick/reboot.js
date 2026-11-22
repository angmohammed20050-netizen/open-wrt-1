'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require quick.util as util';

/* توقيت إعادة التشغيل المجدولة (مع حماية من الدخول في حلقة إعادة تشغيل لا نهائية) + زر إعادة تشغيل فوري */

return view.extend({
	load: function () {
		return uci.load('quick');
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	render: function () {
		var nowBtn = E('button', { 'class': 'cbi-button cbi-button-negative', 'type': 'button' }, _('إعادة تشغيل الراوتر الآن'));
		nowBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			if (!confirm(_('هل أنت متأكد من إعادة تشغيل الراوتر الآن؟ سينقطع الاتصال لمدة دقيقة تقريباً.'))) return;
			nowBtn.disabled = true;
			util.ctl([ 'reboot-now' ]).then(function () {
				ui.addNotification(null, E('p', _('جارٍ إعادة تشغيل الراوتر... انتظر دقيقة ثم أعد تحميل الصفحة.')), 'warning');
			});
		});

		var topCard = E('div', { 'class': 'cbi-section', 'style': 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.8em' }, [
			E('div', {}, [
				E('h3', { 'style': 'margin:0 0 .3em' }, _('إعادة التشغيل الفورية')),
				E('div', { 'style': 'opacity:.75;font-size:.9em' }, _('تستخدم جدولة إعادة التشغيل الآلية حماية رسمية (sleep 70 && touch /etc/banner) لمنع تكرار إعادة التشغيل اللانهائي.'))
			]),
			nowBtn
		]);

		var m = new form.Map('quick', _('جدولة إعادة التشغيل التلقائية'));
		var s = m.section(form.NamedSection, 'reboot', 'reboot', _('إعدادات التوقيت'));
		s.addremove = false;

		var o = s.option(form.Flag, 'enabled', _('تفعيل إعادة التشغيل المجدولة'));
		o.default = o.disabled;

		o = s.option(form.ListValue, 'mode', _('التكرار'));
		o.value('daily', _('يومياً'));
		o.value('weekly', _('أسبوعياً (يوم محدد)'));
		o.value('custom', _('توقيت Cron مخصص'));
		o.default = 'daily';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'weekday', _('اليوم'));
		o.value('0', _('الأحد'));
		o.value('1', _('الاثنين'));
		o.value('2', _('الثلاثاء'));
		o.value('3', _('الأربعاء'));
		o.value('4', _('الخميس'));
		o.value('5', _('الجمعة'));
		o.value('6', _('السبت'));
		o.default = '0';
		o.depends({ enabled: '1', mode: 'weekly' });

		o = s.option(form.ListValue, 'hour', _('الساعة (نظام 24 ساعة)'));
		for (var h = 0; h < 24; h++) o.value(String(h), (h < 10 ? '0' : '') + h + ':00');
		o.default = '4';
		o.depends({ enabled: '1', mode: 'daily' });
		o.depends({ enabled: '1', mode: 'weekly' });

		o = s.option(form.ListValue, 'minute', _('الدقيقة'));
		[ '0', '5', '10', '15', '20', '30', '45' ].forEach(function (mn) { o.value(mn, (mn.length === 1 ? '0' : '') + mn); });
		o.default = '0';
		o.depends({ enabled: '1', mode: 'daily' });
		o.depends({ enabled: '1', mode: 'weekly' });

		o = s.option(form.Value, 'custom_cron', _('تعبير Cron المخصص'), _('مثال: 0 4 * * *'));
		o.placeholder = '0 4 * * *';
		o.depends({ enabled: '1', mode: 'custom' });
		o.validate = function (sid, v) { return /^[0-9*\/,-]+( [0-9*\/,-]+){4}$/.test(v || '') ? true : _('صيغة cron غير صحيحة'); };

		return m.render().then(function (node) {
			return E('div', {}, [
				E('h2', {}, _('توقيت إعادة التشغيل')),
				topCard,
				node
			]);
		});
	}
});
