import assert from "node:assert/strict";
import { once } from "node:events";
import crypto from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { BrowserFrames, MAX_PACKET, startRustRelay, validatePacket, wsFrame } from "./rust-relay.mjs";

function masked(payload, opcode = 2, fin = true) {
	const frame = wsFrame(payload, opcode);
	if (!fin) frame[0] &= 127;
	frame[1] |= 128;
	const size = frame.length - payload.length;
	const mask = Buffer.from([1, 7, 9, 13]);
	const data = Buffer.from(payload);
	for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
	return Buffer.concat([frame.subarray(0, size), mask, data]);
}

function packet(kind, id, fd, a = 0, b = 0, c = 0, data = Buffer.alloc(0)) {
	const out = Buffer.alloc(28 + data.length);
	out[0] = kind;
	for (const [offset, value] of [[4, id], [8, fd], [12, a], [16, b], [20, c], [24, data.length]])
		out.writeUInt32LE(value >>> 0, offset);
	data.copy(out, 28);
	return out;
}

test("WebSocket reassembles split headers and fragmented binary messages around ping", () => {
	const parser = new BrowserFrames();
	const events = [];
	const input = Buffer.concat([
		masked(Buffer.from("first"), 2, false), masked(Buffer.from("ping"), 9),
		masked(Buffer.from("second"), 0), masked(Buffer.alloc(65536, 42))
	]);
	for (let offset = 0; offset < input.length; offset += 3)
		parser.push(input.subarray(offset, offset + 3), (opcode, payload) => events.push({ opcode, payload }));
	assert.equal(events[0].opcode, 9);
	assert.equal(events[1].payload.toString(), "firstsecond");
	assert.equal(events[2].payload.length, 65536);
	assert.equal(parser.buffer.length, 0);
});

test("WebSocket rejects unmasked, unsupported, oversized and invalid continuation frames", () => {
	for (const invalid of [wsFrame(Buffer.from("unmasked")), masked(Buffer.from("text"), 1), masked(Buffer.from("unexpected"), 0)])
		assert.throws(() => new BrowserFrames().push(invalid, () => {}));
	const oversized = Buffer.alloc(10);
	oversized[0] = 0x82; oversized[1] = 0xff;
	oversized.writeBigUInt64BE(BigInt(MAX_PACKET + 1), 2);
	assert.throws(() => new BrowserFrames().push(oversized, () => {}));
	const parser = new BrowserFrames();
	parser.push(masked(Buffer.alloc(MAX_PACKET), 2, false), () => {});
	assert.throws(() => parser.push(masked(Buffer.from([1]), 0), () => {}));
});

test("POSIX length validation rejects malformed packets", () => {
	validatePacket(packet(1, 1, 1, 2, 2));
	assert.throws(() => validatePacket(Buffer.alloc(27)));
	const bad = packet(5, 1, 1);
	bad.writeUInt32LE(1, 24);
	assert.throws(() => validatePacket(bad));
});

test("missing Rust binary reports an actionable startup error", async () => {
	await assert.rejects(startRustRelay({ binary: path.join(os.tmpdir(), "missing-chiaki-relay") }), /cargo build/);
});

const binary = process.env.CHIAKI_RELAY_BIN || fileURLToPath(new URL("../relay-rust/target/release/chiaki-relay" + (process.platform === "win32" ? ".exe" : ""), import.meta.url));

async function client(url) {
	const ws = new WebSocket(url, "binary");
	ws.binaryType = "arraybuffer";
	const queue = [];
	const waiting = [];
	ws.onmessage = ({ data }) => {
		const packet = Buffer.from(data);
		const index = waiting.findIndex((w) => w.match(packet));
		if (index < 0) queue.push(packet);
		else waiting.splice(index, 1)[0].resolve(packet);
	};
	await once(ws, "open");
	return {
		ws,
		next(kind, id) {
			const match = (p) => p[0] === kind && (id == null || p.readUInt32LE(4) === id);
			const index = queue.findIndex(match);
			if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => { waiting.splice(waiting.indexOf(waiter), 1); reject(new Error(`Missing event ${kind}/${id}`)); }, 5000);
				const waiter = { match, resolve: (p) => { clearTimeout(timer); resolve(p); } };
				waiting.push(waiter);
			});
		}
	};
}

test("native relay end to end", { skip: !fs.existsSync(binary) && "Build the Rust relay first", timeout: 30000 }, async (t) => {
	const relay = await startRustRelay({ binary, allowWan: false });
	t.after(() => relay.close());
	const server = http.createServer();
	server.on("upgrade", (req, socket, head) => {
		const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
		socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: binary\r\n\r\n`);
		relay.attach(socket, head);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => server.close());
	const url = `ws://127.0.0.1:${server.address().port}/posix-net`;

	await t.test("internal listener rejects a missing process token", async () => {
		const socket = net.connect(relay.port, "127.0.0.1");
		await once(socket, "connect");
		socket.write("0".repeat(64));
		await once(socket, "close");
	});

	await t.test("handles a binary packet coalesced with the HTTP upgrade", async () => {
		const socket = net.connect(server.address().port, "127.0.0.1");
		await once(socket, "connect");
		const response = new Promise((resolve, reject) => {
			let data = Buffer.alloc(0);
			const timer = setTimeout(() => reject(new Error("Missing coalesced upgrade reply")), 3000);
			socket.on("data", (chunk) => {
				data = Buffer.concat([data, chunk]);
				const end = data.indexOf("\r\n\r\n");
				if (end >= 0 && data.length >= end + 4 + 30) {
					clearTimeout(timer); resolve(data.subarray(end + 4));
				}
			});
		});
		t.after(() => socket.destroy());
		const headers = `GET /posix-net HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}\r\nSec-WebSocket-Protocol: binary\r\n\r\n`;
		socket.write(Buffer.concat([Buffer.from(headers), masked(packet(1, 90, 1, 2, 2))]));
		const frame = await response;
		assert.equal(frame[2], 128);
		assert.equal(frame.readUInt32LE(6), 90);
	});

	await t.test("socket namespaces are isolated between browser connections", async () => {
		const first = await client(url);
		const second = await client(url);
		t.after(() => { first.ws.close(); second.ws.close(); });
		first.ws.send(packet(1, 1, 7, 2, 2));
		assert.equal((await first.next(128, 1)).readInt32LE(12), 0);
		second.ws.send(packet(8, 2, 7));
		assert.equal((await second.next(128, 2)).readInt32LE(16), 9);
		first.ws.send(packet(4, 3, 7, 2, 9295, 0x0100007f));
		assert.equal((await first.next(128, 3)).readInt32LE(16), 13);
	});

	const ip = Object.values(os.networkInterfaces()).flat().find((i) => i.family === "IPv4" && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
	await t.test("TCP and UDP echo, shutdown, and disconnect cleanup", { skip: !ip && "No private LAN interface available" }, async () => {
		const address = Buffer.from(ip.split(".").map(Number)).readUInt32LE(0);
		const tcp = net.createServer((socket) => socket.pipe(socket));
		tcp.listen(0, ip);
		await once(tcp, "listening");
		t.after(() => tcp.close());
		const udp = dgram.createSocket("udp4");
		udp.on("message", (data, peer) => udp.send(data, peer.port, peer.address));
		udp.bind(0, ip);
		await once(udp, "listening");
		t.after(() => udp.close());
		const c = await client(url);
		t.after(() => c.ws.close());
		for (const [fd, kind] of [[10, 1], [11, 2]]) {
			c.ws.send(packet(1, fd, fd, 2, kind));
			assert.equal((await c.next(128, fd)).readInt32LE(12), 0);
		}
		c.ws.send(packet(4, 20, 10, 2, tcp.address().port, address));
		await c.next(130);
		assert.equal((await c.next(128, 20)).readInt32LE(12), 0);
		c.ws.send(packet(5, 21, 10, 0, 0, 0, Buffer.from("TCP echo")));
		assert.equal((await c.next(128, 21)).readInt32LE(12), 8);
		assert.equal((await c.next(129)).subarray(28).toString(), "TCP echo");
		const large = Buffer.alloc(128 * 1024, 42);
		c.ws.send(packet(5, 25, 10, 0, 0, 0, large));
		assert.equal((await c.next(128, 25)).readInt32LE(12), large.length);
		const chunks = [];
		let received = 0;
		while (received < large.length) {
			const chunk = (await c.next(129)).subarray(28);
			chunks.push(chunk); received += chunk.length;
		}
		assert.deepEqual(Buffer.concat(chunks), large);
		c.ws.send(packet(6, 22, 11, 2, udp.address().port, address, Buffer.from("UDP echo")));
		assert.equal((await c.next(128, 22)).readInt32LE(12), 8);
		assert.equal((await c.next(129)).subarray(28).toString(), "UDP echo");
		c.ws.send(packet(8, 23, 11));
		const boundPort = (await c.next(128, 23)).readInt32LE(12);
		c.ws.send(packet(10, 24, 10));
		assert.equal((await c.next(128, 24)).readInt32LE(12), 0);
		await c.next(131);
		c.ws.close();
		await once(c.ws, "close");
		// Completion of the browser close and native connection cleanup are asynchronous.
		const deadline = Date.now() + 2000;
		for (;;) {
			const probe = dgram.createSocket("udp4");
			try {
				probe.bind(boundPort, "0.0.0.0");
				await once(probe, "listening");
				probe.close(); break;
			} catch (error) {
				probe.close();
				if (Date.now() > deadline) throw error;
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		}
	});
});

test("full web server preserves authentication and browser isolation with Rust enabled", {
	skip: !fs.existsSync(binary) && "Build the Rust relay first", timeout: 20000
}, async (t) => {
	const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "chiaki-rust-test-"));
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const source = `import { startServers } from './wasm/proxy/server.mjs';
		const server = await startServers();
		process.send({ port: server.port });
		process.on('message', async () => { await server.close(); process.exit(0); });`;
	const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
		cwd: root, stdio: ["ignore", "pipe", "pipe", "ipc"],
		env: { ...process.env, CHIAKI_ENV_FILE: path.join(dbDir, "absent.env"), CHIAKI_DB_DIR: dbDir,
			CHIAKI_AUTH_ENABLED: "true", CHIAKI_AUTH_ALLOW_REGISTER: "true", CHIAKI_ADMIN_USER: "",
			CHIAKI_ADMIN_EMAIL: "", CHIAKI_ADMIN_PASSWORD: "", CHIAKI_WASM_PORT: "0",
			CHIAKI_WASM_BIND: "127.0.0.1", CHIAKI_WASM_LAN_HTTPS: "false",
			CHIAKI_RELAY_BACKEND: "rust", CHIAKI_RELAY_BIN: binary }
	});
	let output = "";
	child.stdout.on("data", (data) => { output += data; });
	child.stderr.on("data", (data) => { output += data; });
	t.after(async () => {
		if (child.exitCode == null) {
			child.send("close");
			await once(child, "exit");
		}
		fs.rmSync(dbDir, { recursive: true, force: true });
	});
	const ready = new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("Web server startup timed out: " + output)), 10000);
		child.once("message", (message) => { clearTimeout(timer); resolve(message); });
		child.once("exit", () => { clearTimeout(timer); reject(new Error("Web server failed: " + output)); });
	});
	const { port } = await ready;
	const base = `http://127.0.0.1:${port}`;
	const page = await fetch(base);
	assert.equal(page.status, 200);
	assert.equal(page.headers.get("cross-origin-opener-policy"), "same-origin");
	assert.equal(page.headers.get("cross-origin-embedder-policy"), "require-corp");
	assert.match(await page.text(), /runtime-checks.js/);
	assert.equal((await fetch(base + "/runtime-checks.js")).status, 200);
	assert.equal((await fetch(base + "/api/state")).status, 401);
	assert.equal((await fetch(base + "/rust-relay.mjs")).status, 403);

	const upgrade = (cookie, origin = base) => new Promise((resolve, reject) => {
		const req = http.request(base + "/posix-net", { headers: {
			Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
			"Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
			"Sec-WebSocket-Protocol": "binary", Origin: origin, ...(cookie ? { Cookie: cookie } : {})
		} });
		req.on("response", (res) => { res.resume(); resolve({ status: res.statusCode }); });
		req.on("upgrade", (res, socket) => resolve({ status: res.statusCode, socket }));
		req.on("error", reject);
		req.end();
	});
	assert.equal((await upgrade()).status, 401);
	const registered = await fetch(base + "/api/register", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ username: "rusttester", email: "rusttester@example.com", password: "test-password-12345" })
	});
	assert.equal(registered.status, 200, await registered.text());
	const cookie = registered.headers.get("set-cookie").split(";")[0];
	await assert.rejects(upgrade(cookie, "http://unrelated.invalid"), /socket hang up/);
	const authorized = await upgrade(cookie);
	assert.equal(authorized.status, 101);
	const reply = once(authorized.socket, "data");
	authorized.socket.write(masked(packet(1, 42, 12, 2, 2)));
	const [frame] = await reply;
	assert.equal(frame[0], 0x82);
	assert.equal(frame[2], 128);
	assert.equal(frame.readUInt32LE(6), 42);
	const closed = once(authorized.socket, "close");
	authorized.socket.destroy();
	await closed;
	await fetch(base + "/api/logout", { method: "POST", headers: { Cookie: cookie } });
	assert.equal((await upgrade(cookie)).status, 401);
	assert.match(output, /Direct TCP\/UDP relay: rust/);
});

test("native process exits when the parent liveness pipe closes", {
	skip: !fs.existsSync(binary) && "Build the Rust relay first", timeout: 5000
}, async (t) => {
	const child = spawn(binary, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, CHIAKI_RELAY_TOKEN: "a".repeat(64) } });
	t.after(() => child.kill());
	await once(child.stdout, "data");
	const exited = once(child, "exit");
	child.stdin.end();
	assert.equal((await exited)[0], 0);
});

test("desktop-managed server exposes its identity and exits when launcher stdin closes", {
	skip: !fs.existsSync(binary) && "Build the Rust relay first", timeout: 15000
}, async (t) => {
	const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "chiaki-managed-test-"));
	const child = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
		windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, CHIAKI_ENV_FILE: path.join(dbDir, "absent.env"), CHIAKI_DB_DIR: dbDir,
			CHIAKI_AUTH_ENABLED: "false", CHIAKI_WASM_PORT: "0", CHIAKI_WASM_BIND: "127.0.0.1",
			CHIAKI_WASM_LAN_HTTPS: "false", CHIAKI_DESKTOP_MANAGED: "1",
			CHIAKI_RELAY_BACKEND: "rust", CHIAKI_RELAY_BIN: binary }
	});
	t.after(async () => {
		if (child.exitCode == null) { child.kill(); await once(child, "exit"); }
		assert.equal(path.dirname(dbDir), os.tmpdir());
		fs.rmSync(dbDir, { recursive: true, force: true });
	});
	let output = "";
	child.stderr.resume();
	const port = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("Managed startup timed out")), 10000);
		child.once("exit", () => { clearTimeout(timer); reject(new Error("Managed server exited early")); });
		child.stdout.on("data", (data) => {
			output += data;
			const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
			if (match) { clearTimeout(timer); resolve(Number(match[1])); }
		});
	});
	const health = await fetch(`http://127.0.0.1:${port}/health`);
	assert.equal(health.headers.get("x-chiaki-app"), "chiaki-ng-web");
	assert.equal(await health.text(), "ok");
	const guide = await fetch(`http://127.0.0.1:${port}/first-run.html`);
	assert.equal(guide.status, 200);
	assert.match(await guide.text(), /All controls at a glance/);
	const exited = once(child, "exit");
	child.stdin.end();
	assert.equal((await exited)[0], 0);
});
