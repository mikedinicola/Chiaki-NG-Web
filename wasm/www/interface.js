(() => {
	const get = (id) => document.getElementById(id), preferences = ChiakiAppearance;
	const pages = {
		general: ["General", "Make it yours.", "Language and session behavior, with your preferences saved automatically.", "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],
		appearance: ["Appearance", "A little more you.", "Choose your look. Keep it calm, make it vivid, or let your device decide.", "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.7h2a4 4 0 0 0 4-4A9 9 0 0 0 12 3M7 10h.01M10 6.5h.01M15 7h.01"],
		video: ["Display", "The right view.", "Choose how video is decoded and how your game fits the screen.", "M4 4h16v12H4zM8 21h8m-4-5v5"],
		stream: ["Picture quality", "Every detail, considered.", "Balance source detail, smooth motion and latency. Start with a preset, then fine-tune.", "M4 5h16v14H4zM4 14l5-5 4 4 3-3 4 4"],
		audio: ["Audio", "Sound, your way.", "Adjust playback volume and buffering without changing your system volume.", "M4 9h4l5-5v16l-5-5H4zM17 8a7 7 0 0 1 0 8m3-11a11 11 0 0 1 0 14"],
		consoles: ["Consoles", "Your consoles. One place.", "Manage saved PlayStations. Account identifiers stay hidden until you reveal them.", "M5 4h14v16H5zM8 17h8M8 7h8"],
		keys: ["Keyboard & mouse", "Find your flow.", "Your familiar PC controls, adapted for PlayStation. Customize bindings and mouse feel.", "M3 6h18v12H3zM6 9h1m3 0h1m3 0h1m3 0h.01M6 12h1m3 0h1m3 0h1m3 0h.01M7 15h10"],
		controllers: ["Controllers", "Ready, player one.", "Connect a controller, adjust its dead zone, or make the virtual pad your own.", "M7 7h10c4 0 5 12 2 12l-4-4H9l-4 4C2 19 3 7 7 7zM7 10v4m-2-2h4m7-1h.01m2 2h.01"],
		online: ["Online play", "Better with company.", "Private invitations. Your approval. A separate server keeps the console app private.", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a7 7 0 0 1 14 0v2m1-16a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 5"],
		updates: ["App updates", "Always moving forward.", "Check for new releases and choose when to install. Your settings and pairings stay yours.", "M20 8a9 9 0 1 0 1 8M20 3v5h-5M12 8v5l3 2"],
		config: ["Connection", "Under the surface.", "Advanced connection and account options. Most people can leave the defaults in place.", "M5 8h14M8 4v8m-3 5h14m-3-4v8"]
	};
	const body = document.querySelector(".settings-body"), nav = get("settings-tabs");
	function page(name) {
		let el = body.querySelector(`[data-page="${name}"]`);
		if (!el) { el = document.createElement("div"); el.className = "tab-page hidden"; el.dataset.page = name; body.append(el); }
		return el;
	}
	// Move existing controls, preserving IDs, values and event listeners.
	page("online").append(get("online-panel")); page("updates").append(get("update-panel"));
	const appearance = page("appearance");
	appearance.innerHTML = `<section class="settings-group"><h3>Color and character</h3><div class="appearance-options" aria-label="Color scheme">${["light","dark","system"].map((name) => `<button type="button" class="theme-choice" data-theme-choice="${name}" aria-pressed="false"><span class="theme-preview" aria-hidden="true"></span>${name[0].toUpperCase()+name.slice(1)}</button>`).join("")}</div><div class="form-row"><label>Accent color</label><div class="accent-choices" aria-label="Accent color">${Object.entries({blue:"#087ef5",violet:"#925af7",mint:"#138a70",rose:"#de4979",amber:"#b77508"}).map(([name,color]) => `<button type="button" class="accent-choice" data-accent-choice="${name}" style="--swatch:${color}" aria-label="${name} accent" title="${name}" aria-pressed="false"></button>`).join("")}</div></div></section>
<section class="settings-group"><h3>Comfort and accessibility</h3>
<div class="form-row"><label for="ui-material">Surface style</label><select id="ui-material"><option value="glass">Translucent navigation</option><option value="solid">Solid · reduce transparency</option></select></div>
<div class="form-row"><label for="ui-motion">Motion</label><select id="ui-motion"><option value="system">Follow device preference</option><option value="reduced">Reduce motion</option></select></div>
<div class="form-row"><label for="ui-contrast">Contrast</label><select id="ui-contrast"><option value="normal">Balanced</option><option value="high">Increase contrast</option></select></div>
<div class="form-row"><label for="ui-density">Spacing</label><select id="ui-density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
<div class="form-row"><label for="ui-scale">Interface text size</label><input id="ui-scale" type="range" min="90" max="120" step="5"><output id="ui-scale-value"></output></div>
<p class="ui-section-note">Navigation effects never touch the game picture. Stream controls use solid surfaces for predictable performance.</p></section>
<section class="settings-group"><h3>Privacy and in-game information</h3>
<div class="form-row"><label for="ui-privacy">Hide account identifiers</label><input id="ui-privacy" type="checkbox"></div>
<div class="form-row"><label for="ui-telemetry">Compact stream statistics</label><input id="ui-telemetry" type="checkbox"></div>
<p class="ui-section-note">Identifiers can still be revealed individually when needed. The compact overlay shows received bitrate and decoded frame rate; the backtick sidebar has the full details.</p></section>
<button id="ui-reset" type="button">Reset appearance preferences</button><p class="ui-footer">Appearance preferences stay in this browser. Console registrations, network settings and key bindings are kept separately.</p>`;
	const audioGroup = document.createElement("section"); audioGroup.className = "settings-group";
	audioGroup.innerHTML = `<h3>Playback volume</h3><div class="form-row"><label for="ui-volume">Game volume</label><input id="ui-volume" type="range" min="0" max="100" step="5"><output id="ui-volume-value"></output></div><div class="form-row"><label for="ui-mute">Mute game audio</label><input id="ui-mute" type="checkbox"></div><p class="ui-section-note">Applies to this app's audio, including sound sent to approved online guests. Your system volume is unchanged.</p>`;
	page("audio").prepend(audioGroup);
	const deadzone = document.createElement("div"); deadzone.className = "form-row";
	deadzone.innerHTML = `<label for="ui-deadzone">Controller stick dead zone</label><input id="ui-deadzone" type="range" min="0" max="30" step="1"><output id="ui-deadzone-value"></output>`;
	page("controllers").append(deadzone);
	for (const name of Object.keys(pages)) {
		const info = pages[name], el = page(name);
		let button = nav.querySelector(`[data-tab="${name}"]`);
		if (!button) { button = document.createElement("button"); button.type = "button"; button.dataset.tab = name; nav.append(button); }
		button.removeAttribute("data-i18n"); button.textContent = info[0];
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${info[3]}"/></svg>`;
		button.style.setProperty("--nav-icon", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
		nav.append(button);
		const header = document.createElement("header"); header.className = "page-heading";
		const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow"; eyebrow.textContent = "YOUR PLAY SPACE / " + info[0];
		const title = document.createElement("h2"); title.textContent = info[1];
		const intro = document.createElement("p"); intro.textContent = info[2]; header.append(eyebrow,title,intro); el.prepend(header);
		button.addEventListener("click", () => { clearSearch(); openSettingsTab(name); syncNavigation(); });
	}
	function groupRows(name, title) {
		const el = page(name), children = Array.from(el.children).filter((node) => !node.matches(".page-heading,.settings-group"));
		if (!children.length) return;
		const group = document.createElement("section"); group.className = "settings-group";
		const heading = document.createElement("h3"); heading.textContent = title; group.append(heading); for (const child of children) group.append(child); el.append(group);
	}
	groupRows("general", "Session preferences"); groupRows("video", "Playback and display"); groupRows("audio", "Output and buffering");
	groupRows("controllers", "Controller and virtual pad"); groupRows("config", "Connection settings");
	get("s-preset").closest(".form-row").classList.add("hidden");
	page("video").querySelector('[data-i18n="video.legacyPreset"]')?.classList.add("hidden");
	const presetGroup = document.createElement("section"); presetGroup.className = "settings-group";
	presetGroup.innerHTML = "<h3>Start with a feeling.</h3><div class='preset-grid'></div><p class='ui-section-note'>Source picture keeps the decoded image untouched. High quality adds crispness; Clean fog gently reduces noise. Reconnect after changing stream quality.</p>";
	for (const id of ["quality-source","quality-lan","quality-fog"]) presetGroup.querySelector(".preset-grid").append(get(id));
	page("stream").querySelector(".page-heading").after(presetGroup);
	const streamRows = Array.from(page("stream").children).filter((node) => node.matches(".form-row"));
	let streamAnchor = presetGroup;
	for (const [title, rows] of [["Stream format", streamRows.filter((row) => !row.querySelector("input[type=range]"))], ["Picture tuning", streamRows.filter((row) => row.querySelector("input[type=range]"))]]) {
		const group = document.createElement("section"); group.className = "settings-group"; const heading = document.createElement("h3"); heading.textContent = title; group.append(heading,...rows); streamAnchor.after(group); streamAnchor = group;
	}
	// Replace repetitive preset prose with the cards' concise introduction.
	for (const key of ["quality.hint","quality.sourceHint","quality.fogHint"]) page("stream").querySelector(`[data-i18n="${key}"]`)?.classList.add("hidden");
	const searchLabel = document.createElement("label"); searchLabel.className = "settings-search";
	searchLabel.innerHTML = '<input id="settings-search" type="search" placeholder="Search settings…" aria-label="Search settings" autocomplete="off">'; get("settings-view").querySelector(".settings-bar").append(searchLabel);
	const results = document.createElement("section"); results.className = "search-results hidden"; results.setAttribute("aria-live","polite"); body.prepend(results);
	const search = get("settings-search");
	function clearSearch() { search.value = ""; results.classList.add("hidden"); body.querySelectorAll(".search-highlight").forEach((el) => el.classList.remove("search-highlight")); }
	function syncNavigation() {
		for (const button of nav.querySelectorAll("button")) button.setAttribute("aria-current", button.classList.contains("active") ? "page" : "false");
	}
	new MutationObserver(syncNavigation).observe(nav, { attributes: true, subtree: true, attributeFilter: ["class"] });
	search.oninput = () => {
		const query = search.value.trim().toLocaleLowerCase().slice(0, 80); results.replaceChildren(); results.classList.toggle("hidden", !query);
		if (!query) return;
		let count = 0;
		for (const el of body.querySelectorAll(".form-row,.settings-group>h3,.update-panel>h3,.mouse-field")) {
			if (count >= 18 || el.classList.contains("hidden") || !el.textContent.toLocaleLowerCase().includes(query)) continue;
			const name = el.closest(".tab-page")?.dataset.page; if (!name) continue;
			const button = document.createElement("button"); button.type = "button"; button.className = "search-result";
			button.textContent = (el.querySelector("label")?.textContent || el.textContent).trim().replace(/\s+/g," ").slice(0,100);
			const label = document.createElement("small"); label.textContent = pages[name][0]; button.append(label);
			button.onclick = () => { clearSearch(); openSettingsTab(name); syncNavigation(); el.classList.add("search-highlight"); el.scrollIntoView({ block: "center" }); }; results.append(button); count++;
		}
		if (!count) { const message = document.createElement("p"); message.textContent = "No matching settings. Try picture, volume, mouse or theme."; results.append(message); }
	};
	window.addEventListener("keydown", (event) => {
		if (get("settings-view").classList.contains("hidden")) return;
		if (event.key === "/" && !event.target.closest("input,select,textarea,[contenteditable]")) { event.preventDefault(); search.focus(); }
		if (event.key === "Escape" && event.target === search) { clearSearch(); search.blur(); }
	});
	const library = document.createElement("section"); library.className = "library-intro";
	library.innerHTML = '<div class="library-topline"><div><span class="eyebrow">PLAY, BEAUTIFULLY.</span><h1>Your PlayStation.<br>Your favorite place.</h1><p>Pick up where you left off. Everything you need, a little closer.</p></div><div class="library-actions"><button type="button" id="ui-add-console">Add a console</button><button type="button" id="ui-library-settings">Customize your space</button></div></div><div class="library-label"><span>Your consoles</span><span>LOCAL REMOTE PLAY</span></div>';
	get("welcome").prepend(library); get("ui-add-console").onclick = () => get("btn-add").click(); get("ui-library-settings").onclick = () => openSettingsTab("appearance");
	const empty = document.createElement("section"); empty.className = "empty-library";
	empty.innerHTML = '<div class="empty-symbol" aria-hidden="true">◈</div><h2>A little setup. A lot of play.</h2><p>Add your PS5 or PS4 once. After that, your next session is just a click away.</p><button type="button">Connect your first console</button>';
	empty.querySelector("button").onclick = () => get("btn-add").click(); get("hosts").after(empty);
	const refreshEmpty = () => { empty.hidden = get("hosts").children.length > 0; }; new MutationObserver(refreshEmpty).observe(get("hosts"), { childList: true }); refreshEmpty();
	const metrics = document.createElement("div"); metrics.id = "ui-stream-metrics"; metrics.hidden = true; get("stream-view").append(metrics);
	new MutationObserver(() => { metrics.textContent = get("controls-stream-stats").textContent.split("·").slice(1,3).join(" · ").trim(); }).observe(get("controls-stream-stats"), { childList: true, characterData: true, subtree: true });
	const protectedInputs = new WeakSet();
	function privacy(force = false) {
		const enabled = preferences.get().privacy;
		for (const input of document.querySelectorAll('#s-psn-id,#reg-psn,#add-psn,input[data-act="psn"]')) {
			if (force || !protectedInputs.has(input)) input.type = enabled ? "password" : "text";
			if (protectedInputs.has(input)) {
				if (force) { const button = input.parentElement.querySelector(".privacy-toggle"); button.textContent = input.type === "password" ? "Show" : "Hide"; button.setAttribute("aria-pressed", String(input.type !== "password")); }
				continue;
			} protectedInputs.add(input);
			const wrapper = document.createElement("div"); wrapper.className = "secret-field"; input.before(wrapper); wrapper.append(input);
			const button = document.createElement("button"); button.type = "button"; button.className = "privacy-toggle"; button.textContent = input.type === "password" ? "Show" : "Hide"; button.setAttribute("aria-label", "Show or hide account identifier"); button.setAttribute("aria-pressed", String(input.type !== "password"));
			button.onclick = () => { input.type = input.type === "password" ? "text" : "password"; button.textContent = input.type === "password" ? "Show" : "Hide"; button.setAttribute("aria-pressed", String(input.type !== "password")); }; wrapper.append(button);
		}
	}
	new MutationObserver(() => privacy(false)).observe(get("saved-list"), { childList: true, subtree: true });
	function syncAudio() { const p = preferences.get(); if (typeof audio !== "undefined" && audio.gain && audio.ctx) audio.gain.gain.setTargetAtTime(preferences.gain(p), audio.ctx.currentTime, .015); }
	function sync() {
		const p = preferences.get();
		for (const name of ["material","motion","contrast","density","scale","privacy","telemetry","volume","mute","deadzone"]) {
			const input = get("ui-"+name); if (input.type === "checkbox") input.checked = p[name]; else input.value = p[name];
		}
		for (const name of ["scale","volume","deadzone"]) get("ui-"+name+"-value").textContent = p[name] + "%";
		document.querySelectorAll("[data-theme-choice]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.themeChoice === p.theme)));
		document.querySelectorAll("[data-accent-choice]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.accentChoice === p.accent)));
		metrics.hidden = !p.telemetry; privacy(true); syncAudio(); syncNavigation();
	}
	document.querySelectorAll("[data-theme-choice]").forEach((el) => { el.onclick = () => { preferences.set({ theme: el.dataset.themeChoice }); sync(); }; });
	document.querySelectorAll("[data-accent-choice]").forEach((el) => { el.onclick = () => { preferences.set({ accent: el.dataset.accentChoice }); sync(); }; });
	for (const name of ["material","motion","contrast","density","scale","privacy","telemetry","volume","mute","deadzone"]) get("ui-"+name).addEventListener("input", (event) => {
		const input = event.currentTarget; preferences.set({ [name]: input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value }); sync();
	});
	get("ui-reset").onclick = () => { const { volume, mute, deadzone } = preferences.get(); preferences.set({ ...preferences.defaults, volume, mute, deadzone }); sync(); };
	window.addEventListener("chiaki-ui-preferences", sync);
	globalThis.ChiakiUI = { syncAudio, preferences: () => preferences.get() }; sync();
})();
