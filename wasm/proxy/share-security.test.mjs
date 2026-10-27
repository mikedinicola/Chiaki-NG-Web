import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createShareHub } from "./share.mjs";

class Socket extends EventEmitter {
	writableLength = 0; writes = []; destroyed = false;
	write(data) { this.writes.push(data); }
	destroy() { this.destroyed = true; this.emit("close"); }
	end() { this.destroy(); }
}
function input(value) {
	const p = Buffer.from(JSON.stringify(value)), mask = Buffer.from([1,2,3,4]);
	const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0xfe; header.writeUInt16BE(p.length, 2);
	for (let i = 0; i < p.length; i++) p[i] ^= mask[i % 4]; return Buffer.concat([header, mask, p]);
}
function decode(b) {
	if (b.length < 4) return null;
	const length = b.readUInt16BE(2), offset = 8;
	if (b.length < offset + length) return null;
	const p = Buffer.from(b.subarray(offset, offset + length));
	for (let i = 0; i < p.length; i++) p[i] ^= b[4 + i % 4];
	return { opcode: b[0] & 15, payload: p, rest: b.subarray(offset + length) };
}
function messages(socket) {
	return socket.writes.filter(Buffer.isBuffer).map((b) => JSON.parse(b.subarray(b[1] === 126 ? 4 : 2).toString()));
}
function harness(t, rights = {}) {
	const share = { token: "test-invite", active: true, ...rights }; let localCalls = 0;
	const store = { getShareByToken: () => share, getShareByUser: () => share, shareLanguage: () => "en", userBySession: (token) => token === "valid" ? { id: 1 } : null, ensureLocalUser() { localCalls++; return { id: 1 }; } };
	const hub = createShareHub({ store, decodeWsFrame: decode, wsAccept: () => "fixture", readCookie: (req) => req.cookie });
	t.after(() => hub.close());
	const attach = (url, cookie) => { const socket = new Socket(); hub.attach({ url, cookie, headers: { "sec-websocket-key": "fixture" }, socket: { remoteAddress: "127.0.0.1" } }, socket); return socket; };
	return { hub, attach, share, get localCalls() { return localCalls; } };
}

test("legacy sharing never substitutes a local account when host authentication fails", (t) => {
	const h = harness(t); const invalid = h.attach("/share-sig", "invalid");
	assert.equal(invalid.destroyed, true); assert.equal(h.localCalls, 0);
});

test("legacy spectators cannot forward pad input, and revoked links close existing guests", (t) => {
	const h = harness(t), host = h.attach("/share-sig", "valid"), guest = h.attach("/share-sig?token=test-invite");
	const before = messages(host).length; guest.emit("data", input({ type: "pad", buttons: 65535 }));
	assert.equal(messages(host).length, before);
	h.share.active = false; guest.emit("data", input({ type: "pad" })); assert.equal(guest.destroyed, true);
});

test("legacy input is clamped and system buttons blocked; oversized buffers are closed", (t) => {
	const h = harness(t, { gamepad: true }), host = h.attach("/share-sig", "valid"), guest = h.attach("/share-sig?token=test-invite");
	guest.emit("data", input({ type: "pad", buttons: 65535, lx: 999999, l2: -9 }));
	const pad = messages(host).at(-1); assert.equal(pad.buttons, 4095); assert.equal(pad.lx, 32767); assert.equal(pad.l2, 0);
	guest.emit("data", Buffer.alloc(65537)); assert.equal(guest.destroyed, true);
});
