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
		let samples = [], previous = null;
		return {
			reset() { samples = []; previous = null; },
			push(x, y, now) {
				if (Number.isFinite(x) && Number.isFinite(y) && (x || y)) samples.push({ x, y, now });
			},
			read(now, sensitivity = 80, deadzone = 0.12) {
				samples = samples.filter((s) => now - s.now <= 24);
				if (!samples.length) { previous = null; return { x: 0, y: 0 }; }
				// A fixed time window avoids alternating zero/full samples with 60/125 Hz mice.
				const live = samples.filter((s) => now - s.now < 16);
				let x = live.reduce((n, s) => n + s.x, 0) / 0.016;
				let y = live.reduce((n, s) => n + s.y, 0) / 0.016;
				if (!live.length && previous) { x = previous.x; y = previous.y; }
				previous = { x, y };
				const speed = Math.hypot(x, y);
				if (!speed) return { x: 0, y: 0 };
				const dz = Math.max(0, Math.min(Number(deadzone) || 0, 0.3));
				const magnitude = dz + (1 - dz) * Math.min(1, speed * sensitivity / 80 / 1400);
				return { x: x / speed * magnitude, y: y / speed * magnitude };
			}
		};
	},
	bitrate(value) {
		const n = Number(value);
		return Number.isFinite(n) && n > 0 ? Math.round(Math.max(2000, Math.min(n, 100000))) : 15000;
	}
});
