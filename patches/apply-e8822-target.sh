#!/bin/sh
set -e
OPENWRT_DIR="${1:-openwrt}"

cp patches/mt7621_zte_e8820v2.dts "$OPENWRT_DIR/target/linux/ramips/dts/mt7621_zte_e8820v2.dts"

if ! grep -q 'define Device/zte_e8820v2' "$OPENWRT_DIR/target/linux/ramips/image/mt7621.mk"; then
cat << 'MKEOF' >> "$OPENWRT_DIR/target/linux/ramips/image/mt7621.mk"

define Device/zte_e8820v2
  $(Device/dsa-migration)
  $(Device/uimage-lzma-loader)
  IMAGE_SIZE := 16064k
  DEVICE_VENDOR := ZTE
  DEVICE_MODEL := E8820V2
  DEVICE_VARIANT := 16M
  DEVICE_PACKAGES := kmod-mt7603 kmod-mt76x2 wpad-basic-mbedtls
endef
TARGET_DEVICES += zte_e8820v2
MKEOF
fi

NETFILE="$OPENWRT_DIR/target/linux/ramips/mt7621/base-files/etc/board.d/02_network"
if [ -f "$NETFILE" ] && ! grep -q 'zte,e8820v2' "$NETFILE"; then
	sed -i 's/ucidef_set_interfaces_lan_wan "lan1 lan2 lan3 lan4" "wan"/ucidef_set_interfaces_lan_wan "lan1 lan2 lan3 lan4" "wan"/' "$NETFILE"
fi

echo "ZTE E8820V2 / E8822 target registered cleanly for OpenWrt 25.12 / 24.10 / 23.05."
