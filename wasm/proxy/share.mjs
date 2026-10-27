import crypto from "node:crypto";

function encodeWsText(text) {
	const payload = Buffer.from(String(text), "utf8");
	const len = payload.length;
	let header;
	if (len < 126) {
		header = Buffer.alloc(2);
		header[0] = 0x81;
		header[1] = len;
	} else if (len < 65536) {
		header = Buffer.alloc(4);
		header[0] = 0x81;
		header[1] = 126;
		header.writeUInt16BE(len, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x81;
		header[1] = 127;
		header.writeBigUInt64BE(BigInt(len), 2);
	}
	return Buffer.concat([header, payload]);
}

const GUEST_TO_HOST = new Set(["offer", "answer", "ice", "pad", "pli", "bye"]);

export function createShareHub({ store, decodeWsFrame, wsAccept, readCookie, authEnabled = true }) {
	const rooms = new Map();

	function send(socket, obj) {
		if (socket.writableLength > 128 * 1024) { socket.destroy(); return; }
		try { socket.write(encodeWsText(JSON.stringify(obj))); }
		catch {}
	}

	function roomOf(token) {
		let room = rooms.get(token);
		if (!room) {
			room = { host: null, guests: new Map() };
			rooms.set(token, room);
		}
		return room;
	}

	function viewerCount(token) {
		const room = rooms.get(token);
		return room ? room.guests.size : 0;
	}

	function rightsOf(token) {
		return store.getShareByToken(token);
	}

	function dropSocket(socket) {
		const meta = socket._share;
		if (!meta) return;
		socket._share = null;
		const room = rooms.get(meta.token);
		if (!room) return;
		if (meta.role === "host" && room.host === socket) {
			room.host = null;
			for (const guest of room.guests.values())
				send(guest, { type: "host-left" });
		} else if (meta.role === "guest") {
			room.guests.delete(meta.id);
			if (room.host) send(room.host, { type: "guest-leave", id: meta.id, viewers: room.guests.size });
		}
		if (!room.host && room.guests.size === 0)
			rooms.delete(meta.token);
	}

	function onMessage(socket, raw) {
		const meta = socket._share;
		if (!meta) return;
		const rights = store.getShareByToken(meta.token);
		if (!rights?.active) { socket.destroy(); return; }
		const now = Date.now();
		if (now - meta.at > 1000) { meta.at = now; meta.messages = 0; }
		if (++meta.messages > 100) { socket.destroy(); return; }
		let msg;
		try { msg = JSON.parse(String(raw)); }
		catch { return; }
		if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
		const room = rooms.get(meta.token);
		if (!room) return;
		if (meta.role === "host") {
			if (msg.to && room.guests.has(msg.to)) {
				send(room.guests.get(msg.to), { ...msg, to: undefined, from: "host" });
				return;
			}
			if (msg.type === "status" || msg.type === "rights") {
				for (const guest of room.guests.values()) send(guest, msg);
			}
			return;
		}
		if (!GUEST_TO_HOST.has(msg.type)) return;
		if (msg.type === "offer") return;
		if (msg.type === "pad") {
			if (!rights.vpad && !rights.gamepad) return;
			const clamp = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : 0;
			msg = { type: "pad", buttons: clamp(msg.buttons, 0, 65535) & 0x0fff,
				l2: clamp(msg.l2, 0, 255), r2: clamp(msg.r2, 0, 255), lx: clamp(msg.lx, -32767, 32767), ly: clamp(msg.ly, -32767, 32767),
				rx: clamp(msg.rx, -32767, 32767), ry: clamp(msg.ry, -32767, 32767) };
		}
		if (room.host) send(room.host, { ...msg, rights: undefined, from: meta.id });
	}

	function attach(req, socket) {
		const url = new URL(req.url || "/", "http://127.0.0.1");
		const guestToken = (url.searchParams.get("token") || "").trim();
		let role = "host";
		let share = null;
		if (guestToken) {
			share = store.getShareByToken(guestToken);
			if (!share || !share.active) {
				socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
			role = "guest";
		} else {
			const peer = req.socket?.remoteAddress;
			const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer);
			const user = authEnabled ? store.userBySession(readCookie(req, "chiaki_sid")) : local ? store.ensureLocalUser() : null;
			if (!user) {
				socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
			share = store.getShareByUser(user.id);
			if (!share || !share.active) {
				socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
		}
		const key = req.headers["sec-websocket-key"];
		if (!key) {
			socket.destroy();
			return;
		}
		socket.write(
			"HTTP/1.1 101 Switching Protocols\r\n" +
			"Upgrade: websocket\r\n" +
			"Connection: Upgrade\r\n" +
			`Sec-WebSocket-Accept: ${wsAccept(key)}\r\n` +
			"\r\n"
		);
		const room = roomOf(share.token);
		if (role === "guest" && room.guests.size >= 4) { socket.destroy(); return; }
		const id = crypto.randomBytes(8).toString("hex");
		socket._share = { role, token: share.token, id, at: Date.now(), messages: 0 };
		if (role === "host") {
			if (room.host && room.host !== socket) {
				try { room.host.end(); } catch {}
			}
			room.host = socket;
			send(socket, { type: "hello", role: "host", rights: share, viewers: room.guests.size });
			for (const [gid] of room.guests)
				send(socket, { type: "guest-join", id: gid, viewers: room.guests.size });
		} else {
			room.guests.set(id, socket);
			send(socket, {
				type: "hello",
				role: "guest",
				rights: share,
				language: store.shareLanguage(share.userId),
				viewers: room.guests.size
			});
			if (room.host) send(room.host, { type: "guest-join", id, viewers: room.guests.size });
		}

		let acc = Buffer.alloc(0);
		socket.on("data", (chunk) => {
			if (acc.length + chunk.length > 65536) { socket.destroy(); return; }
			acc = Buffer.concat([acc, chunk]);
			for (;;) {
				if (acc.length >= 2 && (!(acc[0] & 128) || (acc[0] & 112) || !(acc[1] & 128))) { socket.destroy(); return; }
				let frame;
				try { frame = decodeWsFrame(acc); } catch { socket.destroy(); return; }
				if (!frame) break;
				acc = frame.rest;
				if (frame.opcode === 0x8) {
					dropSocket(socket);
					socket.end();
					return;
				}
				if (frame.opcode === 0x9) {
					if (frame.payload.length > 125) { socket.destroy(); return; }
					const pong = Buffer.from(frame.payload);
					socket.write(Buffer.concat([Buffer.from([0x8a, pong.length]), pong]));
					continue;
				}
				if (frame.opcode === 0x1 || frame.opcode === 0x2)
					onMessage(socket, frame.payload);
			}
		});
		socket.on("close", () => dropSocket(socket));
		socket.on("error", () => dropSocket(socket));
	}

	const audit = setInterval(() => {
		for (const [token, room] of rooms) {
			if (store.getShareByToken(token)?.active) continue;
			for (const peer of [room.host, ...room.guests.values()]) if (peer) { peer.destroy(); dropSocket(peer); }
			rooms.delete(token);
		}
	}, 1000); audit.unref();
	return { attach, viewerCount, rightsOf, close() { clearInterval(audit); for (const room of rooms.values()) for (const socket of [room.host, ...room.guests.values()]) socket?.destroy(); rooms.clear(); } };
}
