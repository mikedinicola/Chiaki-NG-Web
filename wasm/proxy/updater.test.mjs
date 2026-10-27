import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { compareVersions, selectRelease, localUpdateRequest, createUpdater } from "./updater.mjs";

const bytes = Buffer.from("Test installer fixture; never execute this file.");
const digest = crypto.createHash("sha256").update(bytes).digest("hex");
function release(version = "1.10.4") {
	const name = `Chiaki-NG-Web-Setup-${version}-x64.exe`;
	return { tag_name: `browser-v${version}`, published_at: "2026-10-27T00:00:00Z", prerelease: true,
		assets: [{ name, state: "uploaded", digest: "sha256:" + digest, size: bytes.length,
			browser_download_url: `https://github.com/SKIZZOO/Chiaki-NG-Web/releases/download/browser-v${version}/${name}` }] };
}
async function harness(t, overrides = {}) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiaki-updater-"));
	t.after(() => fs.rm(dir, { recursive: true, force: true }));
	const calls = [], installs = [];
	const updater = createUpdater({ current: "1.10.3", dataDir: dir, installable: true,
		fetchImpl: async (url) => { calls.push(url); return url.includes("api.github.com") ? new Response(JSON.stringify([release()])) : new Response(bytes); },
		install: async (file, hash) => { installs.push({ file, hash, bytes: await fs.readFile(file) }); }, ...overrides });
	return { updater, calls, installs, dir };
}

test("release selection uses numeric versions, browser previews and exact repo assets", () => {
	assert.equal(compareVersions("1.10.12", "1.10.9"), 1);
	assert.equal(selectRelease([release("1.10.2"), release("1.10.12"), release("1.10.9")], "1.10.3").version, "1.10.12");
	assert.equal(selectRelease([release("1.10.3")], "1.10.3"), null);
	for (const mutate of [
		(r) => { r.draft = true; }, (r) => { r.tag_name = "v99.0.0"; },
		(r) => { r.assets[0].digest = null; }, (r) => { r.assets[0].size = 200000000; },
		(r) => { r.assets[0].browser_download_url = "https://example.com/installer.exe"; }
	]) { const r = release(); mutate(r); assert.equal(selectRelease([r], "1.0.0"), null); }
});

test("update routes reject remote clients, DNS rebinding, cross-origin posts and simple forms", () => {
	const req = { method: "POST", socket: { localPort: 8090, remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:8090", origin: "http://127.0.0.1:8090", "x-chiaki-update": "1" } };
	assert.equal(localUpdateRequest(req), true);
	assert.equal(localUpdateRequest({ ...req, headers: { ...req.headers, origin: "https://evil.example" } }), false);
	assert.equal(localUpdateRequest({ ...req, headers: { ...req.headers, host: "evil.example:8090" } }), false);
	assert.equal(localUpdateRequest({ ...req, headers: { ...req.headers, "x-chiaki-update": undefined } }), false);
	assert.equal(localUpdateRequest({ ...req, socket: { ...req.socket, remoteAddress: "192.0.2.1" } }), false);
	assert.equal(localUpdateRequest({ ...req, headers: { ...req.headers, origin: undefined } }), false);
});

test("checks cache GitHub metadata and persist the automatic-check preference", async (t) => {
	const h = await harness(t); await h.updater.check(); await h.updater.check();
	assert.equal(h.calls.length, 1); assert.equal((await h.updater.snapshot()).status, "available");
	await h.updater.setAuto(false);
	const reopened = createUpdater({ current: "1.10.3", dataDir: h.dir });
	assert.equal((await reopened.snapshot()).autoCheck, false);
	assert.equal(h.installs.length, 0); // Checking never installs.
});

test("verified download is rechecked with GitHub before the installer handoff", async (t) => {
	const h = await harness(t); await h.updater.check(); await h.updater.installLatest("1.10.4");
	assert.equal(h.calls.length, 3); assert.equal(h.installs.length, 1);
	assert.deepEqual(h.installs[0].bytes, bytes); assert.equal(h.installs[0].hash, digest);
	assert.equal((await h.updater.snapshot()).status, "installing");
	await assert.rejects(h.updater.installLatest("1.10.4"), /already running/);
});

test("bad hash, truncation and oversized downloads never reach the installer", async (t) => {
	for (const body of [Buffer.alloc(bytes.length, 9), bytes.subarray(0, 3), Buffer.alloc(bytes.length + 1)]) {
		const h = await harness(t, { fetchImpl: async (url) => url.includes("api.github.com") ? new Response(JSON.stringify([release()])) : new Response(body) });
		await assert.rejects(h.updater.installLatest("1.10.4"));
		assert.equal(h.installs.length, 0); assert.equal((await h.updater.snapshot()).status, "error");
		assert.deepEqual(await fs.readdir(path.join(h.dir, "updates")), []);
	}
});

test("stale releases, offline checks and non-installed builds cannot run an installer", async (t) => {
	const stale = await harness(t); await assert.rejects(stale.updater.installLatest("1.10.2"), /Release changed/);
	assert.equal(stale.installs.length, 0);
	const portable = await harness(t, { installable: false }); await assert.rejects(portable.updater.installLatest("1.10.4"), /installed Windows/);
	const offline = await harness(t, { fetchImpl: async () => { throw new Error("Offline"); } });
	assert.equal((await offline.updater.check()).error, "Offline");
	assert.equal(offline.installs.length, 0);
});
