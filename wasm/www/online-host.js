(() => {
	const get = (id) => document.getElementById(id), peers = new Map();
	let ws, origin, invite = "", iceServers = [], capture, ctx, media, destination, expires = 0, active = false;
	let lastSignal = performance.now(), credentials = null, connecting = false, connectTimer;
	function render() {
		get("online-setup").hidden = !!credentials;
		get("online-configured").hidden = !credentials;
		get("online-server-name").textContent = credentials ? new URL(credentials.server).host : "";
		get("online-change").disabled = active || connecting;
		get("online-start").disabled = !streaming || !credentials || active || connecting;
		get("online-start").textContent = connecting ? "Creating invite…" : "Create invite";
		get("online-stream-help").hidden = !!streaming;
		get("online-invite-ready").hidden = !active;
		get("online-people").hidden = !active;
		get("online-waiting").hidden = peers.size > 0;
		for (const [id, done] of [["online-step-stream", !!streaming], ["online-step-server", !!credentials], ["online-step-invite", active]]) get(id).classList.toggle("complete", done);
	}
	function useSetup(value) {
		credentials = value; get("online-setup-code").value = ""; get("online-key").value = ""; get("online-server").value = "";
		tell(streaming ? "Setup loaded. Create an invite to connect to this server." : "Setup loaded. Start your console, then create an invite."); render();
	}
	get("online-open-consoles").onclick = () => get("btn-settings-back").click();
	get("online-setup-use").onclick = () => { try { useSetup(ChiakiOnlineProtocol.setup(get("online-setup-code").value)); } catch (e) { tell(e.message); } };
	get("online-manual-use").onclick = () => { try { useSetup(ChiakiOnlineProtocol.credentials(get("online-server").value.trim(), get("online-key").value.trim())); } catch (e) { tell(e.message); } };
	get("online-change").onclick = () => { if (active || connecting) return; credentials = null; tell("Paste a new private setup code."); render(); };

	const tell = (message) => { get("online-status").textContent = message; };
	const send = (data) => { if (ws?.readyState === 1 && ws.bufferedAmount < 32768) ws.send(JSON.stringify(data)); };
	function remove(id) { const peer = peers.get(id); if (peer) { peer.pc?.close(); peer.channel?.close(); peer.row.remove(); peers.delete(id); render(); } }
	function stop(message = "Online session stopped. All guests and the invite are disconnected.") {
		clearTimeout(connectTimer); send({ type: "revoke" }); active = false; connecting = false; invite = "";
		const previous = ws; ws = null; previous?.close(); for (const id of peers.keys()) remove(id);
		try { if (destination) audio.gain?.disconnect(destination); } catch {}
		destination = null;
		for (const track of media?.getTracks() || []) track.stop();
		media = capture = ctx = null;
		get("online-invite").value = ""; get("online-start").disabled = false;
		get("online-stop").disabled = true; get("online-copy").disabled = true;
		get("btn-online-stop").classList.add("hidden"); tell(message); render();
	}
	function row(msg) {
		const peer = { role: "watch", lease: "", lastSeq: 0, approved: false, input: null, inputAt: 0, queue: [], pc: null, name: msg.name };
		const item = document.createElement("li"); peer.row = item;
		const name = document.createElement("span"); name.textContent = msg.name + " · waiting for approval "; item.append(name);
		for (const [label, type, role] of [["Watch only", "approve", "watch"], ["Let play", "approve", "play"], ["Remove", "kick", "watch"]]) {
			const button = document.createElement("button"); button.type = "button"; button.textContent = label;
			button.onclick = () => send({ type: type === "approve" && peer.approved ? "role" : type, id: msg.id, role }); item.append(button);
		}
		get("online-guests").append(item); peers.set(msg.id, peer); render();
	}
	async function connect(id) {
		const peer = peers.get(id); if (!peer || peer.pc || !media) return;
		const pc = peer.pc = new RTCPeerConnection({ iceServers });
		for (const track of media.getTracks()) pc.addTrack(track, media);
		const codecs = RTCRtpSender.getCapabilities?.("video")?.codecs;
		if (codecs) {
			const ordered = codecs.slice().sort((a, b) => Number(b.mimeType.toLowerCase() === "video/h264") - Number(a.mimeType.toLowerCase() === "video/h264"));
			for (const transceiver of pc.getTransceivers()) if (transceiver.sender.track?.kind === "video") try { transceiver.setCodecPreferences(ordered); } catch {}
		}
		const channel = peer.channel = pc.createDataChannel("controls", { ordered: false, maxRetransmits: 0 });
		let count = 0, at = performance.now();
		channel.onmessage = (event) => {
			if (performance.now() - at >= 1000) { at = performance.now(); count = 0; }
			if (typeof event.data !== "string" || event.data.length > 512 || ++count > 180) { send({ type: "kick", id }); remove(id); return; }
			if (peer.role !== "play" || !peer.approved || !active) return;
			try {
				ChiakiOnlineProtocol.input(peer, JSON.parse(event.data), performance.now());
			} catch { peer.input = null; }
		};
		channel.onclose = () => { peer.input = null; };
		pc.ondatachannel = (event) => event.channel.close();
		pc.onicecandidate = (event) => { if (event.candidate) send({ type: "ice", id, candidate: event.candidate.toJSON() }); };
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === "failed") { send({ type: "kick", id }); remove(id); tell("Could not connect to your friend. Ask them to rejoin. If it keeps failing, check the server relay ports in the setup guide."); }
		};
		for (const sender of pc.getSenders()) if (sender.track?.kind === "video") {
			const params = sender.getParameters(); params.encodings ||= [{}];
			params.encodings[0].maxBitrate = get("online-quality").value === "1080" ? 10000000 : 6000000;
			params.encodings[0].maxFramerate = 60; await sender.setParameters(params).catch(() => {});
		}
		const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
		send({ type: "offer", id, sdp: pc.localDescription.toJSON() });
	}
	get("online-start").onclick = () => {
		if (!streaming) { tell("Start your console stream first, then open Online play again."); return; }
		if (active || connecting) return;
		if (!credentials) { tell("Load your private server setup first."); render(); return; }
		origin = credentials.server; const key = credentials.key;
		connecting = true; render(); tell("Creating your private invite…");
		try { ws = new WebSocket(origin.replace(/^http/, "ws") + "/online"); } catch { stop("This browser could not open the server connection. Check the server address and try again."); return; }
		const connection = ws;
		connectTimer = setTimeout(() => { if (ws === connection && !active) stop("The server did not respond. Check its address, or rerun start.sh on the server."); }, 15000);
		ws.onopen = () => { if (ws === connection) send({ type: "create", hostKey: key, minutes: Number(get("online-minutes").value) }); };
		ws.onmessage = async (event) => {
			if (ws !== connection) return;
			lastSignal = performance.now();
			let msg;
			try {
				msg = JSON.parse(event.data);
				if (msg.type === "created") {
					clearTimeout(connectTimer); active = true; connecting = false; iceServers = msg.iceServers; expires = msg.expires; invite = origin + "/#invite=" + msg.token;
					capture = document.createElement("canvas"); capture.width = get("online-quality").value === "1080" ? 1920 : 1280; capture.height = capture.width * 9 / 16;
					ctx = capture.getContext("2d", { alpha: false }); media = capture.captureStream(0);
					if (typeof media.getVideoTracks()[0]?.requestFrame !== "function") { media.getTracks().forEach((t) => t.stop()); media = capture.captureStream(60); }
					if (audio.ctx && audio.gain) { destination = audio.ctx.createMediaStreamDestination(); audio.gain.connect(destination); for (const track of destination.stream.getAudioTracks()) media.addTrack(track); }
					get("online-invite").value = invite; get("online-stop").disabled = false; get("online-copy").disabled = false;
					get("btn-online-stop").classList.remove("hidden");
					tell("Invite ready until " + new Date(expires).toLocaleTimeString() + ". Copy the link and send it privately to your friend."); render();
				}
				if (msg.type === "request") row(msg);
				if (msg.type === "approved") { const peer = peers.get(msg.id); if (peer) { peer.approved = true; peer.role = msg.role; peer.lease = msg.lease; peer.row.firstChild.textContent = peer.name + " · " + (msg.role === "play" ? "can play " : "watch only "); await connect(msg.id); } }
				if (msg.type === "role") { const peer = peers.get(msg.id); if (peer) { peer.role = msg.role; peer.lease = msg.lease; peer.lastSeq = 0; peer.input = null; peer.row.firstChild.textContent = peer.name + " · " + (msg.role === "play" ? "can play " : "watch only "); } }
				if (msg.type === "answer") { const peer = peers.get(msg.id); if (peer?.pc) await ChiakiOnlineProtocol.remote(peer.pc, peer.queue, msg.sdp); }
				if (msg.type === "ice") { const peer = peers.get(msg.id); if (peer?.pc) await ChiakiOnlineProtocol.ice(peer.pc, peer.queue, msg.candidate); }
				if (msg.type === "left") remove(msg.id);
				if (msg.type === "ended" || msg.type === "error") stop(msg.message || "Session ended or expired. Create a fresh invite to continue.");
			} catch {
				if (ws !== connection) return;
				if (msg?.id && peers.has(msg.id)) { send({ type: "kick", id: msg.id }); remove(msg.id); tell("A guest negotiation failed and that guest was disconnected."); }
				else stop("Could not negotiate the session. Check your server and try a new invite.");
			}
		};
		ws.onclose = () => { if (ws === connection) stop("Disconnected from the invitation server. All guest access has stopped."); };
		ws.onerror = () => { if (ws === connection) stop("Could not reach the invitation server. Check its HTTPS address and certificate."); };
	};
	get("online-stop").onclick = () => stop(); get("btn-online-stop").onclick = () => stop();
	get("online-copy").onclick = async () => { try { await navigator.clipboard.writeText(invite); tell("Invite copied. Send it privately; each guest still needs approval."); } catch { get("online-invite").select(); tell("Copy the selected invite and send it privately."); } };
	get("btn-online-open").onclick = () => { render(); openSettingsTab("online"); };
	window.addEventListener("pagehide", () => { credentials = null; get("online-key").value = ""; get("online-setup-code").value = ""; stop(); });
	setInterval(() => {
		if (!active) return;
		if (performance.now() - lastSignal > 6000) stop("Invitation service stopped responding. Guest access was revoked locally.");
		else send({ type: "ping" });
	}, 2000);
	globalThis.ChiakiOnline = {
		stop, streamState(on) { if (!on && (active || connecting)) stop("Console stream stopped. The online session and invite were revoked."); render(); },
		frame(frame) {
			if (!active || !ctx || !Array.from(peers.values()).some((p) => p.approved)) return;
			ctx.drawImage(frame, 0, 0, capture.width, capture.height); media.getVideoTracks()[0]?.requestFrame?.();
		},
		pad() {
			if (!active || Date.now() >= expires || ws?.readyState !== 1) return null;
			for (const peer of peers.values()) if (peer.approved && peer.role === "play" && performance.now() - peer.inputAt < 250) return peer.input;
			return null;
		}
	};
	render();
})();
