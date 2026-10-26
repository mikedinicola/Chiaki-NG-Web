// Bound live-video latency without breaking inter-frame reference chains.
globalThis.ChiakiVideoPipeline = Object.freeze({
	create({ config, output, error, requestKeyframe, createDecoder = (callbacks) => new VideoDecoder(callbacks), now = () => performance.now(), maxPending = 8, maxAgeMs = 150 }) {
		let native = null, closed = false, needsKey = true, generation = 0;
		let recoveries = 0, skipped = 0, decodeMs = 0;
		const pending = new Map();
		function open() {
			const current = ++generation;
			native = createDecoder({
				output(frame) {
					if (closed || current !== generation) { frame.close(); return; }
					const submitted = pending.get(frame.timestamp);
					pending.delete(frame.timestamp);
					if (submitted !== undefined) {
						decodeMs = now() - submitted;
						// Still decode references, but do not upload obsolete pictures to the GPU.
						if (decodeMs > maxAgeMs) { skipped++; frame.close(); return; }
					}
					output(frame);
				},
				error(reason) {
					if (closed || current !== generation) return;
					discard(); recoveries++; error(reason); requestKeyframe();
				}
			});
			native.configure(config);
		}
		function discard() {
			generation++;
			try { native?.close(); } catch {}
			native = null; pending.clear(); needsKey = true;
		}
		return {
			decode(chunk) {
				if (closed) return false;
				const oldest = pending.values().next().value;
				if (pending.size >= maxPending || (oldest !== undefined && now() - oldest > maxAgeMs)) {
					discard(); recoveries++; requestKeyframe();
				}
				if (needsKey && chunk.type !== "key") { skipped++; requestKeyframe(); return false; }
				try {
					if (!native) open();
					pending.set(chunk.timestamp, now());
					native.decode(chunk); needsKey = false;
					return true;
				} catch (reason) {
					discard(); recoveries++; error(reason); requestKeyframe(); return false;
				}
			},
			recover() { if (!closed) { discard(); recoveries++; requestKeyframe(); } },
			close() { closed = true; discard(); },
			stats() { return { pending: pending.size, decodeMs, recoveries, skipped }; }
		};
	}
});
