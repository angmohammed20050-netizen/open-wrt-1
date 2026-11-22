# يقرأ ملف UCI البسيط ويطبع:  type <TAB> section <TAB> key <TAB> value
# سطر "config" يطبع المفتاح "."  ، والأقسام غير المسمّاة تصير  type#N
function unq(s,   q) {
	sub(/^[ \t]+/, "", s); sub(/[ \t\r]+$/, "", s)
	q = substr(s, 1, 1)
	if ((q == "'" || q == "\"") && length(s) >= 2 && substr(s, length(s), 1) == q)
		s = substr(s, 2, length(s) - 2)
	return s
}
{ sub(/\r$/, "") }
/^[ \t]*(#|$)/ { next }
{
	line = $0; sub(/^[ \t]+/, "", line)
	kw = line; sub(/[ \t].*$/, "", kw)
	rest = ""
	if (match(line, /[ \t]+/)) rest = substr(line, RSTART + RLENGTH)

	if (kw == "config") {
		t = rest; sub(/[ \t].*$/, "", t)
		nm = ""
		if (match(rest, /[ \t]+/)) nm = unq(substr(rest, RSTART + RLENGTH))
		if (nm == "") { sec = t "#" (cnt[t] + 0); cnt[t]++ } else sec = nm
		print t "\t" sec "\t.\t"
	} else if (kw == "option" || kw == "list") {
		k = rest; sub(/[ \t].*$/, "", k)
		v = ""
		if (match(rest, /[ \t]+/)) v = unq(substr(rest, RSTART + RLENGTH))
		print t "\t" sec "\t" k "\t" v
	}
}
