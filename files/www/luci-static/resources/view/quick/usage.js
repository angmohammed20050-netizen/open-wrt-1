'use strict';
'require view';
'require poll';
'require dom';
'require ui';
'require quick.util as util';

/* عداد استهلاك البيانات الحي: إجمالي استهلاك الواجهات (WAN/LAN/WiFi) + استهلاك كل متصل بالشبكة */

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function () {
		return Promise.all([
			util.ctl([ 'usage-ifaces' ]),
			util.ctl([ 'clients' ])
		]);
	},

	render: function (data) {
		var topCards = E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.7em;margin-bottom:1em' });
		var ifTbl = E('table', { 'class': 'table' });
		var clTbl = E('table', { 'class': 'table' });

		function tile(lbl, val, col) {
			return E('div', { 'class': 'cbi-section', 'style': 'padding:.7em .9em;margin:0' }, [
				E('div', { 'style': 'opacity:.7;font-size:.85em' }, lbl),
				E('div', { 'style': 'font-size:1.35em;font-weight:700;color:' + (col || 'inherit') }, val)
			]);
		}

		function update(ifRes, clRes) {
			var ifaces = (ifRes && ifRes.ifaces) || [];
			var clients = (clRes && clRes.clients) || [];

			var totDown = 0, totUp = 0;
			clients.forEach(function (c) { totDown += (+c.down || 0); totUp += (+c.up || 0); });
			var totAll = totDown + totUp;

			dom.content(topCards, [
				tile(_('إجمالي التنزيل (العملاء)'), util.fmtBytes(totDown), '#34d399'),
				tile(_('إجمالي الرفع (العملاء)'), util.fmtBytes(totUp), '#60a5fa'),
				tile(_('الإجمالي الكلي'), util.fmtBytes(totAll), '#c084fc'),
				tile(_('الأجهزة المرصودة'), String(clients.length))
			]);

			/* جدول الواجهات */
			var irows = [ E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('الواجهة')),
				E('th', { 'class': 'th' }, _('الاستقبال (RX)')),
				E('th', { 'class': 'th' }, _('الإرسال (TX)')),
				E('th', { 'class': 'th' }, _('الإجمالي'))
			]) ];
			ifaces.filter(function (x) { return (x.rx + x.tx) > 0; }).forEach(function (x) {
				irows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, E('b', {}, x.iface)),
					E('td', { 'class': 'td' }, util.fmtBytes(x.rx)),
					E('td', { 'class': 'td' }, util.fmtBytes(x.tx)),
					E('td', { 'class': 'td' }, E('b', {}, util.fmtBytes(x.rx + x.tx)))
				]));
			});
			dom.content(ifTbl, irows);

			/* جدول العملاء مرتب حسب الأكثر استهلاكاً */
			clients.sort(function (a, b) { return (b.down + b.up) - (a.down + a.up); });
			var crows = [ E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('الجهاز')),
				E('th', { 'class': 'th' }, 'IP / MAC'),
				E('th', { 'class': 'th' }, _('تنزيل')),
				E('th', { 'class': 'th' }, _('رفع')),
				E('th', { 'class': 'th' }, _('الإجمالي')),
				E('th', { 'class': 'th' }, _('النسبة'))
			]) ];
			clients.forEach(function (c) {
				var sum = (+c.down || 0) + (+c.up || 0);
				var pct = totAll > 0 ? Math.round(sum * 100 / totAll) : 0;
				crows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, E('b', {}, c.name || _('جهاز غير مسمى'))),
					E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:.88em' }, c.ip + (c.mac ? ' · ' + c.mac : '')),
					E('td', { 'class': 'td', 'style': 'color:#34d399' }, util.fmtBytes(c.down)),
					E('td', { 'class': 'td', 'style': 'color:#60a5fa' }, util.fmtBytes(c.up)),
					E('td', { 'class': 'td' }, E('b', {}, util.fmtBytes(sum))),
					E('td', { 'class': 'td' }, pct + '%')
				]));
			});
			if (crows.length === 1) {
				crows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'colspan': '6', 'style': 'text-align:center;opacity:.7' }, _('لا توجد بيانات استهلاك بعد — سيبدأ العد تلقائياً مع حركة الشبكة.'))
				]));
			}
			dom.content(clTbl, crows);
		}

		update(data[0], data[1]);
		poll.add(function () {
			return Promise.all([ util.ctl([ 'usage-ifaces' ]), util.ctl([ 'clients' ]) ]).then(function (r) {
				update(r[0], r[1]);
			});
		}, 4);

		var resetBtn = E('button', { 'class': 'cbi-button cbi-button-negative', 'type': 'button' }, _('تصفير عدادات العملاء'));
		resetBtn.addEventListener('click', function (ev) {
			ev.preventDefault();
			resetBtn.disabled = true;
			util.ctl([ 'usage-reset' ]).then(function () {
				resetBtn.disabled = false;
				ui.addNotification(null, E('p', _('تم تصفير عدادات استهلاك البيانات بنجاح ✓')), 'info');
			});
		});

		return E('div', {}, [
			E('h2', {}, _('عداد استهلاك البيانات')),
			topCards,
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5em;margin-bottom:.6em' }, [
					E('h3', { 'style': 'margin:0' }, _('استهلاك كل متصل بالشبكة')),
					resetBtn
				]),
				clTbl
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('إجمالي استهلاك منافذ وواجهات الراوتر')),
				ifTbl
			])
		]);
	}
});
