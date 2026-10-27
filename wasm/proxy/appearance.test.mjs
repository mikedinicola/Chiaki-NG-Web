import { test } from "node:test";
import assert from "node:assert/strict";
import "../www/appearance.js";

test("corrupt or hostile UI preferences fall back to safe, bounded values", () => {
	for (const value of [null, [], "bad"]) assert.deepEqual(ChiakiAppearance.normalize(value), ChiakiAppearance.defaults);
	const p = ChiakiAppearance.normalize({ theme: "javascript:bad", accent: "url(bad)", scale: 900, volume: -1, deadzone: Infinity });
	assert.equal(p.theme, "system"); assert.equal(p.accent, "blue");
	assert.equal(p.scale, 120); assert.equal(p.volume, 0); assert.equal(p.deadzone, 15);
	assert.equal(p.privacy, true);
});

test("audio gain honors mute and zero volume without changing unrelated preferences", () => {
	assert.equal(ChiakiAppearance.gain({ volume: 0 }), 0);
	assert.equal(ChiakiAppearance.gain({ volume: 35 }), .35);
	assert.equal(ChiakiAppearance.gain({ volume: 100, mute: true }), 0);
	assert.equal(ChiakiAppearance.gain({ volume: 999 }), 1);
	const before = ChiakiAppearance.get(); ChiakiAppearance.set({ theme: "dark", material: "solid", deadzone: 0 });
	assert.equal(ChiakiAppearance.get().volume, before.volume);
	assert.equal(ChiakiAppearance.get().deadzone, 0);
});
