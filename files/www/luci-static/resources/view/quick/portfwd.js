'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require quick.util as util';

/* إدارة توجيه المنافذ (Port Forwarding): واجهة مبسطة وسريعة مع قوالب جاهزة وقائمة أجهزة الشبكة */

var callHostHints = rpc.declare({ object: 'luci-rpc', method: 'getHostHints', expect: { '': {} } });

var TEMPLATES = [
	{ name: 'Winbox (ميكروتك)', proto: 'tcp', ext: '8291', intp: '8291' },
	{ name: 'HTTP (ويب)',        proto: 'tcp', ext: '80',   intp: '80' },
	{ name: 'HTTPS (ويب آمن)',   proto: 'tcp', ext: '443',  intp: '443' },
	{ name: 'كاميرات DVR/NVR',   proto: 'tcp udp', ext: '37777', intp: '37777' },
	{ name: 'سطح المكتب البعيد RDP', proto: 'tcp', ext: '3389', intp: '3389' }
];

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('firewall'),
			L.resolveDefault(callHostHints(), {})
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	addTemplate: function (tpl) {
		var sid = uci.add('firewall', 'redirect');
		uci.set('firewall', sid, 'name', tpl.name);
		uci.set('firewall', sid, 'src', 'wan');
		uci.set('firewall', sid, 'dest', 'lan');
		uci.set('firewall', sid, 'target', 'DNAT');
		uci.set('firewall', sid, 'proto', tpl.proto);
		uci.set('firewall', sid, 'src_dport', tpl.ext);
		uci.set('firewall', sid, 'dest_port', tpl.intp);
		uci.set('firewall', sid, 'dest_ip', '192.168.1.100');
		uci.set('firewall', sid, 'enabled', '1');
		uci.save().then(function () {
			ui.addNotification(null, E('p', _('تمت إضافة قاعدة: ') + tpl.name + _(' — عدّل عنوان IP الداخلي ثم اضغط «حفظ وتطبيق».')), 'info');
			setTimeout(function () { location.reload(); }, 900);
		});
	},

	render: function (data) {
		var hosts = data[1] || {};
		var self = this;

		var quickBar = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('إضافة سريعة بقوالب جاهزة')),
			E('div', { 'style': 'display:flex;gap:.5em;flex-wrap:wrap' }, TEMPLATES.map(function (t) {
				return E('button', {
					'class': 'cbi-button cbi-button-action',
					'type': 'button',
					click: function () { self.addTemplate(t); }
				}, '+ ' + t.name + ' (' + t.ext + ')');
			}))
		]);

		var m = new form.Map('firewall', _('قواعد توجيه المنافذ (Port Forwarding)'),
			_('توجيه الاتصالات القادمة من الإنترنت (WAN) إلى جهاز محدد داخل شبكتك المحلية (LAN).'));

		var s = m.section(form.GridSection, 'redirect', _('قواعد التوجيه'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.filter = function (sid) {
			return uci.get('firewall', sid, 'target') !== 'SNAT';
		};

		var o = s.option(form.Value, 'name', _('اسم القاعدة'));
		o.placeholder = 'مثال: كاميرات';

		o = s.option(form.ListValue, 'proto', _('البروتوكول'));
		o.value('tcp udp', 'TCP + UDP');
		o.value('tcp', 'TCP');
		o.value('udp', 'UDP');
		o.default = 'tcp udp';

		o = s.option(form.Value, 'src', _('منطقة المصدر'));
		o.value('wan', 'WAN');
		o.default = 'wan';
		o.modalonly = true;

		o = s.option(form.Value, 'src_dport', _('المنفذ الخارجي'));
		o.datatype = 'portrange';
		o.placeholder = '8080';
		o.rmempty = false;

		o = s.option(form.Value, 'dest_ip', _('عنوان IP الداخلي'));
		o.datatype = 'ip4addr';
		o.rmempty = false;
		Object.keys(hosts).forEach(function (mac) {
			var h = hosts[mac] || {};
			(h.ipaddrs || []).forEach(function (ip) {
				o.value(ip, ip + (h.name ? ' (' + h.name + ')' : ''));
			});
		});

		o = s.option(form.Value, 'dest_port', _('المنفذ الداخلي'));
		o.datatype = 'portrange';
		o.placeholder = '80';

		o = s.option(form.Value, 'dest', _('المنطقة الداخلية'));
		o.value('lan', 'LAN');
		o.default = 'lan';
		o.modalonly = true;

		o = s.option(form.Flag, 'reflection', _('NAT Loopback'));
		o.default = o.enabled;
		o.modalonly = true;

		o = s.option(form.Flag, 'enabled', _('مفعّل'));
		o.default = o.enabled;
		o.editable = true;

		return m.render().then(function (node) {
			return E('div', {}, [
				E('h2', {}, _('إدارة توجيه المنافذ')),
				quickBar,
				node
			]);
		});
	}
});
