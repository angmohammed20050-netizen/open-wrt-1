'use strict';
'require view';
'require ui';
'require quick.util as util';

/* تعيين كلمة مرور الراوتر (root) بواجهة عربية سهلة مع مقياس قوة الكلمة */

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render: function () {
		var pw1 = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'placeholder': _('أدخل كلمة المرور الجديدة'), 'autocomplete': 'new-password', 'style': 'max-width:360px;width:100%' });
		var pw2 = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'placeholder': _('أعد كتابة كلمة المرور للتأكيد'), 'autocomplete': 'new-password', 'style': 'max-width:360px;width:100%' });
		var showChk = E('input', { 'type': 'checkbox' });
		var bar = E('div', { 'style': 'height:6px;border-radius:4px;background:rgba(255,255,255,.12);max-width:360px;margin:.5em 0;overflow:hidden' }, [
			E('div', { 'style': 'height:100%;width:0%;transition:all .25s' })
		]);
		var strengthLbl = E('div', { 'style': 'font-size:.85em;opacity:.8;margin-bottom:.8em' }, _('قوة كلمة المرور: —'));
		var msg = E('div', { 'style': 'margin-top:.8em' });
		var btn = E('button', { 'class': 'cbi-button cbi-button-apply important', 'type': 'button' }, _('حفظ كلمة المرور الجديدة'));

		showChk.addEventListener('change', function () {
			var t = showChk.checked ? 'text' : 'password';
			pw1.type = t; pw2.type = t;
		});

		pw1.addEventListener('input', function () {
			var v = pw1.value || '', score = 0;
			if (v.length >= 6) score += 25;
			if (v.length >= 10) score += 25;
			if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score += 20;
			if (/[0-9]/.test(v)) score += 15;
			if (/[^A-Za-z0-9]/.test(v)) score += 15;
			var fill = bar.firstChild;
			fill.style.width = score + '%';
			var col = score < 40 ? '#fb7185' : (score < 75 ? '#fbbf24' : '#34d399');
			var txt = score < 40 ? _('ضعيفة') : (score < 75 ? _('متوسطة') : _('قوية جداً'));
			fill.style.background = col;
			strengthLbl.textContent = _('قوة كلمة المرور: ') + (v ? txt : '—');
		});

		btn.addEventListener('click', function (ev) {
			ev.preventDefault();
			var a = pw1.value, b = pw2.value;
			if (!a || a.length < 4) {
				msg.innerHTML = '';
				msg.appendChild(util.note(_('كلمة المرور قصيرة جداً (4 أحرف على الأقل).'), 'warning'));
				return;
			}
			if (a !== b) {
				msg.innerHTML = '';
				msg.appendChild(util.note(_('كلمتا المرور غير متطابقتين!'), 'danger'));
				return;
			}
			btn.disabled = true;
			var b64 = btoa(unescape(encodeURIComponent(a)));
			util.ctl([ 'passwd', b64 ]).then(function (r) {
				btn.disabled = false;
				msg.innerHTML = '';
				if (r && r.ok) {
					pw1.value = ''; pw2.value = '';
					msg.appendChild(util.note(_('تم تغيير كلمة مرور الراوتر بنجاح ✓ — استخدم الكلمة الجديدة في الدخول القادم (LuCI و SSH).'), 'success'));
					ui.addNotification(null, E('p', _('تم تحديث كلمة مرور الراوتر بنجاح.')), 'info');
				} else {
					msg.appendChild(util.note(_('فشل التغيير: ') + (r && r.error ? r.error : 'خطأ غير معروف'), 'danger'));
				}
			});
		});

		return E('div', {}, [
			E('h2', {}, _('تعيين كلمة المرور')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('تغيير كلمة مرور المدير (root)')),
				E('p', { 'class': 'cbi-section-descr' }, _('تُطبّق كلمة المرور الجديدة فوراً على لوحة التحكم LuCI ودخول SSH.')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('كلمة المرور الجديدة')),
					E('div', { 'class': 'cbi-value-field' }, [ pw1, bar, strengthLbl ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('تأكيد كلمة المرور')),
					E('div', { 'class': 'cbi-value-field' }, [ pw2 ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('إظهار الأحرف')),
					E('div', { 'class': 'cbi-value-field' }, [ E('label', { 'style': 'display:inline-flex;gap:.4em;align-items:center;cursor:pointer' }, [ showChk, _('إظهار كلمة المرور') ]) ])
				]),
				E('div', { 'style': 'margin-top:1em' }, [ btn ]),
				msg
			])
		]);
	}
});
