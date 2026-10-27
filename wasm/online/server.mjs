import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Rooms } from "./rooms.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export function createOnlineServer({ origin, hostKey, turnSecret, turnUrls = [], trustProxy = false, allowLocal = false, now = Date.now }) {
	const publicUrl = new URL(origin);
	if (publicUrl.origin !== origin || (publicUrl.protocol !== "https:" && !(allowLocal && publicUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(publicUrl.hostname)))) throw new Error("PUBLIC_ORIGIN must be an HTTPS origin (no path).");
	if (!Array.isArray(turnUrls) || turnUrls.length > 4 || turnUrls.some((s) => typeof s !== "string" || !/^turns?:[a-z0-9.-]+:\d+(?:\?transport=(?:udp|tcp))?$/i.test(s))) throw new Error("Invalid TURN URL configuration.");
	const hub = new Rooms({ hostKey, turnSecret, turnUrls, now });
	const peers = new Set(), attempts = new Map();
	const assets = new Map([
		["/", ["public/index.html", "text/html"]], ["/guest.js", ["public/guest.js", "text/javascript"]],
		["/style.css", ["public/style.css", "text/css"]], ["/protocol.js", ["../www/online-protocol.js", "text/javascript"]],
		["/pc-controls.js", ["../www/pc-controls.js", "text/javascript"]]
	].map(([route, [file, type]]) => [route, { data: fs.readFileSync(path.join(here, file)), type }]));
	const server = http.createServer((req, res) => {
		const headers = {
			"Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
			"Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
			"Permissions-Policy": "camera=(), microphone=(), geolocation=(), gamepad=(self)", "Cache-Control": "no-store"
		};
		if (req.headers.host !== publicUrl.host) { res.writeHead(421, headers).end(); return; }
		if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, headers).end(); return; }
		const route = (req.url || "").split("?")[0];
		if (route === "/health") { res.writeHead(200, { ...headers, "Content-Type": "text/plain" }).end("ok"); return; }
		const asset = assets.get(route);
		if (!asset) { res.writeHead(404, headers).end("Not found"); return; }
		res.writeHead(200, { ...headers, "Content-Type": asset.type + "; charset=utf-8" }).end(req.method === "HEAD" ? undefined : asset.data);
	});
	server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxHeadersCount = 40;
	const sockets = new WebSocketServer({ noServer: true, maxPayload: 32768, maxFragments: 32, maxBufferedChunks: 64, perMessageDeflate: false, closeTimeout: 1000 });
	server.on("upgrade", (req, socket, head) => {
		const reject = () => { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); };
		const from = req.headers.origin || "";
		let local = false;
		try { const u = new URL(from); local = u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname) && u.origin === from; } catch {}
		if (req.url !== "/online" || req.headers.host !== publicUrl.host || (from !== origin && !local) || peers.size >= 128) { reject(); return; }
		// Only enable behind the bundled, unexposed Caddy->broker network.
		const ip = trustProxy ? String(req.headers["x-real-ip"] || "").slice(0, 64) : req.socket.remoteAddress;
		let rate = attempts.get(ip);
		if (!rate || now() - rate.at > 60000) {
			if (attempts.size >= 4096 && !rate) { reject(); return; }
			rate = { at: now(), count: 0 }; attempts.set(ip, rate);
		}
		if (++rate.count > 30) { reject(); return; }
		sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws));
	});
	sockets.on("connection", (ws) => {
		const client = {
			send(data) {
				if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 65536) { ws.terminate(); return; }
				ws.send(JSON.stringify(data));
			},
			close() { ws.close(1000, "Session ended"); }
		};
		hub.connect(client); peers.add(ws); ws.alive = true;
		let at = now(), messages = 0;
		ws.on("pong", () => { ws.alive = true; });
		ws.on("message", (raw, binary) => {
			if (now() - at >= 1000) { at = now(); messages = 0; }
			if (binary || ++messages > 80) { ws.terminate(); return; }
			try { hub.message(client, JSON.parse(raw.toString())); }
			catch { client.send({ type: "error", message: "Request rejected. Check the host key or invite and try again." }); ws.close(1008, "Request rejected"); }
		});
		ws.on("close", () => { peers.delete(ws); hub.disconnect(client); });
		ws.on("error", () => { peers.delete(ws); hub.disconnect(client); });
	});
	const expiry = setInterval(() => {
		hub.expire();
		for (const [key, value] of attempts) if (now() - value.at > 60000) attempts.delete(key);
	}, 1000); expiry.unref();
	const heartbeat = setInterval(() => {
		for (const ws of peers) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
	}, 20000); heartbeat.unref();
	return { server, hub, async close() {
		clearInterval(expiry); clearInterval(heartbeat);
		for (const ws of peers) ws.terminate();
		await new Promise((resolve) => sockets.close(resolve));
		await new Promise((resolve) => server.close(resolve));
	} };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const read = (name) => process.env[name + "_FILE"] ? fs.readFileSync(process.env[name + "_FILE"], "utf8").trim() : process.env[name];
	const broker = createOnlineServer({ origin: process.env.PUBLIC_ORIGIN, hostKey: read("HOST_KEY"), turnSecret: read("TURN_SECRET"),
		turnUrls: (process.env.TURN_URLS || "").split(",").filter(Boolean), trustProxy: process.env.TRUST_PROXY === "1", allowLocal: process.env.ALLOW_LOCAL_TEST === "1" });
	broker.server.listen(Number(process.env.PORT || 3000), process.env.BIND || "127.0.0.1", () => console.log("Online invitation service ready."));
	const stop = () => broker.close().finally(() => process.exit(0));
	process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
