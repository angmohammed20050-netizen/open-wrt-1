'use strict';
'require view';
'require form';
'require uci';
'require poll';
'require dom';
'require ui';
'require quick.util as util';

/* القسم 4: مميزات إضافية
   عزل المنافذ، الحماية من السرقة (فلتر MAC، ربط الأجهزة، SSH)، تحسين الأداء ومسح الكاش */

function fmtUptime(s) {
	s = +s || 0;
	var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	return (d ? d + 'd ' : '') + h + 'h ' + m + 'm';
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('wireless'),
			uci.load('network'),
			uci.load('dhcp'),
			uci.load('firewall'),
			uci.load('quick'),
			L.resolveDefault(uci.load('dropbear'), null),
			util.ctl([ 'status' ])
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	/* ------------------------------------------- حالة الراوتر + تنظيف ---- */
	renderPerf: function (st) {
		var box = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.6em' });
		var msg = E('div', { 'style': 'margin-top:.6em;opacity:.85' });

		function tile(title, val) {
			return E('div', { 'class': 'cbi-section', 'style': 'padding:.6em .8em;margin:0' }, [
				E('div', { 'style': 'opacity:.7;font-size:.85em' }, title),
				E('div', { 'style': 'font-size:1.3em;font-weight:700' }, val)
			]);
		}

		function update(r) {
			if (!r || r.error) return;
			var used = r.mem_total_kb - r.mem_avail_kb;
			dom.content(box, [
				tile(_('الذاكرة المستخدمة'), util.fmtBytes(used * 1024) + ' / ' + util.fmtBytes(r.mem_total_kb * 1024)),
				tile(_('الذاكرة المتاحة'), util.fmtBytes(r.mem_avail_kb * 1024)),
				tile(_('حمل المعالج'), String(r.load)),
				tile(_('اتصالات conntrack'), r.conntrack + ' / ' + r.conntrack_max),
				tile(_('مدة التشغيل'), fmtUptime(r.uptime))
			]);
		}
		update(st);
		poll.add(function () { return util.ctl([ 'status' ]).then(update); }, 5);

		function cleanBtn(label, what, cls) {
			var b = E('button', { 'class': 'cbi-button ' + (cls || 'cbi-button-action') }, label);
			b.addEventListener('click', function (ev) {
				ev.preventDefault();
				b.disabled = true;
				util.ctl([ 'clean', what ]).then(function (r) {
					b.disabled = false;
					if (r.error) { msg.textContent = r.error; return; }
					var gained = (r.mem_after_kb - r.mem_before_kb) * 1024;
					var parts = [];
					[ [ 'cache', _('كاش الذاكرة') ], [ 'dns', _('كاش DNS') ], [ 'conntrack', _('الاتصالات') ], [ 'logs', _('السجلات') ], [ 'luci', _('كاش الواجهة') ] ].forEach(function (k) {
						if (r[k[0]] === 'ok') parts.push(k[1] + ' ✓');
						else if (r[k[0]] === 'fail') parts.push(k[1] + ' ✗');
						else if (r[k[0]] === 'missing') parts.push(k[1] + ' (' + _('الأداة غير مثبّتة: conntrack') + ')');
					});
					msg.textContent = parts.join(' · ') + (gained > 0 ? ' — ' + _('تحرّر') + ' ' + util.fmtBytes(gained) : '');
				});
			});
			return b;
		}

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('تحسين أداء الراوتر')),
			box,
			E('div', { 'style': 'display:flex;gap:.5em;flex-wrap:wrap;margin-top:.8em' }, [
				cleanBtn(_('مسح كاش الذاكرة'), 'cache'),
				cleanBtn(_('مسح كاش DNS'), 'dns'),
				cleanBtn(_('مسح جدول الاتصالات'), 'conntrack', 'cbi-button-neutral'),
				cleanBtn(_('مسح السجلات'), 'logs', 'cbi-button-neutral'),
				cleanBtn(_('مسح كاش الواجهة'), 'luci', 'cbi-button-neutral'),
				cleanBtn(_('تنظيف شامل'), 'all', 'cbi-button-positive')
			]),
			msg,
			E('p', { 'class': 'cbi-section-descr', 'style': 'margin-top:.6em' }, _('مسح جدول الاتصالات يقطع الاتصالات المفتوحة لثواني. مسح كاش الذاكرة آمن ويحرر الذاكرة المخبّأة فقط.'))
		]);
	},

	render: function (data) {
		var haveDropbear = !!data[5];
		var m, s, o, maps = [];

				/* ================= حماية السوفتوير ومنع النسخ ================= */
		m = new form.Map('quick', _('حماية السوفتوير ومنع النسخ (لأجهزة الزبائن)'),
			_('تحمي ملفاتك وثيمك وإعداداتك من النسخ عبر منع تنزيل النسخ الاحتياطي (Backup) وقفل صفحات النظام والفلاش عن الزبائن. لفتح الصفحات المخفية مؤقتاً أضف #quick-unlock لنهاية الرابط.'));
		maps.push(m);

		s = m.section(form.NamedSection, 'protect', 'protect', _('طبقات حماية السوفت'));
		s.addremove = false;

		o = s.option(form.Flag, 'block_backup', _('إخفاء ومنع أزرار النسخ الاحتياطي في LuCI'));
		o.default = o.enabled;

		o = s.option(form.Flag, 'lock_cgi_backup', _('قفل نقطة النسخ الاحتياطي بالنظام (cgi-backup)'),
			_('يمنع سحب ملفات الإعدادات والسكربتات حتى عبر الرابط المباشر /cgi-bin/cgi-backup.'));
		o.default = o.enabled;

		o = s.option(form.Flag, 'customer_lock', _('وضع قفل الزبون (إخفاء الفلاش وتثبيت الحزم والنظام)'),
			_('يخفي قوائم Flash Firmware و Software و Startup عن الزبون. يمكنك أنت فتحها بأي وقت بإضافة #quick-unlock للرابط أو عبر SSH.'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'lock_ssh_lan', _('تقييد دخول SSH على الشبكة المحلية فقط'));
		o.default = o.disabled;

		/* ================= عزل المنافذ ================= */
		m = new form.Map('network', _('عزل المنافذ'),
			_('عزل منفذ الجسر يمنع الجهاز المتصل بهذا المنفذ من الوصول للمنافذ المعزولة الأخرى، ويبقى وصوله للراوتر والإنترنت. يعمل على أجهزة DSA (أسماء المنافذ lan1 و lan2 ...).'));
		maps.push(m);

		s = m.section(form.GridSection, 'device', _('منافذ الجسر'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = false;
		s.filter = function (sid) { return uci.get('network', sid, 'type') !== 'bridge' && uci.get('network', sid, 'ports') == null; };

		o = s.option(form.Value, 'name', _('اسم المنفذ'), _('مثال: lan1'));
		o.rmempty = false;
		o.placeholder = 'lan1';

		o = s.option(form.Flag, 'isolate', _('عزل المنفذ'));
		o.editable = true;

		o = s.option(form.Flag, 'learning', _('تعلّم MAC'));
		o.default = o.enabled;
		o.modalonly = true;

		o = s.option(form.Flag, 'unicast_flood', _('Unicast flooding'));
		o.default = o.enabled;
		o.modalonly = true;

		o = s.option(form.Flag, 'multicast_to_unicast', _('Multicast إلى Unicast'));
		o.modalonly = true;

		/* عزل عملاء الواي فاي */
		m = new form.Map('wireless', _('عزل عملاء الواي فاي'),
			_('يمنع أجهزة نفس الشبكة اللاسلكية من رؤية بعضها (مناسب لشبكة الضيوف).'));
		maps.push(m);

		s = m.section(form.TypedSection, 'wifi-iface', _('الشبكات اللاسلكية'));
		s.anonymous = true;
		s.filter = function (sid) { return uci.get('wireless', sid, 'mode') === 'ap'; };

		o = s.option(form.DummyValue, 'ssid', _('الشبكة'));
		o = s.option(form.Flag, 'isolate', _('عزل العملاء عن بعض'));

		/* ================= الحماية من السرقة ================= */
		m = new form.Map('wireless', _('الحماية من السرقة: فلتر MAC'),
			_('اسمح فقط لأجهزتك (قائمة سماح)، أو احظر أجهزة معينة. يقلل خطر استخدام شبكتك من غرباء حتى لو عرفوا كلمة السر، لكن عناوين MAC يمكن تزويرها، فاستخدمه مع حماية WPA2/WPA3 قوية.'));
		maps.push(m);

		s = m.section(form.TypedSection, 'wifi-iface', _('فلتر MAC لكل شبكة'));
		s.anonymous = true;
		s.filter = function (sid) { return uci.get('wireless', sid, 'mode') === 'ap'; };

		o = s.option(form.DummyValue, 'ssid', _('الشبكة'));

		o = s.option(form.ListValue, 'macfilter', _('الوضع'));
		o.value('', _('معطّل'));
		o.value('allow', _('اسمح فقط للقائمة'));
		o.value('deny', _('احظر القائمة'));

		o = s.option(form.DynamicList, 'maclist', _('عناوين MAC'));
		o.datatype = 'macaddr';
		o.depends('macfilter', 'allow');
		o.depends('macfilter', 'deny');

		/* ربط الأجهزة بعناوين ثابتة */
		m = new form.Map('dhcp', _('الحماية من السرقة: ربط الأجهزة بعناوين'),
			_('اربط كل جهاز بعنوان IP ثابت حسب MAC. هذا يثبّت حدود السرعة والكمية على الجهاز الصحيح. عند تعطيل الخيار الأخير لا يأخذ عنواناً إلا الأجهزة المسجلة هنا.'));
		maps.push(m);

		s = m.section(form.GridSection, 'host', _('الأجهزة المسجلة'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = false;

		o = s.option(form.Value, 'name', _('الاسم'));
		o = s.option(form.Value, 'mac', _('MAC'));
		o.datatype = 'macaddr';
		o.rmempty = false;
		o = s.option(form.Value, 'ip', _('IP'));
		o.datatype = 'ip4addr';
		o.rmempty = false;

		s = m.section(form.NamedSection, 'lan', 'dhcp', _('الأجهزة غير المسجلة'));
		o = s.option(form.Flag, 'dynamicdhcp', _('أعطِ عنواناً للأجهزة غير المسجلة'),
			_('تحذير: بعد تعطيله لن يتصل أي جهاز جديد قبل تسجيله، وقد تفقد وصولك إن لم يكن جهازك مسجلاً. سجّله أولاً.'));
		o.default = o.enabled;

		/* حماية الدخول للراوتر */
		if (haveDropbear) {
			m = new form.Map('dropbear', _('الحماية من السرقة: دخول SSH'),
				_('قيّد SSH على الشبكة المحلية وامنع الدخول بكلمة سر للمستخدم root (استخدم مفاتيح).'));
			maps.push(m);

			s = m.section(form.TypedSection, 'dropbear', _('SSH'));
			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.Value, 'Interface', _('الواجهة'), _('اكتب lan ليقبل SSH من الشبكة المحلية فقط.'));
			o.value('', _('كل الواجهات'));
			o.value('lan', 'lan');
			o = s.option(form.Flag, 'PasswordAuth', _('السماح بكلمة السر'));
			o.default = o.enabled;
			o = s.option(form.Flag, 'RootPasswordAuth', _('السماح بكلمة السر لـ root'));
			o.default = o.enabled;
		}

		/* ================= إعدادات الأداء ================= */
		m = new form.Map('firewall', _('خيارات الأداء'),
			_('Flow offloading يرفع سرعة التوجيه لكنه يتعارض مع حدود السرعة والعدّاد في «قياس السرعة والحظر».'));
		maps.push(m);

		s = m.section(form.TypedSection, 'defaults', _('الجدار الناري'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.Flag, 'flow_offloading', _('Software flow offloading'));
		o = s.option(form.Flag, 'flow_offloading_hw', _('Hardware flow offloading'));
		o.depends('flow_offloading', '1');
		o = s.option(form.Flag, 'synflood_protect', _('حماية SYN flood'));

		m = new form.Map('network', _('توزيع المعالجة'));
		maps.push(m);

		s = m.section(form.NamedSection, 'globals', 'globals', _('الشبكة'));
		s.addremove = false;
		o = s.option(form.Flag, 'packet_steering', _('Packet steering'), _('يوزّع معالجة الحزم على أنوية المعالج (مفيد للأجهزة متعددة الأنوية).'));

		m = new form.Map('quick', _('تنظيف تلقائي وضبط النظام'));
		maps.push(m);

		s = m.section(form.NamedSection, 'perf', 'perf', _('الجدولة والضبط'));
		s.addremove = false;

		o = s.option(form.Flag, 'clean_enable', _('تنظيف تلقائي مجدول'));
		o = s.option(form.Value, 'clean_cron', _('التوقيت (cron)'), _('دقيقة ساعة يوم شهر يوم-أسبوع. الافتراضي: كل يوم 4 الفجر.'));
		o.placeholder = '0 4 * * *';
		o.depends('clean_enable', '1');
		o.validate = function (sid, v) { return /^[0-9*\/,-]+( [0-9*\/,-]+){4}$/.test(v || '') ? true : _('صيغة cron غير صحيحة'); };
		o = s.option(form.Flag, 'clean_cache', _('يمسح كاش الذاكرة'));
		o.default = o.enabled;
		o.depends('clean_enable', '1');
		o = s.option(form.Flag, 'clean_dns', _('يمسح كاش DNS'));
		o.default = o.enabled;
		o.depends('clean_enable', '1');
		o = s.option(form.Flag, 'clean_conntrack', _('يمسح جدول الاتصالات'));
		o.depends('clean_enable', '1');
		o = s.option(form.Flag, 'clean_logs', _('يمسح السجلات'));
		o.depends('clean_enable', '1');

		o = s.option(form.Value, 'conntrack_max', _('أقصى اتصالات conntrack'), _('فاضي = بدون تغيير. من 1024 إلى 4194304.'));
		o.datatype = 'range(1024,4194304)';
		o.rmempty = true;
		o = s.option(form.Flag, 'bbr', _('تفعيل TCP BBR'), _('يحتاج kmod-tcp-bbr. يحسّن سرعة TCP على الخطوط ذات الفقد.'));

		return Promise.all(maps.map(function (x) { return x.render(); })).then(L.bind(function (nodes) {
			return E('div', {}, [
				E('h2', {}, _('مميزات إضافية')),
				this.renderPerf(data[6])
			].concat(nodes));
		}, this));
	}
});
