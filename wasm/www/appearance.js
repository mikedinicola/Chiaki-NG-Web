// Apply before the first paint. UI preferences are separate from console credentials.
globalThis.ChiakiAppearance = (() => {
	const key = "chiaki-ui-preferences-v1";
	const defaults = Object.freeze({ theme: "system", accent: "blue", material: "glass", motion: "system", contrast: "normal", density: "comfortable", scale: 100, privacy: true, telemetry: false, volume: 100, mute: false, deadzone: 15 });
	function normalize(value = {}) {
		if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
		const choose = (name, allowed) => allowed.includes(value[name]) ? value[name] : defaults[name];
		const number = (name, min, max) => Number.isFinite(value[name]) ? Math.round(Math.min(max, Math.max(min, value[name]))) : defaults[name];
		return { theme: choose("theme", ["system","dark","light"]), accent: choose("accent", ["blue","violet","mint","rose","amber"]),
			material: choose("material", ["glass","solid"]), motion: choose("motion", ["system","reduced"]), contrast: choose("contrast", ["normal","high"]),
			density: choose("density", ["comfortable","compact"]), scale: number("scale", 90, 120), volume: number("volume", 0, 100), deadzone: number("deadzone", 0, 30),
			privacy: value.privacy !== false, telemetry: value.telemetry === true, mute: value.mute === true };
	}
	let prefs = { ...defaults };
	try { if (typeof window !== "undefined") prefs = normalize(JSON.parse(localStorage.getItem(key) || "{}")); } catch {}
	const dark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
	function apply() {
		if (typeof document === "undefined") return;
		const root = document.documentElement;
		root.dataset.theme = prefs.theme === "system" ? (dark?.matches ? "dark" : "light") : prefs.theme;
		for (const name of ["accent","material","motion","contrast","density"]) root.dataset[name] = prefs[name];
		root.style.setProperty("--ui-scale", prefs.scale / 100);
		root.style.colorScheme = root.dataset.theme;
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", root.dataset.theme === "dark" ? "#0e1016" : "#f4f5f8");
	}
	dark?.addEventListener("change", apply); apply();
	if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
		if (event.key !== key) return;
		try { prefs = normalize(JSON.parse(event.newValue || "{}")); apply(); window.dispatchEvent(new Event("chiaki-ui-preferences")); } catch {}
	});
	return Object.freeze({ defaults, normalize, gain(value) { const p = normalize(value); return p.mute ? 0 : p.volume / 100; }, get: () => ({ ...prefs }), set(value) { prefs = normalize({ ...prefs, ...value }); try { if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(prefs)); } catch {} apply(); return { ...prefs }; } });
})();
