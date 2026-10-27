import crypto from "node:crypto";

const random = () => crypto.randomBytes(24).toString("hex");
const idPattern = /^[a-f0-9]{48}$/;
const description = (value, type) => value && value.type === type && typeof value.sdp === "string" && value.sdp.length <= 24000 ? { type, sdp: value.sdp } : null;
export class Rooms {
	constructor({ hostKey, turnSecret, turnUrls = [], now = Date.now, maxRooms = 16 }) {
		if (!/^[a-f0-9]{64}$/.test(hostKey)) throw new Error("HOST_KEY must be 32 random bytes encoded as hex.");
		if (turnUrls.length && !/^[a-f0-9]{64}$/.test(turnSecret)) throw new Error("TURN_SECRET must be 32 random bytes encoded as hex.");
		this.hostDigest = crypto.createHash("sha256").update(hostKey).digest();
		this.turnSecret = turnSecret; this.turnUrls = turnUrls; this.now = now; this.maxRooms = maxRooms;
		this.rooms = new Map(); this.clients = new Set();
	}
	send(client, data) { if (!client.closed) client.send(data); }
	ice(room, id) {
		if (!this.turnUrls.length) return [];
		const username = `${Math.ceil(room.expires / 1000)}:${id}`;
		return [{ urls: this.turnUrls, username, credential: crypto.createHmac("sha1", this.turnSecret).update(username).digest("base64") }];
	}
	connect(client) { client.created = this.now(); client.id = random(); this.clients.add(client); }
	endRoom(room) {
		this.rooms.delete(room.token);
		for (const peer of room.guests.values()) { this.send(peer, { type: "ended" }); peer.close(); this.disconnect(peer); }
		room.guests.clear();
		this.send(room.host, { type: "ended" }); room.host.close(); this.disconnect(room.host);
	}
	disconnect(client) {
		this.clients.delete(client); client.closed = true;
		const room = client.room; client.room = null;
		if (!room || !this.rooms.has(room.token)) return;
		if (room.host === client) { this.endRoom(room); return; }
		room.guests.delete(client.id);
		this.send(room.host, { type: "left", id: client.id });
	}
	expire() {
		for (const room of this.rooms.values()) if (room.expires <= this.now()) this.endRoom(room);
		for (const client of this.clients) {
			if ((!client.room && this.now() - client.created > 10000) || (client.room && client !== client.room.host && !client.approved && this.now() - client.created > 60000)) {
				client.close(); this.disconnect(client);
			}
		}
	}
	role(room, peer, role) {
		if (!["watch", "play"].includes(role)) throw new Error("Invalid permission.");
		if (role === "play") for (const other of room.guests.values()) {
			if (other !== peer && other.role === "play") {
				other.role = "watch";
				other.lease = "";
				this.send(other, { type: "role", role: "watch", lease: "" });
				this.send(room.host, { type: "role", id: other.id, role: "watch", lease: "" });
			}
		}
		peer.role = role;
		peer.lease = role === "play" ? random() : "";
		this.send(peer, { type: "role", role, lease: peer.lease }); this.send(room.host, { type: "role", id: peer.id, role, lease: peer.lease });
	}
	message(client, msg) {
		if (!msg || typeof msg !== "object" || Array.isArray(msg) || client.closed) throw new Error("Invalid message.");
		this.expire(); if (client.closed) return;
		if (!client.room) {
			if (msg.type === "create") {
				const supplied = crypto.createHash("sha256").update(typeof msg.hostKey === "string" ? msg.hostKey : "").digest();
				if (!crypto.timingSafeEqual(supplied, this.hostDigest)) throw new Error("Host authentication failed.");
				if (this.rooms.size >= this.maxRooms) throw new Error("Server session limit reached.");
				const minutes = Number.isInteger(msg.minutes) ? Math.min(120, Math.max(5, msg.minutes)) : 30;
				const room = { token: random(), host: client, guests: new Map(), expires: this.now() + minutes * 60000 };
				client.room = room; this.rooms.set(room.token, room);
				this.send(client, { type: "created", token: room.token, expires: room.expires, iceServers: this.ice(room, client.id) });
				return;
			}
			if (msg.type === "join") {
				const room = typeof msg.token === "string" && idPattern.test(msg.token) ? this.rooms.get(msg.token) : null;
				if (!room || room.guests.size >= 4) throw new Error("Invite unavailable, expired or full.");
				client.room = room; client.approved = false; client.role = "watch";
				client.name = typeof msg.name === "string" ? msg.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 32) : "Guest";
				room.guests.set(client.id, client);
				this.send(client, { type: "waiting" });
				this.send(room.host, { type: "request", id: client.id, name: client.name || "Guest" }); return;
			}
			throw new Error("Authenticate or join first.");
		}
		const room = client.room;
		if (msg.type === "ping") { this.send(client, { type: "pong" }); return; }
		if (room.host === client) {
			if (msg.type === "revoke") { this.endRoom(room); return; }
			const peer = typeof msg.id === "string" ? room.guests.get(msg.id) : null;
			if (!peer) throw new Error("Guest unavailable.");
			if (msg.type === "kick") { peer.close(); this.disconnect(peer); return; }
			if (msg.type === "approve" && !peer.approved) {
				if (!["watch", "play"].includes(msg.role)) throw new Error("Invalid permission.");
				peer.approved = true; this.role(room, peer, msg.role);
				this.send(peer, { type: "approved", id: peer.id, role: peer.role, lease: peer.lease, iceServers: this.ice(room, peer.id), expires: room.expires });
				this.send(client, { type: "approved", id: peer.id, role: peer.role, lease: peer.lease }); return;
			}
			if (!peer.approved) throw new Error("Host approval required.");
			if (msg.type === "role") { this.role(room, peer, msg.role); return; }
			if (msg.type === "offer") {
				const sdp = description(msg.sdp, "offer"); if (!sdp) throw new Error("Invalid offer.");
				this.send(peer, { type: "offer", sdp }); return;
			}
			if (msg.type === "ice") { this.send(peer, { type: "ice", candidate: candidate(msg.candidate) }); return; }
		} else if (client.approved) {
			if (msg.type === "answer") {
				const sdp = description(msg.sdp, "answer"); if (!sdp) throw new Error("Invalid answer.");
				this.send(room.host, { type: "answer", id: client.id, sdp }); return;
			}
			if (msg.type === "ice") { this.send(room.host, { type: "ice", id: client.id, candidate: candidate(msg.candidate) }); return; }
		}
		throw new Error("Message not allowed.");
	}
}

function candidate(value) {
	if (!value || typeof value.candidate !== "string" || value.candidate.length > 2048) throw new Error("Invalid ICE candidate.");
	if (value.sdpMid != null && (typeof value.sdpMid !== "string" || value.sdpMid.length > 32)) throw new Error("Invalid ICE mid.");
	if (value.sdpMLineIndex != null && (!Number.isInteger(value.sdpMLineIndex) || value.sdpMLineIndex < 0 || value.sdpMLineIndex > 16)) throw new Error("Invalid ICE index.");
	return { candidate: value.candidate, sdpMid: value.sdpMid ?? null, sdpMLineIndex: value.sdpMLineIndex ?? null };
}
