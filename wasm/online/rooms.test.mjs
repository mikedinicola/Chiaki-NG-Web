import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Rooms } from "./rooms.mjs";
import "../www/online-protocol.js";

const key = "a".repeat(64), turn = "b".repeat(64);
function harness() {
	let now = 100000;
	const hub = new Rooms({ hostKey: key, turnSecret: turn, turnUrls: ["turn:play.example.com:3478?transport=udp"], now: () => now });
	const client = () => { const c = { messages: [], send(m) { this.messages.push(m); }, close() { this.disconnected = true; } }; hub.connect(c); return c; };
	const host = client(); hub.message(host, { type: "create", hostKey: key, minutes: 5 });
	const room = host.room;
	const join = (name = "Friend") => { const guest = client(); hub.message(guest, { type: "join", token: room.token, name }); return guest; };
	return { hub, host, room, client, join, tick(ms) { now += ms; hub.expire(); } };
}

test("a valid host key is required, and guests cannot become hosts or skip approval", () => {
	const h = harness(), stranger = h.client();
	assert.throws(() => h.hub.message(stranger, { type: "create", hostKey: "wrong" }), /authentication/);
	const guest = h.join();
	for (const msg of [{ type: "offer", sdp: { type: "offer", sdp: "x" } }, { type: "answer", sdp: { type: "answer", sdp: "x" } }, { type: "approve", id: guest.id, role: "play" }, { type: "revoke" }]) assert.throws(() => h.hub.message(guest, msg), /not allowed/);
	assert.deepEqual(guest.messages, [{ type: "waiting" }]);
});

test("approval grants bounded credentials, only one controller and explicit role changes", () => {
	const h = harness(), one = h.join(), two = h.join();
	h.hub.message(h.host, { type: "approve", id: one.id, role: "play" });
	h.hub.message(h.host, { type: "approve", id: two.id, role: "play" });
	assert.equal(one.role, "watch"); assert.equal(two.role, "play");
	const approval = two.messages.find((m) => m.type === "approved");
	const ice = approval.iceServers[0];
	assert.equal(Number(ice.username.split(":")[0]), Math.ceil(h.room.expires / 1000));
	assert.equal(ice.credential, crypto.createHmac("sha1", turn).update(ice.username).digest("base64"));
	assert.ok(!JSON.stringify(two.messages).includes(turn));
});

test("room isolation, bounded SDP/ICE, role validation and signaling identity", () => {
	const h = harness(), guest = h.join(), other = h.client();
	h.hub.message(other, { type: "create", hostKey: key });
	assert.throws(() => h.hub.message(other, { type: "approve", id: guest.id, role: "play" }), /unavailable/);
	assert.throws(() => h.hub.message(h.host, { type: "approve", id: guest.id, role: "owner" }), /permission/);
	h.hub.message(h.host, { type: "approve", id: guest.id, role: "watch" });
	assert.throws(() => h.hub.message(guest, { type: "ice", candidate: { candidate: "x".repeat(2049) } }), /candidate/);
	h.hub.message(guest, { type: "answer", id: "spoofed", sdp: { type: "answer", sdp: "fixture" } });
	assert.equal(h.host.messages.at(-1).id, guest.id);
});

test("kicks, revocation, host loss and expiry terminate existing access", () => {
	for (const action of ["kick", "revoke", "disconnect", "expire"]) {
		const h = harness(), guest = h.join(); h.hub.message(h.host, { type: "approve", id: guest.id, role: "play" });
		if (action === "disconnect") h.hub.disconnect(h.host);
		else if (action === "expire") h.tick(300001);
		else h.hub.message(h.host, { type: action, id: guest.id });
		assert.equal(guest.closed, true); assert.equal(guest.disconnected, true);
		if (action !== "kick") { assert.equal(h.hub.rooms.size, 0); assert.throws(() => h.hub.message(h.client(), { type: "join", token: h.room.token }), /unavailable/); }
	}
});

test("pending guest and room limits prevent unbounded room allocation", () => {
	const h = harness(); for (let i = 0; i < 4; i++) h.join();
	assert.throws(() => h.join(), /full/);
	h.tick(60001); assert.equal(h.room.guests.size, 0);
	const unauth = h.client(); h.tick(10001); assert.equal(unauth.closed, true);
});

test("remote pad input clamps values and excludes system buttons", () => {
	assert.deepEqual(ChiakiOnlineProtocol.pad({ type: "pad", buttons: 65535, lx: Infinity, ly: -999999, rx: "bad", ry: 999999, l2: -1, r2: 999 }), { buttons: 4095, lx: 0, ly: -32767, rx: 0, ry: 32767, l2: 0, r2: 255 });
	assert.equal(ChiakiOnlineProtocol.pad({ type: "shell" }), null);
	for (const url of ["http://example.com", "https://name:password@example.com", "https://example.com/path", "https://example.com/?token=x"]) assert.throws(() => ChiakiOnlineProtocol.url(url));
	assert.equal(ChiakiOnlineProtocol.url("https://play.example.com"), "https://play.example.com");
});

test("spectators, old control leases and out-of-order controller frames cannot inject input", () => {
	const p = { approved: true, role: "watch", lease: "first", lastSeq: 0 };
	const msg = { type: "pad", lease: "first", seq: 1, buttons: 1 };
	assert.equal(ChiakiOnlineProtocol.input(p, msg, 100), false);
	p.role = "play"; assert.equal(ChiakiOnlineProtocol.input(p, msg, 100), true);
	assert.equal(ChiakiOnlineProtocol.input(p, msg, 110), false);
	assert.equal(ChiakiOnlineProtocol.input(p, { ...msg, seq: 2, buttons: 0 }, 120), true);
	assert.equal(ChiakiOnlineProtocol.input(p, msg, 130), false); assert.equal(p.input.buttons, 0);
	p.lease = "second"; assert.equal(ChiakiOnlineProtocol.input(p, { ...msg, seq: 999 }, 140), false);
});
