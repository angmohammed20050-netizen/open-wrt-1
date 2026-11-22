'use strict';
'require baseclass';

/* محلل القنوات: يحسب ازدحام كل قناة من نتائج مسح الشبكات المجاورة ويرشّح الأفضل */
return baseclass.extend({
	bandOf: function (mhz) { return mhz < 3000 ? '2.4' : (mhz < 5925 ? '5' : '6'); },

	chanToMhz: function (band, ch) {
		if (band === '2.4') return ch === 14 ? 2484 : 2407 + 5 * ch;
		if (band === '6') return 5950 + 5 * ch;
		return 5000 + 5 * ch;
	},

	isDfs: function (band, ch) { return band === '5' && ch >= 52 && ch <= 144; },

	/* nets: [{channel, signal, ssid, bssid}] ، freqs: [{channel, mhz, restricted}] ،
	   opts: {width (20/40/80/160), current (قناة حالية), own: [bssid...]} */
	analyze: function (nets, freqs, opts) {
		opts = opts || {};
		var self = this;
		var width = +opts.width || 20;
		var own = (opts.own || []).map(function (b) { return String(b).toUpperCase(); });

		var cands = (freqs || []).filter(function (f) { return !f.restricted && f.channel > 0; });
		if (!cands.length) return null;
		var band = this.bandOf(cands[0].mhz);

		var list = (nets || []).filter(function (n) {
			return n && n.channel > 0 && own.indexOf(String(n.bssid || '').toUpperCase()) < 0;
		});

		var rows = cands.map(function (c) {
			var score = 0, count = 0, strongest = -120;
			list.forEach(function (n) {
				var d = Math.abs(c.mhz - self.chanToMhz(band, n.channel));
				var half = (width + 20) / 2;
				var factor = d >= half ? 0 : 1 - d / half;
				if (factor <= 0) return;
				var sig = Math.max(-100, Math.min(-20, +n.signal || -90));
				score += factor * Math.pow(10, (sig + 95) / 10);
				if (factor >= 0.5) { count++; if (sig > strongest) strongest = sig; }
			});
			var db = 10 * Math.log10(1 + score);
			var pct = Math.min(100, Math.round(db / 60 * 100));
			var dfs = self.isDfs(band, c.channel);
			var pen = 0;
			if (dfs) pen += 6;                                           /* DFS: قد يتوقف الراديو عند رصد رادار */
			if (band === '2.4' && [1, 6, 11].indexOf(c.channel) < 0) pen += 4; /* قنوات غير متعامدة تتداخل مع غيرها */
			return {
				ch: c.channel, mhz: c.mhz, score: score, db: db, pct: pct, count: count, strongest: strongest,
				dfs: dfs, rank: db + pen, level: pct < 25 ? 0 : (pct < 50 ? 1 : (pct < 75 ? 2 : 3))
			};
		}).sort(function (a, b) { return a.ch - b.ch; });

		/* عرض 40/80 ميغا: لا يصلح إلا لقنوات يمكن أن تكون رئيسية — نكتفي بترتيب القنوات حسب rank */
		var ranked = rows.slice().sort(function (a, b) { return a.rank - b.rank || a.ch - b.ch; });
		var best = ranked[0];
		var cur = null;
		rows.forEach(function (r) { if (r.ch === +opts.current) cur = r; });

		/* إذا الحالية قريبة من الأفضل لا داعي للتغيير */
		var stay = !!(cur && cur.rank - best.rank < 2);
		return { band: band, rows: rows, ranked: ranked, best: best, current: cur, stay: stay, nets: list, width: width };
	},

	levelName: function (lv) { return [ _('مثالية'), _('جيدة'), _('مزدحمة'), _('مزدحمة جداً') ][lv] || ''; }
});
