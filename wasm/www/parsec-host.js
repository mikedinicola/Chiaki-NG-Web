(() => {
	const get = (id) => document.getElementById(id);
	let selected = null, signature = "", lastStatus = "", checking = false;
	const tell = (text) => { get("parsec-status").textContent = text; };
	async function request(open = false) {
		const response = await fetch("/api/integrations/parsec" + (open ? "/open" : ""), open ? { method: "POST", headers: { "X-Chiaki-Update": "1" } } : {});
		const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not check Parsec."); return result;
	}
	async function check() {
		if (checking) return; checking = true; get("parsec-recheck").disabled = true;
		try {
			const status = await request(); get("parsec-open").disabled = !status.supported;
			tell(status.installed ? "Parsec found. Open it to sign in and share this PC." : status.supported ? "Install Parsec from Get Parsec, then choose Check installation. Portable copies can be opened manually." : "Open Parsec from your system's app launcher. Use a Windows host for guest controller support.");
		} catch { tell("Open Parsec from Start or your app launcher. The local launch helper is unavailable from this address."); }
		finally { checking = false; get("parsec-recheck").disabled = false; }
	}
	get("parsec-open").onclick = async () => {
		get("parsec-open").disabled = true;
		try { await request(true); tell("Parsec launch requested. Sign in there, choose Share on this PC, and approve your friend in Parsec."); }
		catch (e) { tell(e.message); }
		finally { get("parsec-open").disabled = false; }
	};
	get("parsec-recheck").onclick = check;
	get("parsec-console").onclick = () => get("btn-settings-back").click();
	get("parsec-resume").onclick = () => { if (streaming) { get("btn-settings-back").click(); canvas.focus(); } };
	function pads() { try { return Array.from(navigator.getGamepads?.() || []).filter((p) => p?.connected && p.buttons?.length >= 8); } catch { return []; } }
	function sync() {
		get("parsec-resume").disabled = !streaming; get("parsec-console").hidden = !!streaming;
		get("parsec-stream-status").textContent = streaming ? "Console stream running. Keep this tab open while your friend plays." : "Choose your PS5 or PS4 on the home screen and start the stream.";
		const devices = pads(), next = JSON.stringify(devices.map((p) => [p.index,p.id]));
		if (signature !== next) {
			signature = next; const select = get("parsec-controller"); select.replaceChildren(new Option("Automatic", "auto"));
			for (const p of devices) select.add(new Option(`${p.index + 1}. ${p.id}`, JSON.stringify([p.index,p.id])));
			if (selected && !devices.some((p) => p.index === selected.index && p.id === selected.id)) select.add(new Option("Selected controller disconnected", JSON.stringify([selected.index,selected.id])));
			select.value = selected ? JSON.stringify([selected.index,selected.id]) : "auto";
		}
		const chosen = ChiakiControllerRouting.pick(devices, selected, typeof activePadIndex === "number" ? activePadIndex : -1);
		const message = chosen ? `Browser sees: ${chosen.id}. Buttons held: ${chosen.buttons.filter((b) => b.pressed).length}.` : selected ? "Selected controller disconnected. Reconnect it or select another controller; local controllers will not take over automatically." : "No controller detected. Ask your friend to press a button after joining, then click this browser window.";
		if (lastStatus !== message) { get("parsec-controller-status").textContent = message; lastStatus = message; }
	}
	get("parsec-controller").onchange = () => {
		const chosen = pads().find((p) => JSON.stringify([p.index,p.id]) === get("parsec-controller").value);
		selected = chosen ? { index: chosen.index, id: chosen.id } : null;
		if (typeof refreshPadStatus === "function") refreshPadStatus(); sync();
	};
	globalThis.ChiakiParsec = { controller: () => selected && { ...selected }, streamState: sync };
	window.addEventListener("gamepadconnected", sync); window.addEventListener("gamepaddisconnected", sync); window.addEventListener("focus", sync);
	setInterval(() => { if (!get("online-panel").closest(".tab-page")?.classList.contains("hidden")) sync(); }, 500);
	sync(); check();
})();
