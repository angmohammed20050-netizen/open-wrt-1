'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require dom';
'require poll';
'require quick.util as util';

/* الظهور بالنيبورز (MikroTik Winbox Neighbors MNDP + LLDP/CDP) */

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('quick'),
			util.ctl([ 'neighbors-status' ])
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	renderLive: function (st) {
		var cards = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:.7em;margin-bottom:.8em' });

		function tile(lbl, val, col) {
			return E('div', { 'class': 'cbi-section', 'style': 'padding:.7em .9em;margin:0' }, [
				E('div', { 'style': 'opacity:.7;font-size:.85em' }, lbl),
				E('div', { 'style': 'font-size:1.15em;font-weight:700;color:' + (col || 'inherit') }, val)
			]);
		}

		function update(r) {
			if (!r || r.error) return;
			dom.content(cards, [
				tile(_('بث MikroTik Winbox (MNDP)'), r.mndp_running ? _('نشط ✓ (UDP 5678)') : _('متوقف'), r.mndp_running ? '#34d399' : '#fbbf24'),
				tile(_('خدمة LLDP / CDP'), r.lldp_installed ? (r.lldp_running ? _('نشطة ✓') : _('مثبّتة (متوقفة)')) : _('غير مثبّتة (اختيارية)'), r.lldp_running ? '#34d399' : '#94a3b8'),
				tile(_('الاسم الظاهر (Identity)'), r.identity || 'ZTE-E8822-Quick'),
				tile(_('عنوان IP / MAC'), (r.ip || '—') + (r.mac ? ' · ' + r.mac : ''))
			]);
		}

		update(st);
		poll.add(function () { return util.ctl([ 'neighbors-status' ]).then(update); }, 6);

		var sendBtn = E('button', { 'class': 'cbi-button cbi-button-action important', 'type': 'button' }, _('إرسال إشارة ظهور فورية إلى Winbox الآن'));
		sendBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			sendBtn.disabled = true;
			util.ctl([ 'neighbors-send' ]).then(function (r) {
				sendBtn.disabled = false;
				if (r && r.ok) {
					ui.addNotification(null, E('p', _('تم بث حزمة MNDP بنجاح ✓ — افتح Winbox ← Neighbors أو IP ← Neighbors في الميكروتك لرؤية الجهاز.')), 'info');
				} else {
					ui.addNotification(null, E('p', _('تعذر البث: ') + (r && r.error ? r.error : '')), 'warning');
				}
			});
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('حالة الظهور في النيبورز (Winbox / MikroTik Neighbors)')),
			E('p', { 'class': 'cbi-section-descr' }, _('ميزة مدمجة بالكامل (بدون الحاجة لأي إضافة خارجية): تبث هوية الراوتر عبر بروتوكول MNDP (المنفذ 5678) ليظهر جهاز ZTE E8822 مباشرة في قائمة Neighbors داخل Winbox والميكروتك.')),
			cards,
			sendBtn
		]);
	},

	render: function (data) {
		var m = new form.Map('quick', _('إعدادات الظهور بالنيبورز'));
		var s = m.section(form.NamedSection, 'neighbors', 'neighbors', _('خيارات البث والهوية'));
		s.addremove = false;

		var o = s.option(form.Flag, 'mndp_enable', _('تفعيل الظهور في Winbox Neighbors (MNDP)'),
			_('يجعل الراوتر يظهر تلقائياً في MikroTik Winbox و IP → Neighbors.'));
		o.default = o.enabled;

		o = s.option(form.Value, 'identity', _('الاسم الظاهر (Identity)'),
			_('الاسم الذي سيظهر لك في قائمة النيبورز (مثال: ZTE-E8822-Tower1).'));
		o.default = 'ZTE-E8822-Quick';
		o.depends('mndp_enable', '1');

		o = s.option(form.Value, 'platform', _('اسم الجهاز (Platform / Board)'));
		o.default = 'ZTE E8822';
		o.depends('mndp_enable', '1');

		o = s.option(form.Value, 'iface', _('الواجهة المعلَنة'), _('الافتراضي br-lan'));
		o.value('br-lan', 'br-lan (الشبكة المحلية)');
		o.value('wan', 'wan');
		o.default = 'br-lan';
		o.depends('mndp_enable', '1');

		o = s.option(form.Value, 'interval', _('فاصل البث (بالثواني)'), _('الافتراضي 60 ثانية (من 10 إلى 600).'));
		o.datatype = 'range(10,600)';
		o.default = '60';
		o.depends('mndp_enable', '1');

		o = s.option(form.Flag, 'lldp_enable', _('تفعيل بروتوكول LLDP / CDP (اختياري)'),
			_('يحتاج حزمة lldpd للظهور في سويتشات سيسكو وغيرها بالإضافة إلى MNDP.'));

		return m.render().then(L.bind(function (node) {
			return E('div', {}, [
				E('h2', {}, _('الظهور بالنيبورز')),
				this.renderLive(data[1]),
				node
			]);
		}, this));
	}
});
