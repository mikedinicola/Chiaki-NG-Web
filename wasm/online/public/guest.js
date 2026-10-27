(() => {
	const get = (id) => document.getElementById(id), video = get("video");
	const token = /^#invite=([a-f0-9]{48})$/.exec(location.hash)?.[1];
	// Keep the bearer invite out of subsequent URL copies and browser history entries.
	if (token) history.replaceState(null, "", location.pathname);
	let ws, pc, channel, role = "watch", stopped = false, joined = false;
	let lease = "", sequence = 0;
	let lastSignal = performance.now();
	const ice = [], keys = new Set(), mouse = ChiakiControls.createMouse();
	let left = false, right = false;
	const status = (message) => { get("status").textContent = message; };
	const signal = (data) => { if (ws?.readyState === 1 && ws.bufferedAmount < 32768) ws.send(JSON.stringify(data)); };
	function close(message = "Session ended. Ask your host for a new invite.") {
		stopped = true; role = "watch"; keys.clear(); mouse.reset(); channel?.close(); pc?.close(); ws?.close();
		if (video.srcObject) for (const track of video.srcObject.getTracks()) track.stop();
		video.srcObject = null; document.exitPointerLock?.(); status(message);
	}
	get("join").onsubmit = (event) => {
		event.preventDefault(); if (!token || joined) return;
		joined = true; get("join").hidden = true; status("Connecting…");
		ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/online");
		ws.onopen = () => signal({ type: "join", token, name: get("name").value });
		ws.onmessage = async (event) => {
			lastSignal = performance.now();
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === "waiting") status("Waiting for the host to approve you…");
				if (msg.type === "approved") {
					pc = new RTCPeerConnection({ iceServers: msg.iceServers });
					role = msg.role; lease = msg.lease;
					pc.onicecandidate = (ev) => { if (ev.candidate) signal({ type: "ice", candidate: ev.candidate.toJSON() }); };
					pc.ontrack = (ev) => {
						video.srcObject ||= new MediaStream(); video.srcObject.addTrack(ev.track);
						video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
					};
					pc.ondatachannel = (ev) => { if (ev.channel.label !== "controls" || channel) { ev.channel.close(); return; } channel = ev.channel; };
					pc.onconnectionstatechange = () => {
						if (pc.connectionState === "failed") close("Connection failed. Ask the host to check the TURN server and firewall.");
						else if (pc.connectionState === "connected") status(role === "play" ? "Connected · you can play" : "Connected · watch only");
					};
					status("Approved · connecting the video…");
				}
				if (msg.type === "offer" && pc) {
					await ChiakiOnlineProtocol.remote(pc, ice, msg.sdp);
					const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
					signal({ type: "answer", sdp: pc.localDescription.toJSON() });
				}
				if (msg.type === "ice" && pc) await ChiakiOnlineProtocol.ice(pc, ice, msg.candidate);
				if (msg.type === "role") { role = msg.role; lease = msg.lease; get("permission").textContent = role === "play" ? "Play access granted. Controller or keyboard/mouse input controls the host's active game." : "Watch-only access. Your input is not sent."; if (pc?.connectionState === "connected") status(role === "play" ? "Connected · you can play" : "Connected · watch only"); }
				if (msg.type === "ended" || msg.type === "error") close(msg.message || "The host ended or revoked this session.");
			} catch { close("Could not negotiate the connection. Ask the host to create a fresh invite."); }
		};
		ws.onclose = () => { if (!stopped) close("Disconnected from the invitation service. Access has stopped."); };
		ws.onerror = () => { if (!stopped) close("Could not reach the invitation service."); };
	};
	function snapshot() {
		const p = { type: "pad", buttons: 0, l2: 0, r2: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
		if (document.hidden || !document.hasFocus()) return p;
		const gp = Array.from(navigator.getGamepads?.() || []).find((g) => g?.connected && g.mapping === "standard");
		if (gp) {
			for (const [index, bit] of [[0,0],[1,1],[2,2],[3,3],[4,8],[5,9],[10,10],[11,11],[12,6],[13,7],[14,4],[15,5]]) if (gp.buttons[index]?.pressed) p.buttons |= 1 << bit;
			p.l2 = (gp.buttons[6]?.value || 0) * 255; p.r2 = (gp.buttons[7]?.value || 0) * 255;
			[p.lx,p.ly,p.rx,p.ry] = [0,1,2,3].map((i) => Math.abs(gp.axes[i] || 0) > .12 ? gp.axes[i] * 32767 : 0);
		}
		const movement = ChiakiControls.movement(keys);
		if (movement.x || movement.y) { p.lx = movement.x * 32767; p.ly = movement.y * 32767; }
		for (const [code, bit] of [["Space",0],["KeyC",1],["ControlLeft",1],["KeyR",2],["KeyE",3],["KeyQ",8],["KeyG",9],["ShiftLeft",10],["KeyV",11],["Digit1",6],["Digit2",5],["Digit3",7],["Digit4",4]]) if (keys.has(code)) p.buttons |= 1 << bit;
		if (document.pointerLockElement === video) {
			const aim = mouse.read(performance.now()); p.rx = aim.x * 32767; p.ry = aim.y * 32767;
			if (left) p.r2 = 255; if (right) p.l2 = 255;
		}
		return { type: "pad", ...ChiakiOnlineProtocol.pad(p) };
	}
	function transmit(pad = snapshot()) { if (!stopped && role === "play" && channel?.readyState === "open" && channel.bufferedAmount < 4096) channel.send(JSON.stringify({ ...pad, seq: ++sequence, lease })); }
	const neutral = () => { keys.clear(); mouse.reset(); left = right = false; transmit({ type: "pad" }); };
	window.addEventListener("keydown", (e) => { if (role !== "play" || e.target.closest("input,button")) return; keys.add(e.code); transmit(); if (e.code === "Space") e.preventDefault(); });
	window.addEventListener("keyup", (e) => { keys.delete(e.code); transmit(); });
	window.addEventListener("blur", neutral); document.addEventListener("visibilitychange", neutral);
	document.addEventListener("pointerlockchange", neutral);
	document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === video) mouse.push(e.movementX, e.movementY, performance.now()); });
	document.addEventListener("mousedown", (e) => { if (document.pointerLockElement === video) { if (e.button === 0) left = true; if (e.button === 2) right = true; } });
	document.addEventListener("mouseup", (e) => { if (e.button === 0) left = false; if (e.button === 2) right = false; });
	video.oncontextmenu = (e) => e.preventDefault();
	get("capture").onclick = () => { if (role === "play") video.requestPointerLock?.(); };
	video.onclick = () => { if (role === "play") video.requestPointerLock?.(); };
	get("sound").onclick = () => { video.muted = false; video.play().catch(() => {}); };
	get("leave").onclick = () => close("You left the session."); window.addEventListener("pagehide", () => close());
	setInterval(() => transmit(), 16);
	setInterval(() => {
		if (stopped || !joined || ws?.readyState !== 1) return;
		if (performance.now() - lastSignal > 6000) close("Invitation service stopped responding. Access has stopped.");
		else signal({ type: "ping" });
	}, 2000);
	if (!token) { get("join").hidden = true; status("This link has no valid invite. Ask your host to copy a fresh invite."); }
})();
