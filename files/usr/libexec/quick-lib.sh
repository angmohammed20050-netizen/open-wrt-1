# مكتبة مشتركة بين quick-apply و quick-ctl  (تُحمَّل بـ  . /usr/libexec/quick-lib.sh)
QUICK_CONF="${QUICK_CONF:-/etc/config/quick}"
QUICK_STATE="${QUICK_STATE:-/tmp/quick}"
QUICK_LIBDIR="${QUICK_LIBDIR:-/usr/libexec}"
mkdir -p "$QUICK_STATE" 2>/dev/null

quick_load() { DUMP=$(awk -f "$QUICK_LIBDIR/quick-uci.awk" "$QUICK_CONF" 2>/dev/null); }

# cget <section> <key> [default]
cget() {
	_v=$(printf '%s\n' "$DUMP" | awk -F'\t' -v s="$1" -v k="$2" '$2==s && $3==k {v=$4} END{print v}')
	if [ -n "$_v" ]; then printf '%s' "$_v"; else printf '%s' "$3"; fi
}

# cforeach <type>  : يطبع أسماء الأقسام
cforeach() { printf '%s\n' "$DUMP" | awk -F'\t' -v t="$1" '$1==t && $3=="." {print $2}'; }

valid_ip()    { printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$' && printf '%s' "${1%%/*}" | awk -F. '{ for(i=1;i<=4;i++) if ($i>255) exit 1 }'; }
valid_iface() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9_.-]{1,15}$'; }
valid_host()  { [ -n "$1" ] && printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._:-]{1,253}$' && [ "${1#-}" = "$1" ]; }
is_uint()     { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }
