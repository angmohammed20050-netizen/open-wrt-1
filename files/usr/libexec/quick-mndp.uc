#!/usr/bin/ucode
// MikroTik Neighbor Discovery Protocol (MNDP) broadcaster - Zero external dependencies
import * as fs from 'fs';
import * as socket from 'socket';
import * as uci from 'uci';

function u16be(n) {
	return chr((n >> 8) & 0xff) + chr(n & 0xff);
}
function u32le(n) {
	return chr(n & 0xff) + chr((n >> 8) & 0xff) + chr((n >> 16) & 0xff) + chr((n >> 24) & 0xff);
}
function tlv(type, val) {
	return u16be(type) + u16be(length(val)) + val;
}
function macBytes(s) {
	let parts = split(trim(s || ''), ':');
	if (length(parts) != 6) return '\x00\x00\x00\x00\x00\x00';
	let out = '';
	for (let p in parts) out += chr(int(p, 16) & 0xff);
	return out;
}
function ipv4Bytes(s) {
	let parts = split(trim(s || ''), '.');
	if (length(parts) != 4) return null;
	let out = '';
	for (let p in parts) out += chr(int(p) & 0xff);
	return out;
}
function getMac(iface) {
	let m = fs.readfile('/sys/class/net/' + iface + '/address');
	return m ? trim(m) : '00:00:00:00:00:00';
}
function getIp(iface) {
	let p = fs.popen('ip -4 -o addr show dev ' + iface + ' 2>/dev/null');
	if (!p) return null;
	let txt = p.read('all');
	p.close();
	let m = match(txt || '', /inet ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
	return m ? m[1] : null;
}
function getUptime() {
	let u = fs.readfile('/proc/uptime');
	return u ? int(split(trim(u), '.')[0]) : 0;
}

function sendOnce(seq) {
	let c = uci.cursor();
	let enabled = c.get('quick', 'neighbors', 'mndp_enable');
	if (ARGV[0] == 'daemon' && enabled != '1') return;

	let iface = c.get('quick', 'neighbors', 'iface') || 'br-lan';
	let ident = c.get('quick', 'neighbors', 'identity') || 'ZTE-E8822-Quick';
	let plat  = c.get('quick', 'neighbors', 'platform') || 'ZTE E8822';
	let mac   = getMac(iface);
	let ip    = getIp(iface);
	let up    = getUptime();

	let pkt = '\x00\x00' + u16be(seq & 0xffff);
	pkt += tlv(1, macBytes(mac));
	pkt += tlv(5, ident);
	pkt += tlv(7, 'OpenWrt Quick Pro');
	pkt += tlv(8, plat);
	pkt += tlv(10, u32le(up));
	pkt += tlv(11, 'QUICK-PRO');
	pkt += tlv(12, plat);
	pkt += tlv(16, iface);
	if (ip) {
		let ib = ipv4Bytes(ip);
		if (ib) pkt += tlv(17, ib);
	}

	let s = socket.create(socket.AF_INET, socket.SOCK_DGRAM, 0);
	if (!s) return;
	s.setopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1);
	s.sendto(pkt, { address: '255.255.255.255', port: 5678 });
	s.close();
}

if (ARGV[0] == 'once') {
	sendOnce(1);
} else {
	let seq = 1;
	while (true) {
		sendOnce(seq++);
		let c = uci.cursor();
		let iv = int(c.get('quick', 'neighbors', 'interval') || '60');
		if (iv < 10) iv = 10;
		if (iv > 600) iv = 600;
		sleep(iv * 1000);
	}
}
