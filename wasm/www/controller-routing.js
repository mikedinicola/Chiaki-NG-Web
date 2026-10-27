globalThis.ChiakiControllerRouting = Object.freeze({
	pick(pads, selected, activeIndex) {
		if (selected) return pads.find((p) => p.index === selected.index && p.id === selected.id) || null;
		const kept = pads.find((p) => p.index === activeIndex); if (kept) return kept;
		const score = (p) => /dualshock|dualsense|wireless controller|sony|playstation|ps[45]|ds4|ds5/i.test(p.id || "") ? 4 : p.mapping === "standard" ? 3 : /xinput|xbox/i.test(p.id || "") ? 2 : 1;
		return pads.slice().sort((a,b) => score(b)-score(a) || a.index-b.index)[0] || null;
	}
});
