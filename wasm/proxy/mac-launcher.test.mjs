import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { waitForLocalServer } from "../../scripts/launch-mac.mjs";
function fixture() { const child = new EventEmitter(); child.stdout = new EventEmitter(); return child; }
test("Mac launcher waits for readiness and uses the server's actual fallback port", async () => {
	const child = fixture(); let ready = false;
	const result = waitForLocalServer(child).then((url) => { ready = true; return url; });
	child.stdout.emit("data", Buffer.from("Compiling chiaki-relay...\n"));
	await new Promise(setImmediate); assert.equal(ready, false);
	child.stdout.emit("data", Buffer.from("chiaki-ng WASM (local): http://127.0.0.1:"));
	await new Promise(setImmediate); assert.equal(ready, false);
	child.stdout.emit("data", Buffer.from("54321/\n"));
	assert.equal(await result, "http://127.0.0.1:54321/");
	assert.equal(child.stdout.listenerCount("data"), 0);
});
test("Mac launcher reports build failure without opening a browser", async () => {
	const child = fixture(); const result = waitForLocalServer(child);
	child.emit("exit", 1); await assert.rejects(result, /stopped before it was ready/);
});
test("Mac launcher rejects spawn failures and ignores non-local or invalid URLs", async () => {
	const child = fixture(); const result = waitForLocalServer(child);
	child.stdout.emit("data", Buffer.from("chiaki-ng WASM (local): https://example.com/\nchiaki-ng WASM (local): http://127.0.0.1:99999/\n"));
	child.emit("error", new Error("spawn failed")); await assert.rejects(result, /spawn failed/);
});
