import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createOnlineServer } from "./server.mjs";

const hostKey = "a".repeat(64);
async function harness(t) {
	// Reserve a port before creating the origin-bound broker.
	const net = await import("node:net"); const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
	const port = probe.address().port; await new Promise((r) => probe.close(r));
	const origin = `http://127.0.0.1:${port}`;
	const broker = createOnlineServer({ origin, hostKey, allowLocal: true });
	broker.server.listen(port, "127.0.0.1"); await once(broker.server, "listening"); t.after(() => broker.close());
	async function connect(from = origin) {
		const ws = new WebSocket(origin.replace("http", "ws") + "/online", { origin: from });
		const messages = [], waiters = [];
		ws.on("message", (raw) => { const m = JSON.parse(raw); const i = waiters.findIndex((w) => w.type === m.type); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else messages.push(m); });
		const receive = (type) => { const i = messages.findIndex((m) => m.type === type); if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Missing " + type)), 3000); waiters.push({ type, resolve: (m) => { clearTimeout(timer); resolve(m); } }); }); };
		await once(ws, "open"); return { ws, receive, send: (m) => ws.send(JSON.stringify(m)) };
	}
	return { broker, origin, connect };
}

test("public service serves only guest assets and security headers, not console APIs", async (t) => {
	const h = await harness(t);
	const page = await fetch(h.origin); assert.equal(page.status, 200);
	assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
	assert.equal(page.headers.get("referrer-policy"), "no-referrer");
	for (const route of ["/api/state", "/api/update/install", "/posix-net", "/.env", "/../server.mjs"]) assert.equal((await fetch(h.origin + route)).status, 404);
	await assert.rejects(h.connect("https://evil.example"));
});

test("real WebSocket flow gates offers on approval and closes guests on host loss", async (t) => {
	const h = await harness(t), host = await h.connect("http://127.0.0.1:8090");
	host.send({ type: "create", hostKey, minutes: 5 }); const room = await host.receive("created");
	const guest = await h.connect(); guest.send({ type: "join", token: room.token, name: "<img onerror=alert(1)>" });
	await guest.receive("waiting"); const pending = await host.receive("request");
	host.send({ type: "approve", id: pending.id, role: "watch" }); await guest.receive("approved"); await host.receive("approved");
	host.send({ type: "offer", id: pending.id, sdp: { type: "offer", sdp: "fixture" } }); assert.equal((await guest.receive("offer")).sdp.sdp, "fixture");
	const closed = once(guest.ws, "close"); host.ws.close(); await closed;
	assert.equal(h.broker.hub.rooms.size, 0);
});

test("oversized, binary and malformed payloads close the offender", async (t) => {
	const h = await harness(t);
	for (const data of ["{bad", Buffer.from([0, 1]), "x".repeat(40000)]) {
		const peer = await h.connect(); peer.ws.on("error", () => {}); const closed = once(peer.ws, "close"); peer.ws.send(data); await closed;
	}
	assert.equal(h.broker.hub.rooms.size, 0);
});
