(() => {
	const get = (id) => document.getElementById(id), peers = new Map();
	let ws, origin, invite = "", iceServers = [], capture, ctx, media, destination, expires = 0, active = false;
	let lastSignal = performance.now();
	const tell = (message) => { get("online-status").textContent = message; };
	const send = (data) => { if (ws?.readyState === 1 && ws.bufferedAmount < 32768) ws.send(JSON.stringify(data)); };
	function remove(id) { const peer = peers.get(id); if (peer) { peer.pc?.close(); peer.channel?.close(); peer.row.remove(); peers.delete(id); } }
	function stop(message = "Online session stopped. All guests and the invite are disconnected.") {
		send({ type: "revoke" }); active = false; invite = "";
		const previous = ws; ws = null; previous?.close(); for (const id of peers.keys()) remove(id);
		try { if (destination) audio.gain?.disconnect(destination); } catch {}
		destination = null;
		for (const track of media?.getTracks() || []) track.stop();
		media = capture = ctx = null;
		get("online-invite").value = ""; get("online-start").disabled = false;
		get("online-stop").disabled = true; get("online-copy").disabled = true;
		get("btn-online-stop").classList.add("hidden"); tell(message);
	}
	function row(msg) {
		const peer = { role: "watch", lease: "", lastSeq: 0, approved: false, input: null, inputAt: 0, queue: [], pc: null, name: msg.name };
		const item = document.createElement("li"); peer.row = item;
		const name = document.createElement("span"); name.textContent = msg.name + " · waiting for approval "; item.append(name);
		for (const [label, type, role] of [["Watch only", "approve", "watch"], ["Let play", "approve", "play"], ["Remove", "kick", "watch"]]) {
			const button = document.createElement("button"); button.type = "button"; button.textContent = label;
			button.onclick = () => send({ type: type === "approve" && peer.approved ? "role" : type, id: msg.id, role }); item.append(button);
		}
		get("online-guests").append(item); peers.set(msg.id, peer);
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
			if (pc.connectionState === "failed") { send({ type: "kick", id }); remove(id); tell("Guest connection failed. Check TURN connectivity and ask them to rejoin."); }
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
		try { origin = ChiakiOnlineProtocol.url(get("online-server").value.trim()); } catch (e) { tell(e.message); return; }
		const key = get("online-key").value.trim(); get("online-key").value = "";
		if (!/^[a-f0-9]{64}$/.test(key)) { tell("Paste the 64-character host key from your self-hosted server setup."); return; }
		get("online-start").disabled = true; tell("Connecting to your invitation server…");
		ws = new WebSocket(origin.replace(/^http/, "ws") + "/online");
		const connection = ws;
		ws.onopen = () => { if (ws === connection) send({ type: "create", hostKey: key, minutes: Number(get("online-minutes").value) }); };
		ws.onmessage = async (event) => {
			if (ws !== connection) return;
			lastSignal = performance.now();
			let msg;
			try {
				msg = JSON.parse(event.data);
				if (msg.type === "created") {
					active = true; iceServers = msg.iceServers; expires = msg.expires; invite = origin + "/#invite=" + msg.token;
					capture = document.createElement("canvas"); capture.width = get("online-quality").value === "1080" ? 1920 : 1280; capture.height = capture.width * 9 / 16;
					ctx = capture.getContext("2d", { alpha: false }); media = capture.captureStream(0);
					if (typeof media.getVideoTracks()[0]?.requestFrame !== "function") { media.getTracks().forEach((t) => t.stop()); media = capture.captureStream(60); }
					if (audio.ctx && audio.gain) { destination = audio.ctx.createMediaStreamDestination(); audio.gain.connect(destination); for (const track of destination.stream.getAudioTracks()) media.addTrack(track); }
					get("online-invite").value = invite; get("online-stop").disabled = false; get("online-copy").disabled = false;
					get("btn-online-stop").classList.remove("hidden");
					tell("Invite ready until " + new Date(expires).toLocaleTimeString() + ". Approve guests below. Keep this tab visible while hosting.");
				}
				if (msg.type === "request") row(msg);
				if (msg.type === "approved") { const peer = peers.get(msg.id); if (peer) { peer.approved = true; peer.role = msg.role; peer.lease = msg.lease; await connect(msg.id); } }
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
	get("btn-online-open").onclick = () => openSettingsTab("general");
	window.addEventListener("pagehide", () => stop());
	setInterval(() => {
		if (!active) return;
		if (performance.now() - lastSignal > 6000) stop("Invitation service stopped responding. Guest access was revoked locally.");
		else send({ type: "ping" });
	}, 2000);
	globalThis.ChiakiOnline = {
		stop, streamState(on) { if (!on && active) stop("Console stream stopped. The online session and invite were revoked."); },
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
})();
