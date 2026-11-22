'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';
'require quick.util as util';

/* القسم 3: VPN و DNS
   WireGuard (واجهات + نظراء + منطقة الجدار الناري)، OpenVPN (ملف ovpn)، DNS */

var OVPN = '/etc/openvpn/quick.ovpn';

var DNS_PRESETS = {
	cloudflare: [ '1.1.1.1', '1.0.0.1' ],
	google: [ '8.8.8.8', '8.8.4.4' ],
	quad9: [ '9.9.9.9', '149.112.112.112' ],
	adguard: [ '94.140.14.14', '94.140.15.15' ],
	opendns: [ '208.67.222.222', '208.67.220.220' ]
};

/* ينقل واجهة إلى منطقة جدار ناري (أو يزيلها من الكل) */
function setZone(ifname, zone) {
	uci.sections('firewall', 'zone').forEach(function (z) {
		var sid = z['.name'];
		var list = L.toArray(uci.get('firewall', sid, 'network'));
		var has = list.indexOf(ifname) > -1;
		var want = (z.name === zone);
		if (has && !want) {
			list = list.filter(function (x) { return x !== ifname; });
			if (list.length) uci.set('firewall', sid, 'network', list); else uci.unset('firewall', sid, 'network');
		} else if (!has && want) {
			list.push(ifname);
			uci.set('firewall', sid, 'network', list);
		}
	});
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('network'),
			uci.load('firewall'),
			uci.load('dhcp'),
			uci.load('quick'),
			util.exists('/usr/bin/wg'),
			util.exists('/etc/config/openvpn').then(function (ok) {
				return ok ? uci.load('openvpn').then(function () { return true; }, function () { return false; }) : false;
			})
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	/* مولّد مفاتيح WireGuard */
	renderKeygen: function () {
		var priv = E('input', { 'class': 'cbi-input-text', 'readonly': 'readonly', 'style': 'width:100%;direction:ltr' });
		var pub = E('input', { 'class': 'cbi-input-text', 'readonly': 'readonly', 'style': 'width:100%;direction:ltr' });
		var btn = E('button', { 'class': 'cbi-button cbi-button-action' }, _('توليد مفاتيح جديدة'));
		btn.addEventListener('click', function (ev) {
			ev.preventDefault();
			util.ctl([ 'wgkey' ]).then(function (r) {
				if (r.error) { ui.addNotification(null, E('p', r.error), 'danger'); return; }
				priv.value = r.private; pub.value = r.public;
			});
		});
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('مولّد مفاتيح WireGuard')),
			E('p', { 'class': 'cbi-section-descr' }, _('الخاص (Private) يوضع في واجهة الراوتر، والعام (Public) يعطى للطرف الثاني. لا تشارك الخاص مع أحد.')),
			E('div', { 'style': 'display:grid;grid-template-columns:auto 1fr;gap:.4em .8em;align-items:center' }, [
				E('label', {}, 'Private'), priv, E('label', {}, 'Public'), pub
			]),
			E('div', { 'style': 'margin-top:.6em' }, btn)
		]);
	},

	render: function (data) {
		var haveWg = data[4], haveOvpn = data[5];
		var m, s, o, maps = [], top = [];

		top.push(E('h2', {}, _('VPN و DNS')));

		/* ================= WireGuard ================= */
		if (!haveWg) {
			top.push(util.note(_('WireGuard غير مثبّت. نفّذ: opkg update && opkg install wireguard-tools kmod-wireguard luci-proto-wireguard')));
		} else {
			top.push(this.renderKeygen());
		}

		m = new form.Map('network', _('إضافة VPN: WireGuard'),
			_('أضف واجهة WireGuard (اضغط إضافة واكتب اسم مثل wg0). لاستخدامها كـ VPN للخروج للإنترنت اجعل منطقة الجدار الناري wan، وفي النظير اجعل allowed_ips = 0.0.0.0/0.'));
		maps.push(m);

		s = m.section(form.GridSection, 'interface', _('واجهات WireGuard'));
		s.anonymous = false;
		s.addremove = true;
		s.addbtntitle = _('إضافة واجهة WireGuard');
		s.filter = function (sid) { return uci.get('network', sid, 'proto') === 'wireguard'; };
		s.handleAdd = function (ev, name) {
			var cfg = this.uciconfig || this.map.config;
			var sid = this.map.data.add(cfg, this.sectiontype, name);
			this.map.data.set(cfg, sid, 'proto', 'wireguard');
			return this.map.save(null, true);
		};

		o = s.option(form.Value, 'private_key', _('المفتاح الخاص'));
		o.password = true;
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'listen_port', _('منفذ الاستماع'));
		o.datatype = 'port';
		o.placeholder = '51820';

		o = s.option(form.DynamicList, 'addresses', _('عنوان الواجهة (مع القناع)'), _('مثال: 10.8.0.2/24'));
		o.datatype = 'ipaddr';

		o = s.option(form.Value, 'mtu', _('MTU'));
		o.datatype = 'range(576,1500)';
		o.placeholder = '1420';
		o.modalonly = true;

		o = s.option(form.ListValue, 'fwzone', _('منطقة الجدار الناري'), _('wan = يخرج الإنترنت عبر الـ VPN مع NAT.'));
		o.value('', _('بدون'));
		uci.sections('firewall', 'zone').forEach(function (z) { if (z.name) o.value(z.name, z.name); });
		o.cfgvalue = function (sid) {
			var zs = uci.sections('firewall', 'zone');
			for (var i = 0; i < zs.length; i++)
				if (L.toArray(uci.get('firewall', zs[i]['.name'], 'network')).indexOf(sid) > -1) return zs[i].name;
			return '';
		};
		o.write = function (sid, v) { setZone(sid, v); };
		o.remove = function (sid) { setZone(sid, ''); };

		o = s.option(form.Flag, 'disabled', _('تعطيل'));
		o.editable = true;

		/* نظراء كل واجهة (wg0 دائماً، ومعها أي واجهة موجودة) */
		var names = { wg0: true };
		uci.sections('network', 'interface').forEach(function (i) { if (i.proto === 'wireguard') names[i['.name']] = true; });

		m = new form.Map('network', _('نظراء WireGuard (الخوادم أو الأجهزة الأخرى)'),
			_('بعد إضافة واجهة جديدة احفظ وطبّق ثم أعد فتح الصفحة لتظهر نظراؤها.'));
		maps.push(m);

		Object.keys(names).forEach(function (ifn) {
			s = m.section(form.GridSection, 'wireguard_' + ifn, _('النظراء: ') + ifn);
			s.anonymous = true;
			s.addremove = true;
			s.addbtntitle = _('إضافة نظير');

			o = s.option(form.Value, 'description', _('الوصف'));
			o = s.option(form.Value, 'public_key', _('المفتاح العام'));
			o.rmempty = false;
			o.datatype = 'and(base64,rangelength(44,44))';
			o.modalonly = true;

			o = s.option(form.Value, 'preshared_key', _('المفتاح المشترك (اختياري)'));
			o.password = true;
			o.modalonly = true;

			o = s.option(form.Value, 'endpoint_host', _('عنوان الخادم'));
			o.datatype = 'host';

			o = s.option(form.Value, 'endpoint_port', _('منفذ الخادم'));
			o.datatype = 'port';
			o.placeholder = '51820';
			o.modalonly = true;

			o = s.option(form.DynamicList, 'allowed_ips', _('العناوين المسموحة'), _('0.0.0.0/0 لتمرير كل الإنترنت.'));
			o.datatype = 'ipaddr';
			o.modalonly = true;

			o = s.option(form.Flag, 'route_allowed_ips', _('أنشئ المسارات تلقائياً'));
			o.default = o.enabled;
			o.modalonly = true;

			o = s.option(form.Value, 'persistent_keepalive', _('Keepalive (ثواني)'));
			o.datatype = 'range(0,65535)';
			o.placeholder = '25';
			o.modalonly = true;
		});

		/* ================= OpenVPN ================= */
		if (!haveOvpn) {
			top.push(util.note(_('OpenVPN غير مثبّت. لإضافة OpenVPN نفّذ: opkg update && opkg install openvpn-openssl luci-app-openvpn')));
		} else {
			m = new form.Map('openvpn', _('إضافة VPN: OpenVPN'),
				_('الصق محتوى ملف .ovpn كاملاً (مع الشهادات داخله <ca> و <cert> و <key>). يُحفظ في ') + OVPN);
			maps.push(m);

			s = m.section(form.NamedSection, 'quick', 'openvpn', _('اتصال OpenVPN'));
			s.addremove = true;
			s.addbtntitle = _('إنشاء اتصال OpenVPN');

			o = s.option(form.Flag, 'enabled', _('تشغيل'));
			o.default = o.disabled;
			o.rmempty = false;

			o = s.option(form.Value, 'config', _('ملف الإعداد'));
			o.default = OVPN;
			o.readonly = true;
			o.forcewrite = true;
			o.rmempty = false;

			o = s.option(form.TextValue, 'ovpn', _('محتوى ملف ovpn'));
			o.rows = 16;
			o.wrap = 'off';
			o.monospace = true;
			o.rmempty = false;
			o.load = function () { return L.resolveDefault(fs.read_direct(OVPN), ''); };
			o.cfgvalue = function (sid) { return this.data && this.data[sid] != null ? this.data[sid] : ''; };
			o.write = function (sid, v) { return fs.write(OVPN, String(v || '').trim().replace(/\r\n/g, '\n') + '\n', 384); };
			o.remove = function () {};
		}

		/* ================= DNS ================= */
		m = new form.Map('dhcp', _('إعدادات DNS'),
			_('اختر مزود DNS جاهز أو اكتب الخوادم يدوياً. يستخدمها الراوتر لكل الشبكة.'));
		maps.push(m);

		s = m.section(form.TypedSection, 'dnsmasq', _('DNS الراوتر (dnsmasq)'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'dnspreset', _('مزود DNS جاهز'), _('اختياره يستبدل قائمة الخوادم تحت ويعطّل DNS الوارد من مزود الخدمة.'));
		o.value('', _('— بدون تغيير —'));
		o.value('cloudflare', 'Cloudflare (1.1.1.1)');
		o.value('google', 'Google (8.8.8.8)');
		o.value('quad9', 'Quad9 (9.9.9.9)');
		o.value('adguard', 'AdGuard (حجب إعلانات)');
		o.value('opendns', 'OpenDNS');
		o.cfgvalue = function () { return ''; };
		o.write = function (sid, v) {
			if (!DNS_PRESETS[v]) return;
			uci.set('dhcp', sid, 'server', DNS_PRESETS[v]);
			uci.set('dhcp', sid, 'noresolv', '1');
		};
		o.remove = function () {};
		o.rmempty = true;

		o = s.option(form.DynamicList, 'server', _('خوادم DNS العليا'), _('مثال: 1.1.1.1 أو /domain.lan/192.168.1.1'));
		[ '1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '9.9.9.9', '94.140.14.14' ].forEach(function (v) { o.value(v); });

		o = s.option(form.Flag, 'noresolv', _('تجاهل DNS القادم من مزود الخدمة'));
		o = s.option(form.Value, 'cachesize', _('حجم الكاش'), _('0 = معطّل. الافتراضي 150.'));
		o.datatype = 'range(0,10000)';
		o.placeholder = '150';
		o = s.option(form.Flag, 'rebind_protection', _('حماية DNS rebinding'));
		o.default = o.enabled;
		o = s.option(form.Flag, 'domainneeded', _('لا تمرّر أسماء بدون دومين'));
		o = s.option(form.Flag, 'boguspriv', _('لا تمرّر عناوين خاصة للخارج'));

		m = new form.Map('network', _('DNS الواجهة WAN'));
		maps.push(m);

		s = m.section(form.NamedSection, 'wan', 'interface', _('DNS على WAN'));
		s.addremove = false;
		o = s.option(form.Flag, 'peerdns', _('استخدم DNS القادم من مزود الخدمة'));
		o.default = o.enabled;
		o = s.option(form.DynamicList, 'dns', _('خوادم DNS مخصصة'));
		o.datatype = 'ip4addr';
		o.depends('peerdns', '0');

		m = new form.Map('quick', _('حماية DNS'));
		maps.push(m);
		s = m.section(form.NamedSection, 'main', 'main');
		o = s.option(form.Flag, 'force_dns', _('إجبار كل الأجهزة على DNS الراوتر'));
		o = s.option(form.Flag, 'block_dot', _('حظر DNS-over-TLS (المنفذ 853)'));

		return Promise.all(maps.map(function (x) { return x.render(); })).then(function (nodes) {
			return E('div', {}, top.concat(nodes));
		});
	}
});
