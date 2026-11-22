#!/bin/sh
# يطبّق /etc/config/quick على النظام.

QUICK_LIBDIR="${QUICK_LIBDIR:-/usr/libexec}"
. "$QUICK_LIBDIR/quick-lib.sh"
quick_load

DRY="${QUICK_DRY:-0}"
THEME_OUT="${QUICK_THEME_OUT:-/www/luci-static/quick/theme.json}"
log() { [ "$DRY" = 1 ] && echo "$*" >&2 || logger -t quick "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- theme ----
apply_theme() {
	local layout shape style bgt c1 c2 blur img accent lbt lbg ldim clock bblk
	layout=$(cget theme menu_layout side)
	case "$layout" in side|top|float|stack|present) ;; *) layout=side ;; esac
	shape=$(cget theme icon_shape squircle)
	case "$shape" in circle|squircle|square|hex) ;; *) shape=squircle ;; esac
	style=$(cget theme icon_style glass)
	case "$style" in glass|flat|outline) ;; *) style=glass ;; esac
	bgt=$(cget theme bg_type gradient)
	case "$bgt" in gradient|solid|image) ;; *) bgt=gradient ;; esac

	c1=$(cget theme bg_color1 '#0f172a' | tr -cd '#0-9a-fA-F')
	c2=$(cget theme bg_color2 '#1e3a8a' | tr -cd '#0-9a-fA-F')
	case "$(cget theme bg_preset custom)" in
		royal)    c1='#0a0a1f'; c2='#3b1f7a' ;;
		gold)     c1='#140d03'; c2='#6b4511' ;;
		obsidian) c1='#050507'; c2='#1f1f2e' ;;
		ocean)    c1='#0f172a'; c2='#1e3a8a' ;;
		sunset)   c1='#7c2d12'; c2='#be185d' ;;
		forest)   c1='#052e16'; c2='#166534' ;;
		aurora)   c1='#1e1b4b'; c2='#0f766e' ;;
		midnight) c1='#020617'; c2='#312e81' ;;
		rose)     c1='#4c0519'; c2='#9d174d' ;;
		graphite) c1='#111827'; c2='#374151' ;;
	esac
	printf '%s' "$c1" | grep -Eq '^#[0-9a-fA-F]{3,8}$' || c1='#0f172a'
	printf '%s' "$c2" | grep -Eq '^#[0-9a-fA-F]{3,8}$' || c2='#1e3a8a'

	blur=$(cget theme blur 14)
	is_uint "$blur" || blur=14
	[ "$blur" -gt 40 ] && blur=40

	img=$(cget theme bg_image '' | tr -d '"\\ ()'"'"'\r\n')
	case "$img" in ''|/luci-static/*) ;; *) img='' ;; esac

	accent=$(cget theme accent '#7c5cff' | tr -cd '#0-9a-fA-F')
	printf '%s' "$accent" | grep -Eq '^#[0-9a-fA-F]{6}$' || accent='#7c5cff'

	lbt=$(cget theme login_bg_type none)
	case "$lbt" in image|video) ;; *) lbt=none ;; esac
	lbg=$(cget theme login_bg '' | tr -cd 'A-Za-z0-9_/.:%?&=+~@!,;-')
	case "$lbg" in /luci-static/*|http://*|https://*) ;; *) lbg=''; lbt=none ;; esac
	ldim=$(cget theme login_dim 45)
	is_uint "$ldim" || ldim=45
	[ "$ldim" -gt 90 ] && ldim=90

	clock=$(cget protect customer_lock 0)
	bblk=$(cget protect block_backup 1)

	mkdir -p "$(dirname "$THEME_OUT")"
	cat > "$THEME_OUT" <<EOF
{"menu_layout":"$layout","icon_shape":"$shape","icon_style":"$style","bg_type":"$bgt","bg_color1":"$c1","bg_color2":"$c2","bg_image":"$img","blur":$blur,"accent":"$accent","login_bg_type":"$lbt","login_bg":"$lbg","login_dim":$ldim,"customer_lock":$([ "$clock" = 1 ] && echo true || echo false),"block_backup":$([ "$bblk" = 1 ] && echo true || echo false)}
EOF
	chmod 644 "$THEME_OUT" 2>/dev/null
}

# --------------------------------------------- limits + dns + loop (nft) ----
apply_limits() {
	local f="$QUICK_STATE/quick.nft" lan i=0 s ip down up quota nlimits=0
	local loop_en storm_en storm_pps mcast_pps
	lan=$(cget main lan_if br-lan)
	valid_iface "$lan" || lan=br-lan

	loop_en=$(cget loop enabled 1)
	storm_en=$(cget loop storm_enable 1)
	storm_pps=$(cget loop storm_pps 150); is_uint "$storm_pps" || storm_pps=150
	[ "$storm_pps" -lt 10 ] && storm_pps=10
	mcast_pps=$(cget loop mcast_pps 250); is_uint "$mcast_pps" || mcast_pps=250
	[ "$mcast_pps" -lt 10 ] && mcast_pps=10

	{
		echo "table inet quick"
		echo "delete table inet quick"
		echo "table inet quick {"

		for s in $(cforeach limit); do
			[ "$(cget "$s" enabled 1)" = 1 ] || continue
			ip=$(cget "$s" ip ''); valid_ip "$ip" || continue
			quota=$(cget "$s" quota_mb 0); is_uint "$quota" || quota=0
			[ "$quota" -gt 0 ] && echo "	quota q$i { over $quota mbytes }"
			i=$((i + 1))
		done

		echo "	chain acct { type filter hook forward priority -10; policy accept; }"
		echo "	chain ratelimit { type filter hook forward priority -5; policy accept;"

		i=0
		for s in $(cforeach limit); do
			[ "$(cget "$s" enabled 1)" = 1 ] || continue
			ip=$(cget "$s" ip ''); valid_ip "$ip" || continue
			down=$(cget "$s" down_kbps 0); is_uint "$down" || down=0
			up=$(cget "$s" up_kbps 0);     is_uint "$up"   || up=0
			quota=$(cget "$s" quota_mb 0); is_uint "$quota" || quota=0
			nlimits=$((nlimits + 1))

			if [ "$quota" -gt 0 ]; then
				echo "		ip saddr $ip quota name \"q$i\" drop"
				echo "		ip daddr $ip quota name \"q$i\" drop"
			fi
			if [ "$down" -gt 0 ]; then
				kb=$((down / 8)); [ "$kb" -lt 1 ] && kb=1
				echo "		ip daddr $ip limit rate over $kb kbytes/second burst $((kb * 2)) kbytes drop"
			fi
			if [ "$up" -gt 0 ]; then
				kb=$((up / 8)); [ "$kb" -lt 1 ] && kb=1
				echo "		ip saddr $ip limit rate over $kb kbytes/second burst $((kb * 2)) kbytes drop"
			fi
			i=$((i + 1))
		done
		echo "	}"

		if [ "$loop_en" = 1 ] && [ "$storm_en" = 1 ]; then
			echo "	chain loopguard { type filter hook input priority -15; policy accept;"
			echo "		iifname \"$lan\" pkttype broadcast limit rate over $storm_pps/second burst $((storm_pps * 2)) packets counter drop"
			echo "		iifname \"$lan\" pkttype multicast limit rate over $mcast_pps/second burst $((mcast_pps * 2)) packets counter drop"
			echo "	}"
		fi

		if [ "$(cget main force_dns 0)" = 1 ]; then
			echo "	chain dnsredir { type nat hook prerouting priority -105; policy accept;"
			echo "		iifname \"$lan\" udp dport 53 redirect to :53"
			echo "		iifname \"$lan\" tcp dport 53 redirect to :53"
			echo "	}"
		fi
		if [ "$(cget main block_dot 0)" = 1 ]; then
			echo "	chain dot { type filter hook forward priority -6; policy accept;"
			echo "		iifname \"$lan\" tcp dport 853 drop"
			echo "	}"
		fi
		echo "}"
	} > "$f"

	[ "$DRY" = 1 ] && return 0
	if have nft; then
		if nft -f "$f" 2>"$QUICK_STATE/nft.err"; then
			"$QUICK_LIBDIR/quick-ctl" ensure >/dev/null 2>&1
		else
			log "nft load failed: $(cat "$QUICK_STATE/nft.err")"
		fi
	fi

	# STP on bridge
	local stp_want=$(cget loop stp 1)
	[ "$loop_en" != 1 ] && stp_want=0
	if [ -w "/sys/class/net/$lan/bridge/stp_state" ]; then
		echo "$stp_want" > "/sys/class/net/$lan/bridge/stp_state" 2>/dev/null
	fi

	if [ "$nlimits" -gt 0 ] && [ "$(cget main offload_auto 1)" = 1 ] && have uci; then
		if [ "$(uci -q get firewall.@defaults[0].flow_offloading)" = 1 ]; then
			uci -q set firewall.@defaults[0].flow_offloading=0
			uci -q set firewall.@defaults[0].flow_offloading_hw=0
			uci -q commit firewall
			/etc/init.d/firewall reload >/dev/null 2>&1
		fi
	fi
}

# ------------------------------------------------------- site blocking ----
apply_blocks() {
	local out="${QUICK_DNSMASQ_FILE:-/tmp/dnsmasq.d/quick-block.conf}" tmp s url host
	tmp="$QUICK_STATE/block.conf"
	: > "$tmp"
	for s in $(cforeach block); do
		[ "$(cget "$s" enabled 1)" = 1 ] || continue
		url=$(cget "$s" url '')
		host=$(printf '%s' "$url" | tr 'A-Z' 'a-z' | sed 's#^[a-z][a-z0-9+.-]*://##; s#[/?\#].*$##; s#^.*@##; s#:[0-9]*$##; s#^www\.##')
		printf '%s' "$host" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' || continue
		echo "address=/$host/" >> "$tmp"
	done

	[ "$DRY" = 1 ] && { cp "$tmp" "$out" 2>/dev/null; return 0; }
	mkdir -p "$(dirname "$out")"
	if ! cmp -s "$tmp" "$out" 2>/dev/null; then
		if [ -s "$tmp" ]; then cp "$tmp" "$out"; else rm -f "$out"; fi
		[ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq restart >/dev/null 2>&1
	fi
}

# ----------------------------------------------------------- resetbtn ----
apply_resetbtn() {
	[ "$DRY" = 1 ] && return 0
	local mode hold btn="/etc/rc.button/reset" orig="/etc/rc.button/reset.orig"
	mode=$(cget resetbtn mode normal)
	hold=$(cget resetbtn hold_secs 5); is_uint "$hold" || hold=5
	[ "$hold" -lt 2 ] && hold=2
	[ "$hold" -gt 30 ] && hold=30

	[ -f "$btn" ] && [ ! -f "$orig" ] && cp "$btn" "$orig" 2>/dev/null

	case "$mode" in
		disabled)
			cat > "$btn" <<'EOF'
#!/bin/sh
# Quick Pro: Reset button disabled
logger -t quick "Reset button pressed (ignored - disabled by Quick Pro)"
exit 0
EOF
			chmod 755 "$btn"
			;;
		reboot_only)
			cat > "$btn" <<'EOF'
#!/bin/sh
# Quick Pro: Reboot only (Factory Reset blocked)
[ "${ACTION}" = "released" ] || exit 0
logger -t quick "Reset button pressed -> rebooting (factory reset blocked)"
sync
reboot
EOF
			chmod 755 "$btn"
			;;
		*)
			if [ -f "$orig" ]; then
				cp "$orig" "$btn"
				chmod 755 "$btn"
			else
				cat > "$btn" <<EOF
#!/bin/sh
. /lib/functions.sh
[ "\${ACTION}" = "released" ] || exit 0
if [ "\$SEEN" -lt $hold ]; then
	sync && reboot
else
	jffs2reset -y && reboot &
fi
EOF
				chmod 755 "$btn"
			fi
			;;
	esac
}

# ------------------------------------------------------------ protect ----
apply_protect() {
	[ "$DRY" = 1 ] && return 0
	local lcgi=$(cget protect lock_cgi_backup 1)
	if [ -f /www/cgi-bin/cgi-backup ]; then
		if [ "$lcgi" = 1 ]; then
			chmod 000 /www/cgi-bin/cgi-backup 2>/dev/null
		else
			chmod 755 /www/cgi-bin/cgi-backup 2>/dev/null
		fi
	fi
	if [ "$(cget protect lock_ssh_lan 0)" = 1 ] && have uci; then
		uci -q set dropbear.@dropbear[0].Interface='lan'
		uci -q commit dropbear
		/etc/init.d/dropbear reload >/dev/null 2>&1
	fi
}

# -------------------------------------------- perf + reboot + wifisched ----
apply_perf() {
	local cron="${QUICK_CRONTAB:-/etc/crontabs/root}" sysf="${QUICK_SYSCTL_FILE:-/etc/sysctl.d/99-quick.conf}"
	local expr ct

	mkdir -p "$(dirname "$cron")" 2>/dev/null
	touch "$cron"
	grep -Ev '# quick-(clean|reboot|wifi|clients)' "$cron" > "$QUICK_STATE/cron.new" 2>/dev/null

	# 1. Auto Clean
	if [ "$(cget perf clean_enable 0)" = 1 ]; then
		expr=$(cget perf clean_cron '0 4 * * *')
		if printf '%s' "$expr" | grep -Eq '^[0-9*/,-]+( [0-9*/,-]+){4}$'; then
			echo "$expr $QUICK_LIBDIR/quick-ctl clean auto >/dev/null 2>&1 # quick-clean" >> "$QUICK_STATE/cron.new"
		fi
	fi

	# 2. Scheduled Reboot (with OpenWrt anti-reboot-loop safeguard)
	if [ "$(cget reboot enabled 0)" = 1 ]; then
		local rmode=$(cget reboot mode daily)
		local rh=$(cget reboot hour 4); is_uint "$rh" || rh=4
		local rm=$(cget reboot minute 0); is_uint "$rm" || rm=0
		local rw=$(cget reboot weekday 0); is_uint "$rw" || rw=0
		local rexpr=""
		case "$rmode" in
			daily)  rexpr="$rm $rh * * *" ;;
			weekly) rexpr="$rm $rh * * $rw" ;;
			custom) rexpr=$(cget reboot custom_cron '0 4 * * *') ;;
		esac
		if printf '%s' "$rexpr" | grep -Eq '^[0-9*/,-]+( [0-9*/,-]+){4}$'; then
			echo "$rexpr sleep 70 && touch /etc/banner && reboot # quick-reboot" >> "$QUICK_STATE/cron.new"
		fi
	fi

	# 3. WiFi Schedule
	if [ "$(cget wifisched enabled 0)" = 1 ]; then
		local wt=$(cget wifisched target all)
		local offh=$(cget wifisched off_hour 2); is_uint "$offh" || offh=2
		local offm=$(cget wifisched off_min 0); is_uint "$offm" || offm=0
		local onh=$(cget wifisched on_hour 7); is_uint "$onh" || onh=7
		local onm=$(cget wifisched on_min 0); is_uint "$onm" || onm=0
		local wdays=$(cget wifisched days '*')
		printf '%s' "$wdays" | grep -Eq '^[0-9*,/-]+$' || wdays='*'
		echo "$offm $offh * * $wdays $QUICK_LIBDIR/quick-ctl wifi-toggle off $wt >/dev/null 2>&1 # quick-wifi" >> "$QUICK_STATE/cron.new"
		echo "$onm $onh * * $wdays $QUICK_LIBDIR/quick-ctl wifi-toggle on $wt >/dev/null 2>&1 # quick-wifi" >> "$QUICK_STATE/cron.new"
	fi

	# 4. Periodic clients log snapshot (every 5 minutes)
	echo "*/5 * * * * $QUICK_LIBDIR/quick-ctl clients-log >/dev/null 2>&1 # quick-clients" >> "$QUICK_STATE/cron.new"

	if ! cmp -s "$QUICK_STATE/cron.new" "$cron"; then
		cp "$QUICK_STATE/cron.new" "$cron"
		[ "$DRY" = 1 ] || { [ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1; }
	fi

	# --- sysctl ---
	: > "$QUICK_STATE/sysctl.new"
	ct=$(cget perf conntrack_max '')
	if [ -n "$ct" ] && is_uint "$ct" && [ "$ct" -ge 1024 ] && [ "$ct" -le 4194304 ]; then
		echo "net.netfilter.nf_conntrack_max=$ct" >> "$QUICK_STATE/sysctl.new"
	fi
	if [ "$(cget perf bbr 0)" = 1 ]; then
		echo "net.core.default_qdisc=fq" >> "$QUICK_STATE/sysctl.new"
		echo "net.ipv4.tcp_congestion_control=bbr" >> "$QUICK_STATE/sysctl.new"
	fi
	mkdir -p "$(dirname "$sysf")" 2>/dev/null
	if [ -s "$QUICK_STATE/sysctl.new" ]; then
		cp "$QUICK_STATE/sysctl.new" "$sysf"
		if [ "$DRY" != 1 ]; then
			[ "$(cget perf bbr 0)" = 1 ] && modprobe tcp_bbr 2>/dev/null
			sysctl -q -p "$sysf" >/dev/null 2>&1
		fi
	else
		rm -f "$sysf"
	fi
}

# ---------------------------------------------------------- neighbors ----
apply_neighbors() {
	[ "$DRY" = 1 ] && return 0
	if [ -x /etc/init.d/lldpd ]; then
		if [ "$(cget neighbors lldp_enable 0)" = 1 ]; then
			uci -q set lldpd.config.enable_lldp='1'
			uci -q set lldpd.config.enable_cdp='1'
			uci -q set lldpd.config.lldp_description="$(cget neighbors platform 'ZTE E8822') - Quick Pro"
			uci -q commit lldpd
			/etc/init.d/lldpd enable >/dev/null 2>&1
			/etc/init.d/lldpd restart >/dev/null 2>&1
		else
			/etc/init.d/lldpd stop >/dev/null 2>&1
		fi
	fi
}

case "${1:-all}" in
	theme)     apply_theme ;;
	limits)    apply_limits ;;
	blocks)    apply_blocks ;;
	resetbtn)  apply_resetbtn ;;
	protect)   apply_protect ;;
	neighbors) apply_neighbors ;;
	perf)      apply_perf ;;
	all)       apply_theme; apply_limits; apply_blocks; apply_resetbtn; apply_protect; apply_neighbors; apply_perf ;;
	*)         echo "usage: $0 [all|theme|limits|blocks|resetbtn|protect|neighbors|perf]" >&2; exit 1 ;;
esac
exit 0
