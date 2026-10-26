import assert from "node:assert/strict";
import { test } from "node:test";
import "../www/username-lookup.js";
import "../www/pc-controls.js";
import "../www/video-renderer.js";
import { isPatchedEmbeddedNode } from "../electron/runtime-security.mjs";

test("Electron refuses embedded Node releases preceding the security baseline", () => {
	for (const version of ["24.22.0", "22.23.3", "26.12.0", "20.99.0", "bad"]) assert.equal(isPatchedEmbeddedNode(version), false);
	for (const version of ["24.22.1", "24.23.0", "22.23.4", "26.12.1"]) assert.equal(isPatchedEmbeddedNode(version), true);
});

test("video statistics measure received payload, decoded frames and unrecovered loss", () => {
	const meter = ChiakiVideo.createStats(); meter.reset(1000);
	meter.receive(1000000, 2, false); meter.receive(1000000, 3, true);
	for (let i = 0; i < 120; i++) meter.decoded();
	assert.equal(meter.sample(1500), null);
	assert.deepEqual(meter.sample(3000), { mbps: 8, fps: 60, lost: 2 });
	assert.deepEqual(meter.sample(4000), { mbps: 0, fps: 0, lost: 0 });
	meter.reset(5000); meter.receive(500000);
	assert.deepEqual(meter.sample(6000), { mbps: 4, fps: 0, lost: 0 });
});

function lookupHarness(lookup) {
	const timers = new Map(), events = [];
	let count = 0, time = 10000;
	const client = ChiakiLookup.create({ lookup,
		pending: (name) => events.push(["pending", name]),
		success: (value, name) => events.push(["success", name, value]),
		failure: (_, name) => events.push(["failure", name]),
		now: () => time,
		schedule: (fn, delay) => { timers.set(++count, { fn, delay }); return count; },
		unschedule: (id) => timers.delete(id)
	});
	return { client, events, timers,
		run() { const [id, item] = timers.entries().next().value; timers.delete(id); time += item.delay; return item.fn(); }
	};
}

test("username typing is debounced and valid results are reused from cache", async () => {
	const calls = [];
	const h = lookupHarness(async (name) => { calls.push(name); return "AQIDBAUGBwg="; });
	assert.equal(h.client.input("!"), false);
	h.client.input("Player"); h.client.input("PlayerOne");
	assert.equal(h.timers.size, 1);
	await h.run();
	assert.deepEqual(calls, ["PlayerOne"]);
	h.client.input("playerone");
	assert.equal(h.timers.size, 0);
	assert.equal(h.events.at(-1)[0], "success");
});

test("an obsolete lookup cannot overwrite a newer username or a manual ID", async () => {
	const requests = [];
	const h = lookupHarness((name, signal) => new Promise((resolve) => requests.push({ name, signal, resolve })));
	h.client.input("First"); const first = h.run();
	h.client.input("Second");
	assert.equal(requests[0].signal.aborted, true);
	const second = h.run();
	requests[0].resolve("old"); await first;
	assert.equal(h.events.some((e) => e[0] === "success"), false);
	h.client.cancel(); // Manual account ID entry or closing the dialog.
	requests[1].resolve("new"); await second;
	assert.equal(h.events.some((e) => e[0] === "success"), false);
});

test("lookup failures remain retryable and requests respect the provider interval", async () => {
	const h = lookupHarness(async () => { throw new Error("service down"); });
	h.client.input("Player"); await h.run();
	assert.equal(h.events.at(-1)[0], "failure");
	h.client.input("Player", true);
	assert.equal([...h.timers.values()][0].delay, 3100);
});

test("PC movement cancels opposing keys and normalizes diagonal speed", () => {
	assert.deepEqual(ChiakiControls.movement(new Set(["KeyW", "KeyS", "KeyA", "KeyD"])), { x: 0, y: 0 });
	assert.deepEqual(ChiakiControls.movement(new Set(["KeyW"])), { x: 0, y: -1 });
	const diagonal = ChiakiControls.movement(new Set(["KeyW", "KeyD"]));
	assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
	assert.equal(ChiakiControls.mouse.r2[0], "Mouse0");
	assert.equal(ChiakiControls.keyboard.l3[0], "ShiftLeft");
});

test("high-quality bitrate is honored while invalid values remain bounded", () => {
	assert.equal(ChiakiControls.bitrate(30000), 30000);
	assert.equal(ChiakiControls.bitrate(100000), 100000);
	assert.equal(ChiakiControls.bitrate(999999), 100000);
	assert.equal(ChiakiControls.bitrate(100), 2000);
	assert.equal(ChiakiControls.bitrate("bad"), 15000);
});

test("mouse velocity is independent of event batching, radial and stops without drift", () => {
	const a = ChiakiControls.createMouse(), b = ChiakiControls.createMouse();
	a.push(8, 4, 8); a.push(8, 4, 16); b.push(16, 8, 16);
	assert.deepEqual(a.read(16), b.read(16));
	const slow = a.read(16, 40), fast = a.read(16, 80);
	assert.ok(Math.hypot(fast.x, fast.y) > Math.hypot(slow.x, slow.y));
	assert.equal(fast.x / fast.y, 2);
	assert.deepEqual(a.read(41), {x: 0, y: 0});
	a.push(9999, 9999, 50);
	assert.ok(Math.abs(Math.hypot(...Object.values(a.read(50))) - 1) < 1e-9);
	a.reset(); assert.deepEqual(a.read(50), {x: 0, y: 0});
});

test("mouse compensation crosses the stick dead zone without idle motion", () => {
	const mouse = ChiakiControls.createMouse();
	assert.deepEqual(mouse.read(0, 80, 0.2), {x: 0, y: 0});
	mouse.push(1, 0, 8);
	assert.ok(mouse.read(8, 80, 0.2).x > 0.2);
	assert.ok(mouse.read(8, 80, 0).x < 0.2);
	assert.deepEqual(ChiakiControls.keyboard.ps, ["KeyB"]);
	assert.deepEqual(ChiakiControls.keyboard.share, ["KeyN"]);
});

test("controls sidebar shortcut is reserved only in gameplay, outside text inputs", () => {
	const key = { code: "Backquote", key: "`" };
	assert.equal(ChiakiControls.sidebarHotkey(key, "stream"), true);
	assert.equal(ChiakiControls.sidebarHotkey(key, "settings"), false);
	assert.equal(ChiakiControls.sidebarHotkey(key, "stream", true), false);
	assert.equal(ChiakiControls.sidebarHotkey({ ...key, ctrlKey: true }, "stream"), false);
	let open = false;
	for (const repeat of [false, true, true, false]) {
		if (ChiakiControls.sidebarHotkey(key, "stream") && !repeat) open = !open;
	}
	assert.equal(open, false);
});
