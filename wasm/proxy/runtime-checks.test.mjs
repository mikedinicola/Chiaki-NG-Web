import assert from "node:assert/strict";
import { test } from "node:test";
import "../www/runtime-checks.js";

const supported = {
	isSecureContext: true, crossOriginIsolated: true,
	SharedArrayBuffer, WebAssembly, VideoDecoder: function () {}
};

test("runtime preflight identifies the actionable cause before loading WASM", () => {
	assert.equal(ChiakiRuntime.issue(supported, true), null);
	assert.equal(ChiakiRuntime.issue({ ...supported, isSecureContext: false }), "log.insecureOrigin");
	assert.equal(ChiakiRuntime.issue({ ...supported, crossOriginIsolated: false }), "log.isolationMissing");
	assert.equal(ChiakiRuntime.issue({ ...supported, SharedArrayBuffer: undefined }), "log.isolationMissing");
	assert.equal(ChiakiRuntime.issue({ ...supported, WebAssembly: undefined }), "log.wasmMissing");
	const noVideo = { ...supported, VideoDecoder: undefined };
	assert.equal(ChiakiRuntime.issue(noVideo), null); // Pairing and discovery do not require a decoder.
	assert.equal(ChiakiRuntime.issue(noVideo, true), "log.webcodecsMissing");
});
