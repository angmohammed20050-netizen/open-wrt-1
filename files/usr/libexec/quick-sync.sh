#!/bin/sh
# Quick Royal: تنظيف بقايا النسخ القديمة وتفعيل الثيم.
#   quick-sync.sh            (تنظيف فقط)
#   quick-sync.sh activate   (تنظيف + تفعيل الثيم)

MEDIA=/www/luci-static/quick

# النسخ القديمة كانت تربط ملفات bootstrap كروابط رمزية داخل مجلد الثيم
[ -d "$MEDIA" ] && find "$MEDIA" -maxdepth 1 -type l -exec rm -f {} + 2>/dev/null
# قوالب Lua القديمة المنسوخة من bootstrap
rm -rf /usr/lib/lua/luci/view/themes/quick 2>/dev/null

[ -f /usr/share/ucode/luci/template/themes/quick/header.ut ] || \
	echo "تنبيه: قوالب ucode غير موجودة، الثيم يحتاج LuCI حديث (OpenWrt 22.03 أو أحدث)." >&2

if [ "$1" = "activate" ]; then
	uci -q set luci.themes.Quick=/luci-static/quick
	uci -q set luci.main.mediaurlbase=/luci-static/quick
	uci -q commit luci
fi

rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null
exit 0
