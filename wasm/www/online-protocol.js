globalThis.ChiakiOnlineProtocol = Object.freeze({
	input(peer, message, now) {
		if (!peer.approved || peer.role !== "play" || !message || message.lease !== peer.lease || !Number.isSafeInteger(message.seq) || message.seq <= peer.lastSeq) return false;
		const pad = this.pad(message); if (!pad) return false;
		peer.lastSeq = message.seq; peer.input = pad; peer.inputAt = now; return true;
	},
	// Remote guests get gameplay buttons only; system/PS/share/menu buttons stay local.
	pad(value) {
		if (!value || value.type !== "pad") return null;
		const integer = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : 0;
		return { buttons: integer(value.buttons, 0, 65535) & 0x0fff,
			l2: integer(value.l2, 0, 255), r2: integer(value.r2, 0, 255),
			lx: integer(value.lx, -32767, 32767), ly: integer(value.ly, -32767, 32767),
			rx: integer(value.rx, -32767, 32767), ry: integer(value.ry, -32767, 32767) };
	},
	async ice(pc, queue, candidate) {
		if (pc.remoteDescription) await pc.addIceCandidate(candidate);
		else if (queue.length < 64) queue.push(candidate);
	},
	async remote(pc, queue, description) {
		await pc.setRemoteDescription(description);
		while (queue.length) await pc.addIceCandidate(queue.shift());
	},
	setup(value) {
		if (typeof value !== "string" || value.length > 2048 || !/^chiaki-host-v1:[A-Za-z0-9_-]+$/.test(value.trim())) throw new Error("Paste the private chiaki-host-v1 setup code from your invitation server.");
		let data;
		try { data = JSON.parse(atob(value.trim().slice(15).replace(/-/g, "+").replace(/_/g, "/"))); } catch { throw new Error("The setup code is incomplete or invalid. Copy it again from your server."); }
		return this.credentials(data?.server, data?.key);
	},
	credentials(server, key) {
		if (typeof server !== "string" || typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) throw new Error("Use a valid server address and its private 64-character host key.");
		return { server: this.url(server), key };
	},
	url(value) {
		const url = new URL(value);
		if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Use your server's HTTPS address without a path, username or password.");
		return url.origin;
	}
});
