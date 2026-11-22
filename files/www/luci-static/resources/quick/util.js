'use strict';
'require baseclass';
'require dom';
'require fs';

/* أدوات مشتركة بين صفحات Quick */
return baseclass.extend({
	CTL: '/usr/libexec/quick-ctl',

	/* ينفّذ quick-ctl ويرجع JSON (أو {error}) */
	ctl: function (args) {
		return fs.exec_direct(this.CTL, args, 'json').catch(function (e) {
			return { error: (e && e.message) ? e.message : String(e) };
		});
	},

	fmtBytes: function (b) {
		b = +b || 0;
		var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
		while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
		return b.toFixed(i ? 1 : 0) + ' ' + u[i];
	},

	fmtRate: function (bytesPerSec) {
		var bits = (+bytesPerSec || 0) * 8;
		if (bits >= 1e6) return (bits / 1e6).toFixed(2) + ' Mbps';
		if (bits >= 1e3) return (bits / 1e3).toFixed(0) + ' Kbps';
		return bits.toFixed(0) + ' bps';
	},

	/* Save / Reset لصفحات فيها أكثر من Map */
	saveAll: function () {
		var tasks = [];
		document.querySelectorAll('#maincontent .cbi-map').forEach(function (m) {
			tasks.push(dom.callClassMethod(m, 'save'));
		});
		return Promise.all(tasks);
	},

	resetAll: function () {
		var tasks = [];
		document.querySelectorAll('#maincontent .cbi-map').forEach(function (m) {
			tasks.push(dom.callClassMethod(m, 'reset'));
		});
		return Promise.all(tasks);
	},

	/* بطاقة ملاحظة */
	note: function (text, kind) {
		return E('div', { 'class': 'alert-message ' + (kind || 'info'), 'style': 'margin:.6em 0' }, text);
	},

	/* يفحص وجود ملف */
	exists: function (path) {
		return fs.stat(path).then(function () { return true; }, function () { return false; });
	}
});
