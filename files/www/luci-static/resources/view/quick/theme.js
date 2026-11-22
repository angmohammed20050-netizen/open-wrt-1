'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';
'require quick.util as util';

/* قائمة التحكم بالثيم (ملف الكونفك /etc/config/quick):
   موضع القائمة، شكل ونمط الأيقونات، الخلفيات (ألوان جاهزة، تدرج مخصص، صورة مرفوعة)، قوة الزجاج */

var BG_DIR = '/www/luci-static/quick/bg';
var BG_URL = '/luci-static/quick/bg';
var UPLOAD = BG_DIR + '/custom.jpg';

var root = document.documentElement;

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('quick'),
			L.resolveDefault(fs.list(BG_DIR), [])
		]);
	},

	handleSave: function () { return util.saveAll(); },
	handleReset: function () { return util.resetAll(); },

	renderUpload: function () {
		var btn = E('button', { 'class': 'cbi-button cbi-button-action' }, _('رفع صورة خلفية'));
		btn.addEventListener('click', function (ev) {
			ev.preventDefault();
			ui.uploadFile(UPLOAD, btn).then(function () {
				uci.set('quick', 'theme', 'bg_image', BG_URL + '/custom.jpg');
				uci.set('quick', 'theme', 'bg_type', 'image');
				return uci.save();
			}).then(function () {
				ui.addNotification(null, E('p', _('تم رفع الصورة. اضغط «حفظ وتطبيق» من تحت ثم حدّث الصفحة.')), 'info');
				setTimeout(function () { location.reload(); }, 1500);
			}).catch(function (e) {
				ui.addNotification(null, E('p', _('فشل الرفع: ') + (e && e.message ? e.message : e)), 'danger');
			});
		});
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('صورة خلفية مخصصة')),
			E('p', { 'class': 'cbi-section-descr' }, _('ارفع صورة JPG أو PNG (يفضل أقل من 2MB). ستُحفظ كملف custom ويُفعّل نوع الخلفية «صورة» تلقائياً.')),
			btn
		]);
	},

	renderLoginUpload: function () {
		function mk(label, file, type) {
			var btn = E('button', { 'class': 'cbi-button cbi-button-action', 'type': 'button' }, label);
			btn.addEventListener('click', function (ev) {
				ev.preventDefault();
				ui.uploadFile(BG_DIR + '/' + file, btn).then(function () {
					uci.set('quick', 'theme', 'login_bg', BG_URL + '/' + file);
					uci.set('quick', 'theme', 'login_bg_type', type);
					return uci.save();
				}).then(function () {
					ui.addNotification(null, E('p', _('تم رفع الملف. اضغط «حفظ وتطبيق» ثم افتح صفحة الدخول لتشاهدها.')), 'info');
					setTimeout(function () { location.reload(); }, 1500);
				}).catch(function (e) {
					ui.addNotification(null, E('p', _('فشل الرفع: ') + (e && e.message ? e.message : e)), 'danger');
				});
			});
			return btn;
		}
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('رفع خلفية صفحة الدخول')),
			E('p', { 'class': 'cbi-section-descr' }, _('الفيديو يفضّل MP4 (H.264) بحجم صغير (أقل من 5MB) لأن مساحة الراوتر محدودة. تقدر بدل الرفع تحط رابط خارجي أو ملف على USB في خانة «مسار الخلفية» أعلاه. الفيديو يعمل بدون صوت وبتكرار تلقائي.')),
			E('div', { 'style': 'display:flex;gap:8px;flex-wrap:wrap' }, [
				mk(_('رفع صورة'), 'login-bg.jpg', 'image'),
				mk(_('رفع فيديو MP4'), 'login-bg.mp4', 'video')
			])
		]);
	},

	render: function (data) {
		var files = (data[1] || []).filter(function (f) { return f.type === 'file' && /\.(jpe?g|png|webp|gif|svg|mp4|webm|ogv)$/i.test(f.name); });
		var m, s, o;

		m = new form.Map('quick', _('تحكم ثيم Quick'),
			_('تغييراتك تظهر فوراً كمعاينة، ولا تثبت إلا بعد «حفظ وتطبيق». الإعدادات تُحفظ في /etc/config/quick وتُطبَّق على كل المتصفحات.'));

		s = m.section(form.NamedSection, 'theme', 'theme', _('القائمة والأيقونات'));
		s.addremove = false;

		o = s.option(form.ListValue, 'menu_layout', _('موضع القائمة'));
		o.value('side', _('جانبية (افتراضي)'));
		o.value('top', _('علوية'));
		o.value('float', _('دوك عايم'));
		o.value('stack', _('كل قسم تحت الثاني'));
		o.value('present', _('بلاطات (برزنتيشن)'));
		o.default = 'side';
		o.onchange = function (ev, sid, v) { root.setAttribute('data-qs-layout', v); };

		o = s.option(form.ListValue, 'icon_shape', _('شكل الأيقونات'));
		o.value('squircle', _('مربع مدوّر'));
		o.value('circle', _('دائرة'));
		o.value('square', _('مربع'));
		o.value('hex', _('سداسي'));
		o.default = 'squircle';
		o.onchange = function (ev, sid, v) { root.setAttribute('data-qs-shape', v); };

		o = s.option(form.ListValue, 'icon_style', _('نمط الأيقونات'));
		o.value('glass', _('زجاجي'));
		o.value('flat', _('ملوّن'));
		o.value('outline', _('إطار'));
		o.default = 'glass';
		o.onchange = function (ev, sid, v) { root.setAttribute('data-qs-icons', v); };

		o = s.option(form.Value, 'blur', _('قوة تغبيش الزجاج (0 إلى 40)'));
		o.datatype = 'range(0,40)';
		o.default = '14';
		o.onchange = function (ev, sid, v) { if (/^\d{1,2}$/.test(v)) root.style.setProperty('--qs-blur', v + 'px'); };

		s = m.section(form.NamedSection, 'theme', 'theme', _('الخلفية'));
		s.addremove = false;

		o = s.option(form.ListValue, 'bg_type', _('نوع الخلفية'));
		o.value('gradient', _('تدرج لوني'));
		o.value('solid', _('لون ثابت'));
		o.value('image', _('صورة'));
		o.default = 'gradient';
		o.onchange = function (ev, sid, v) { root.setAttribute('data-qs-bg', v); };

		o = s.option(form.ListValue, 'bg_preset', _('ألوان جاهزة'));
		o.value('royal', _('ملكي (بنفسجي)'));
		o.value('gold', _('ذهبي'));
		o.value('obsidian', _('أوبسيديان'));
		o.value('ocean', _('محيط'));
		o.value('sunset', _('غروب'));
		o.value('forest', _('غابة'));
		o.value('aurora', _('شفق'));
		o.value('midnight', _('منتصف الليل'));
		o.value('rose', _('وردي'));
		o.value('graphite', _('جرافيت'));
		o.value('custom', _('مخصص (اللونان تحت)'));
		o.default = 'royal';
		o.depends('bg_type', 'gradient');
		o.depends('bg_type', 'solid');

		o = s.option(form.Value, 'bg_color1', _('اللون الأول'), _('بصيغة #RRGGBB'));
		o.datatype = 'string';
		o.placeholder = '#0f172a';
		o.depends('bg_preset', 'custom');
		o.validate = function (sid, v) { return /^#[0-9a-fA-F]{6}$/.test(v || '') ? true : _('اكتب لون مثل #0f172a'); };
		o.onchange = function (ev, sid, v) { if (/^#[0-9a-fA-F]{6}$/.test(v)) root.style.setProperty('--qs-bg1', v); };

		o = s.option(form.Value, 'bg_color2', _('اللون الثاني'), _('بصيغة #RRGGBB'));
		o.placeholder = '#1e3a8a';
		o.depends({ bg_preset: 'custom', bg_type: 'gradient' });
		o.validate = function (sid, v) { return /^#[0-9a-fA-F]{6}$/.test(v || '') ? true : _('اكتب لون مثل #1e3a8a'); };
		o.onchange = function (ev, sid, v) { if (/^#[0-9a-fA-F]{6}$/.test(v)) root.style.setProperty('--qs-bg2', v); };

		o = s.option(form.Value, 'bg_image', _('مسار الصورة'), _('ارفع صورة من الأعلى، أو اختر من الصور الموجودة في ') + BG_DIR);
		o.depends('bg_type', 'image');
		files.forEach(function (f) { o.value(BG_URL + '/' + f.name, f.name); });
		o.validate = function (sid, v) { return (!v || /^\/luci-static\/[A-Za-z0-9_\/.-]+$/.test(v)) ? true : _('مسار غير صالح (يبدأ بـ /luci-static/ بدون مسافات)'); };
		o.onchange = function (ev, sid, v) {
			if (/^\/luci-static\/[A-Za-z0-9_\/.-]+$/.test(v)) root.style.setProperty('--qs-bg-image', 'url("' + v + '")');
		};

		o = s.option(form.ListValue, 'accent', _('لون التمييز'), _('لون الأزرار والعناصر النشطة.'));
		o.value('#7c5cff', _('بنفسجي ملكي'));
		o.value('#e5b95c', _('ذهبي'));
		o.value('#3b82f6', _('أزرق'));
		o.value('#10b981', _('أخضر زمردي'));
		o.value('#f43f5e', _('وردي أحمر'));
		o.value('#06b6d4', _('سماوي'));
		o.default = '#7c5cff';
		o.onchange = function (ev, sid, v) { root.style.setProperty('--qs-accent', v); root.style.setProperty('--primary-color-high', v); };

		s = m.section(form.NamedSection, 'theme', 'theme', _('صفحة تسجيل الدخول'));
		s.addremove = false;

		o = s.option(form.ListValue, 'login_bg_type', _('نوع خلفية الدخول'));
		o.value('none', _('افتراضي (تدرج متحرك)'));
		o.value('image', _('صورة'));
		o.value('video', _('فيديو'));
		o.default = 'none';

		o = s.option(form.Value, 'login_bg', _('مسار الخلفية'), _('مسار داخل /luci-static/ أو رابط https:// (صورة أو فيديو). تقدر ترفع من الأسفل.'));
		o.depends('login_bg_type', 'image');
		o.depends('login_bg_type', 'video');
		files.forEach(function (f) { o.value(BG_URL + '/' + f.name, f.name); });
		o.validate = function (sid, v) { return (!v || /^(\/luci-static\/|https?:\/\/)[A-Za-z0-9_\/.:%?&=+~@!,;-]+$/.test(v)) ? true : _('مسار غير صالح'); };

		o = s.option(form.Value, 'login_dim', _('تعتيم الخلفية (0 إلى 90)'), _('كلما زاد الرقم صارت الخلفية أغمق وأوضح للنص.'));
		o.datatype = 'range(0,90)';
		o.default = '45';
		o.depends('login_bg_type', 'image');
		o.depends('login_bg_type', 'video');

		return m.render().then(L.bind(function (node) {
			return E('div', {}, [ node, this.renderUpload(), this.renderLoginUpload() ]);
		}, this));
	}
});
