'use strict';
'require view';
'require form';
'require uci';
'require poll';
'require dom';
'require quick.util as util';

/* حماية من اللوب (Loop Protection): STP + منع عواصف البث Broadcast/Multicast Storm + حالة منافذ الجسر */

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('quick'),
			uci.load('network'),
			util.ctl([ 'loop-status' ])
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	renderLive: function (st) {
		var cards = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.7em;margin-bottom:.9em' });
		var tbl = E('table', { 'class': 'table' });

		function tile(label, val, color) {
			return E('div', { 'class': 'cbi-section', 'style': 'padding:.7em .9em;margin:0' }, [
				E('div', { 'style': 'opacity:.7;font-size:.85em' }, label),
				E('div', { 'style': 'font-size:1.35em;font-weight:700;color:' + (color || 'inherit') }, val)
			]);
		}

		function update(r) {
			if (!r || r.error) return;
			var stpOn = (+r.stp_state === 1);
			dom.content(cards, [
				tile(_('الجسر المحلي'), r.bridge || 'br-lan'),
				tile(_('حالة STP (منع اللوب)'), stpOn ? _('مفعّل ✓') : _('معطّل ✗'), stpOn ? '#34d399' : '#fbbf24'),
				tile(_('حزم العواصف المصدودة'), String(r.storm_drops || 0), (r.storm_drops > 0 ? '#fb7185' : '#34d399')),
				tile(_('المنافذ النشطة'), String((r.ports || []).length))
			]);

			var rows = [ E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('المنفذ')),
				E('th', { 'class': 'th' }, _('حالة الاتصال')),
				E('th', { 'class': 'th' }, _('حالة STP'))
			]) ];

			(r.ports || []).forEach(function (p) {
				var stpMap = {
					forwarding: _('تمرير طبيعي (Forwarding)'),
					blocking: _('محظور بسبب لوب! (Blocking)'),
					learning: _('تعلّم (Learning)'),
					listening: _('استماع (Listening)'),
					disabled: _('معطّل')
				};
				var col = p.stp === 'blocking' ? '#fb7185' : (p.stp === 'forwarding' ? '#34d399' : '#fbbf24');
				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, E('b', {}, p.port)),
					E('td', { 'class': 'td' }, p.oper === 'up' ? _('متصل (UP)') : (p.oper || '—')),
					E('td', { 'class': 'td', 'style': 'font-weight:600;color:' + col }, stpMap[p.stp] || p.stp)
				]));
			});

			if (rows.length === 1) {
				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'colspan': '3', 'style': 'opacity:.7;text-align:center' }, _('لا توجد منافذ مضافة للجسر حالياً.'))
				]));
			}
			dom.content(tbl, rows);
		}

		update(st);
		poll.add(function () { return util.ctl([ 'loop-status' ]).then(update); }, 5);

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('حالة الحماية من اللوب ومنافذ الجسر')),
			cards,
			tbl
		]);
	},

	render: function (data) {
		var m, s, o, maps = [];

		m = new form.Map('quick', _('إعدادات الحماية من اللوب (Loop Protection)'),
			_('تمنع انهيار الشبكة عند توصيل كيبل بالخطأ بين منفذين أو حدوث عاصفة Broadcast من أحد أجهزة الزبائن.'));
		maps.push(m);

		s = m.section(form.NamedSection, 'loop', 'loop', _('التحكم بالحماية'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('تفعيل منظومة الحماية من اللوب'));
		o.default = o.enabled;

		o = s.option(form.Flag, 'stp', _('تفعيل بروتوكول STP على الجسر (br-lan)'),
			_('يكتشف الحلقات (Loops) تلقائياً ويقوم بحظر المنفذ المسبب للوب فوراً قبل أن يتوقف الراوتر.'));
		o.default = o.enabled;
		o.depends('enabled', '1');

		o = s.option(form.Flag, 'storm_enable', _('تفعيل صد عواصف البث (Broadcast / Multicast Storm)'),
			_('يقيّد عدد حزم البث العشوائية عبر الجدار الناري nftables لحماية المعالج من التجمد.'));
		o.default = o.enabled;
		o.depends('enabled', '1');

		o = s.option(form.Value, 'storm_pps', _('الحد الأقصى لحزم Broadcast (حزمة/ثانية)'),
			_('القيمة الموصى بها: 150 حزمة/ثانية. القيم المنخفضة جداً قد تؤخر DHCP/ARP.'));
		o.datatype = 'range(10,5000)';
		o.default = '150';
		o.depends('storm_enable', '1');

		o = s.option(form.Value, 'mcast_pps', _('الحد الأقصى لحزم Multicast (حزمة/ثانية)'),
			_('القيمة الموصى بها: 250 حزمة/ثانية.'));
		o.datatype = 'range(10,5000)';
		o.default = '250';
		o.depends('storm_enable', '1');

		return Promise.all(maps.map(function (x) { return x.render(); })).then(L.bind(function (nodes) {
			return E('div', {}, [
				E('h2', {}, _('حماية من اللوب')),
				this.renderLive(data[2])
			].concat(nodes));
		}, this));
	}
});
