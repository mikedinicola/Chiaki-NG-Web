globalThis.ChiakiControls = Object.freeze({
	keyboard: Object.freeze({
		ls_up: ["KeyW"], ls_left: ["KeyA"], ls_down: ["KeyS"], ls_right: ["KeyD"],
		cross: ["Space"], moon: ["ControlLeft", "KeyC"], box: ["KeyR"], pyramid: ["KeyE"],
		l1: ["KeyQ"], r1: ["KeyG"], l3: ["ShiftLeft"], r3: ["KeyV"],
		options: ["Escape", "KeyP"], touchpad: ["Tab"], ps: ["KeyB"], share: ["KeyN"],
		dpad_up: ["Digit1"], dpad_right: ["Digit2"], dpad_down: ["Digit3"], dpad_left: ["Digit4"]
	}),
	mouse: Object.freeze({ r2: ["Mouse0"], l2: ["Mouse2"] }),
	sidebarHotkey(event, view, editable = false) {
		return view === "stream" && !editable && (event.code === "Backquote" || event.key === "`")
			&& !event.ctrlKey && !event.altKey && !event.metaKey;
	},
	movement(keys) {
		let x = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
		let y = Number(keys.has("KeyS")) - Number(keys.has("KeyW"));
		const length = Math.hypot(x, y);
		if (length > 1) { x /= length; y /= length; }
		return { x, y };
	},
	createMouse() {
		let samples = [], previous = null, glide = null, lastRead = 0;
		return {
			reset() { samples = []; previous = null; glide = null; lastRead = 0; },
			push(x, y, now) {
				if (Number.isFinite(x) && Number.isFinite(y) && (x || y)) samples.push({ x, y, now });
			},
			read(now, sensitivity = 80, deadzone = 0.12, gain = 1, curve = 1, momentumMs = 0) {
				const dt = lastRead ? Math.min(100, Math.max(0, now - lastRead)) : 16;
				lastRead = now;
				const tau = Math.max(0, Math.min(Number(momentumMs) || 0, 1000));
				const g = Math.max(0.1, Number(gain) || 1);
				const c = Math.max(0.2, Math.min(Number(curve) || 1, 2));
				// Stop within 1% of the usable output range above the compensated
				// dead zone. Invert the response curve to find that input speed.
				const stopSpeed = Math.pow(0.01, 1 / c) * 80 * 1400 / (Math.max(1, sensitivity) * g);
				samples = samples.filter((s) => now - s.now <= 24);
				let x = 0, y = 0;
				// With momentum, coast as soon as events stop (~12 ms gap) instead of letting the
				// measuring window drain, so the glide starts from the full lift-off speed.
				const stale = tau && glide && samples.length && now - samples[samples.length - 1].now > 12;
				if (samples.length && !stale) {
					// A fixed time window avoids alternating zero/full samples with 60/125 Hz mice.
					const live = samples.filter((s) => now - s.now < 16);
					x = live.reduce((n, s) => n + s.x, 0) / 0.016;
					y = live.reduce((n, s) => n + s.y, 0) / 0.016;
					if (!live.length && previous) { x = previous.x; y = previous.y; }
					previous = { x, y };
					if (tau && glide && live.length) {
						// Light smoothing while the finger moves keeps glides from inheriting jitter.
						const a = 1 - Math.exp(-dt / Math.max(8, tau * 0.12));
						x = glide.x + (x - glide.x) * a;
						y = glide.y + (y - glide.y) * a;
					}
					glide = tau ? { x, y } : null;
				} else {
					if (!samples.length) previous = null;
					if (!tau || !glide) { glide = null; return { x: 0, y: 0 }; }
					// Finger lifted: keep moving and decay exponentially, like macOS inertial scrolling.
					const k = Math.exp(-dt / tau);
					glide = { x: glide.x * k, y: glide.y * k };
					if (Math.hypot(glide.x, glide.y) < stopSpeed) { glide = null; return { x: 0, y: 0 }; }
					x = glide.x; y = glide.y;
				}
				const speed = Math.hypot(x, y);
				if (!speed) return { x: 0, y: 0 };
				const dz = Math.max(0, Math.min(Number(deadzone) || 0, 0.3));
				// curve < 1 lifts small movements (trackpads produce much smaller deltas than mice).
				const linear = Math.min(1, speed * sensitivity * g / 80 / 1400);
				const magnitude = dz + (1 - dz) * Math.pow(linear, c);
				return { x: x / speed * magnitude, y: y / speed * magnitude };
			}
		};
	},
	bitrate(value) {
		const n = Number(value);
		return Number.isFinite(n) && n > 0 ? Math.round(Math.max(2000, Math.min(n, 100000))) : 15000;
	}
});
