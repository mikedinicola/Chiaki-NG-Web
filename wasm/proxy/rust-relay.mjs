import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_PACKET = 256 * 1024;
const MAX_PENDING = 4 * 1024 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));

export function wsFrame(payload, opcode = 2) {
	let header;
	if (payload.length < 126) {
		header = Buffer.from([0x80 | opcode, payload.length]);
	} else if (payload.length <= 65535) {
		header = Buffer.alloc(4);
		header[0] = 0x80 | opcode;
		header[1] = 126;
		header.writeUInt16BE(payload.length, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x80 | opcode;
		header[1] = 127;
		header.writeBigUInt64BE(BigInt(payload.length), 2);
	}
	return Buffer.concat([header, payload]);
}

// Browser -> server frames must be masked; fragmented binary messages are legal.
export class BrowserFrames {
	buffer = Buffer.alloc(0);
	fragments = [];
	fragmentSize = 0;
	fragmented = false;
	push(chunk, onFrame) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const b = this.buffer;
			if (b.length < 2) return;
			const fin = !!(b[0] & 128);
			const opcode = b[0] & 15;
			if ((b[0] & 112) || !(b[1] & 128) || ![0, 2, 8, 9, 10].includes(opcode))
				throw new Error("Invalid browser WebSocket frame");
			let length = b[1] & 127;
			let offset = 2;
			if (length === 126) {
				if (b.length < 4) return;
				length = b.readUInt16BE(2);
				if (length < 126) throw new Error("Non-canonical frame length");
				offset = 4;
			} else if (length === 127) {
				if (b.length < 10) return;
				const large = b.readBigUInt64BE(2);
				if (large > BigInt(MAX_PACKET) || large < 65536n) throw new Error("Invalid frame length");
				length = Number(large);
				offset = 10;
			}
			if (length > MAX_PACKET || (opcode >= 8 && (!fin || length > 125)))
				throw new Error("WebSocket frame exceeds relay limit");
			if (b.length < offset + 4 + length) return;
			const mask = b.subarray(offset, offset + 4);
			offset += 4;
			const payload = Buffer.from(b.subarray(offset, offset + length));
			for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
			this.buffer = b.subarray(offset + length);
			if (opcode >= 8) {
				if (opcode === 8 && length === 1) throw new Error("Invalid close frame");
				if (onFrame(opcode, payload) === false) return;
				continue;
			}
			if ((opcode === 0) !== this.fragmented) throw new Error("Invalid continuation frame");
			this.fragmentSize += length;
			if (this.fragmentSize > MAX_PACKET) throw new Error("Fragmented message exceeds relay limit");
			this.fragments.push(payload);
			if (this.fragments.length > 1024) throw new Error("Too many WebSocket fragments");
			this.fragmented = !fin;
			if (fin) {
				const message = Buffer.concat(this.fragments, this.fragmentSize);
				this.fragments = [];
				this.fragmentSize = 0;
				if (onFrame(2, message) === false) return;
			}
		}
	}
}

export function validatePacket(packet) {
	if (packet.length < 28 || packet.length > MAX_PACKET || packet.readUInt32LE(24) !== packet.length - 28)
		throw new Error("Invalid POSIX relay packet");
}

export async function startRustRelay({ binary, allowWan = true } = {}) {
	binary ||= process.env.CHIAKI_RELAY_BIN || path.resolve(here, "../relay-rust/target/release/chiaki-relay" + (process.platform === "win32" ? ".exe" : ""));
	if (!fs.existsSync(binary)) throw new Error(`Rust relay missing: ${binary}. Build it with cargo build --release --manifest-path wasm/relay-rust/Cargo.toml`);
	const token = crypto.randomBytes(32).toString("hex");
	const child = spawn(binary, [], {
		windowsHide: true,
		stdio: ["pipe", "pipe", "inherit"],
		env: { ...process.env, CHIAKI_RELAY_TOKEN: token, CHIAKI_RELAY_ALLOW_WAN: String(allowWan) }
	});
	const sessions = new Set();
	let stopped = false;
	const port = await new Promise((resolve, reject) => {
		let output = "";
		const timer = setTimeout(() => fail(new Error("Rust relay startup timed out")), 10000);
		const cleanup = () => {
			clearTimeout(timer);
			child.off("error", fail);
			child.off("exit", exited);
			child.stdout.off("data", data);
		};
		const fail = (error) => { cleanup(); child.kill(); reject(error); };
		const exited = (code) => fail(new Error(`Rust relay exited during startup (${code})`));
		const data = (chunk) => {
			output += chunk;
			if (output.length > 1024) return fail(new Error("Invalid Rust relay startup response"));
			const match = output.match(/^CHIAKI_RELAY_READY (\d+)\r?\n/);
			if (match) {
				const port = Number(match[1]);
				if (port < 1 || port > 65535) return fail(new Error("Invalid Rust relay port"));
				cleanup(); resolve(port);
			}
		};
		child.once("error", fail);
		child.once("exit", exited);
		child.stdout.on("data", data);
	});
	const stop = () => {
		stopped = true;
		for (const socket of sessions) socket.destroy();
		child.kill();
	};
	const onExit = () => stop();
	process.once("exit", onExit);
	child.on("exit", () => {
		if (!stopped) console.error("Rust relay stopped; active relay connections were closed. Restart the server.");
		stopped = true;
		for (const socket of sessions) socket.destroy();
		process.off("exit", onExit);
	});
	return {
		port,
		close() { process.off("exit", onExit); stop(); },
		attach(browser, head = Buffer.alloc(0)) {
			if (stopped) { browser.destroy(); return; }
			browser.pause();
			browser.setNoDelay(true);
			const backend = net.connect({ host: "127.0.0.1", port });
			backend.setNoDelay(true);
			sessions.add(browser);
			let ready = false;
			let incoming = Buffer.alloc(0);
			let ended = false;
			const timer = setTimeout(() => close(), 4000);
			const close = () => {
				if (ended) return;
				ended = true;
				clearTimeout(timer);
				sessions.delete(browser);
				browser.destroy();
				backend.destroy();
			};
			const frames = new BrowserFrames();
			const writeBrowser = (packet) => {
				if (browser.writableLength > MAX_PENDING) { close(); return; }
				if (!browser.write(packet)) backend.pause();
			};
			const onBrowser = (chunk) => {
				try {
					frames.push(chunk, (opcode, payload) => {
						if (opcode === 8) { close(); return false; }
						if (opcode === 9) { writeBrowser(wsFrame(payload, 10)); return; }
						if (opcode !== 2) return;
						validatePacket(payload);
						if (backend.writableLength > MAX_PENDING) { close(); return false; }
						const length = Buffer.alloc(4);
						length.writeUInt32LE(payload.length);
						if (!backend.write(Buffer.concat([length, payload]))) browser.pause();
					});
				} catch { close(); }
			};
			backend.once("connect", () => backend.write(token));
			backend.on("data", (chunk) => {
				try {
					incoming = Buffer.concat([incoming, chunk]);
					if (!ready) {
						if (incoming.length < 2) return;
						if (incoming.subarray(0, 2).toString() !== "OK") return close();
						incoming = incoming.subarray(2);
						ready = true;
						clearTimeout(timer);
						if (head.length) onBrowser(head);
						if (!ended && !backend.writableNeedDrain) browser.resume();
					}
					while (incoming.length >= 4 && !ended) {
						const size = incoming.readUInt32LE(0);
						if (size < 28 || size > MAX_PACKET) return close();
						if (incoming.length < size + 4) return;
						const packet = incoming.subarray(4, size + 4);
						validatePacket(packet);
						writeBrowser(wsFrame(packet));
						incoming = incoming.subarray(size + 4);
					}
				} catch { close(); }
			});
			browser.on("data", onBrowser);
			browser.on("drain", () => { if (ready && !ended) backend.resume(); });
			backend.on("drain", () => { if (ready && !ended) browser.resume(); });
			for (const socket of [browser, backend]) {
				socket.once("error", close);
				socket.once("close", close);
				socket.once("end", close);
			}
		}
	};
}
