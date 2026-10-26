import assert from "node:assert/strict";
import { test } from "node:test";
import "../www/video-pipeline.js";

function harness() {
	let time = 0, requests = 0;
	const natives = [], frames = [], errors = [];
	const pipeline = ChiakiVideoPipeline.create({ config: { codec: "test" }, now: () => time,
		output(frame) { frames.push(frame.timestamp); frame.close(); },
		error(reason) { errors.push(reason); }, requestKeyframe() { requests++; },
		createDecoder(callbacks) {
			const native = { callbacks, chunks: [], closed: false, configure() {},
				decode(chunk) { this.chunks.push(chunk); }, close() { this.closed = true; } };
			natives.push(native); return native;
		}
	});
	return { pipeline, natives, frames, errors, tick(ms) { time += ms; }, get requests() { return requests; },
		push(timestamp, type = "delta") { return pipeline.decode({ timestamp, type }); },
		emit(index, timestamp) {
			const frame = { timestamp, closed: false, close() { this.closed = true; } };
			natives[index].callbacks.output(frame); return frame;
		} };
}

test("temporary decode bursts preserve every compressed reference frame", () => {
	const h = harness();
	assert.equal(h.push(0, "key"), true);
	for (let i = 1; i < 7; i++) assert.equal(h.push(i), true);
	assert.equal(h.natives[0].chunks.length, 7);
	for (let i = 0; i < 7; i++) assert.equal(h.emit(0, i).closed, true);
	assert.equal(h.pipeline.stats().pending, 0);
	assert.equal(h.requests, 0);
});

test("a stalled codec is bounded even when its reported decode queue has drained", () => {
	const h = harness(); h.push(0, "key"); h.tick(151);
	assert.equal(h.push(1), false);
	assert.equal(h.natives[0].closed, true);
	assert.equal(h.push(2), false); // Cannot decode a broken reference chain.
	assert.equal(h.push(3, "key"), true);
	assert.equal(h.natives.length, 2);
	assert.equal(h.emit(0, 0).closed, true); // Ignore obsolete codec callbacks.
	assert.deepEqual(h.frames, []);
	h.emit(1, 3); assert.deepEqual(h.frames, [3]);
});

test("decode errors recreate the codec on a fresh keyframe, not a resolved setup promise", () => {
	const h = harness(); h.push(1, "key");
	h.natives[0].callbacks.error(new Error("device lost"));
	assert.equal(h.errors.length, 1);
	assert.equal(h.push(2), false);
	assert.equal(h.push(3, "key"), true);
	h.emit(1, 3); assert.deepEqual(h.frames, [3]);
	assert.equal(h.pipeline.stats().recoveries, 1);
});

test("queue capacity and packet loss both resynchronize without arbitrary delta drops", () => {
	const h = harness(); h.push(0, "key");
	for (let i = 1; i < 8; i++) h.push(i);
	assert.equal(h.push(8), false);
	assert.equal(h.pipeline.stats().pending, 0);
	h.push(9, "key"); h.pipeline.recover();
	assert.equal(h.push(10), false);
	assert.equal(h.push(11, "key"), true);
	assert.equal(h.pipeline.stats().recoveries, 2);
});

test("late decoded pictures and all frames after shutdown release resources", () => {
	const h = harness(); h.push(0, "key"); h.tick(151);
	assert.equal(h.emit(0, 0).closed, true);
	assert.deepEqual(h.frames, []);
	h.pipeline.close();
	assert.equal(h.push(1, "key"), false);
	assert.equal(h.emit(0, 1).closed, true);
});
