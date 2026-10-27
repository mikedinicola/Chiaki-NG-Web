(() => {
	const get = (id) => document.getElementById(id);
	let state = null, busy = false, pollTimer;
	async function request(action, body) {
		const response = await fetch("/api/update/" + action, body === undefined ? {} : {
			method: "POST", headers: { "Content-Type": "application/json", "X-Chiaki-Update": "1" }, body: JSON.stringify(body)
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || "Update request failed.");
		return result;
	}
	function render(data) {
		state = data;
		get("update-auto").checked = data.autoCheck;
		const prefix = "Installed: " + data.current + ". ";
		let message = "Automatic checks are " + (data.autoCheck ? "on." : "off.");
		if (data.status === "available") message = "Version " + data.latest.version + (data.latest.preview ? " (community preview)" : "") + " is available.";
		if (data.status === "current") message = "You have the newest compatible browser release.";
		if (data.status === "checking") message = "Checking GitHub…";
		if (data.status === "downloading") message = "Downloading and verifying the installer. Keep the app open…";
		if (data.status === "installing") message = "Installing. The app will close and reopen shortly…";
		if (data.status === "error") message = data.error + " Your current version is unchanged.";
		get("update-status").textContent = prefix + message;
		get("update-release").href = data.latest?.page || "https://github.com/SKIZZOO/Chiaki-NG-Web/releases";
		const working = busy || ["checking", "downloading", "installing"].includes(data.status);
		get("update-check").disabled = working;
		get("update-install").disabled = working || !data.installable || !data.latest;
		get("update-notice").classList.toggle("hidden", !data.latest);
		if (data.current !== "development") get("app-version").textContent = data.current;
	}
	async function refresh() {
		try {
			const data = await request("status");
			if (state?.status === "installing" && data.current !== state.current) { location.reload(); return; }
			render(data);
		}
		catch { if (!state || state.status !== "installing") get("update-status").textContent = "Update service unavailable. Reopen the app or use the GitHub download."; }
	}
	async function action(name, body) {
		busy = true; if (state) render(state);
		try { const result = await request(name, body); if (result.current) state = result; }
		catch (e) { get("update-status").textContent = e.message; }
		finally { busy = false; await refresh(); clearTimeout(pollTimer); pollTimer = setTimeout(poll, 1500); }
	}
	get("update-check").onclick = () => action("check", {});
	get("update-auto").onchange = () => action("settings", { autoCheck: get("update-auto").checked });
	get("update-install").onclick = () => {
		if (!state?.latest || !confirm("Install version " + state.latest.version + "? This closes any active stream and restarts Chiaki. Your pairings and settings will be kept.")) return;
		action("install", { version: state.latest.version });
	};
	get("update-notice").onclick = () => openSettingsTab("general");
	window.addEventListener("hashchange", () => { if (location.hash === "#updates") openSettingsTab("general"); });
	refresh();
	async function poll() {
		if (!document.hidden) await refresh();
		pollTimer = setTimeout(poll, ["checking", "downloading", "installing"].includes(state?.status) ? 1500 : 60000);
	}
	pollTimer = setTimeout(poll, 35000);
})();
