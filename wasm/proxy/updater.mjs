import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const repository = "https://github.com/SKIZZOO/Chiaki-NG-Web";
const api = "https://api.github.com/repos/SKIZZOO/Chiaki-NG-Web/releases?per_page=100";
const limit = 150 * 1024 * 1024;
export function compareVersions(a, b) {
	const parts = (v) => /^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : [0, 0, 0];
	const x = parts(a), y = parts(b);
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
	return 0;
}
export function selectRelease(releases, current) {
	if (!Array.isArray(releases)) throw new Error("GitHub returned invalid release metadata.");
	return releases.flatMap((release) => {
		const version = /^browser-v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1];
		if (!version || release.draft || !release.published_at || compareVersions(version, current) <= 0) return [];
		const name = `Chiaki-NG-Web-Setup-${version}-x64.exe`;
		const url = `${repository}/releases/download/browser-v${version}/${name}`;
		const asset = release.assets?.find((a) => a.name === name && a.state === "uploaded" && a.browser_download_url === url);
		if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > limit) return [];
		return [{ version, name, url, sha256: asset.digest.slice(7), size: asset.size,
			page: `${repository}/releases/tag/browser-v${version}`, preview: !!release.prerelease }];
	}).sort((a, b) => compareVersions(b.version, a.version))[0] || null;
}

export function localUpdateRequest(req) {
	const port = req.socket?.localPort;
	const peer = req.socket?.remoteAddress;
	if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) return false;
	const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
	if (!origins.includes(`http://${req.headers.host}`)) return false;
	if (req.headers.origin && !origins.includes(req.headers.origin)) return false;
	if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") return false;
	return req.method === "GET" || (origins.includes(req.headers.origin) && req.headers["x-chiaki-update"] === "1");
}

export function createUpdater({ current = "development", dataDir, installable = false, install = () => {}, fetchImpl = fetch, now = Date.now }) {
	let latest = null, active = null, checkedAt = 0, autoCheck = true, status = "idle", error = "", timer;
	const preferences = path.join(dataDir, "update-settings.json");
	const ready = fs.readFile(preferences, "utf8").then((raw) => { autoCheck = JSON.parse(raw).autoCheck !== false; }).catch(() => {});
	const snapshot = () => ({ current, latest, autoCheck, installable, status, error, checkedAt, channel: "Browser releases (including community previews)" });
	async function check(force = false) {
		await ready;
		if (active) return active;
		if (!force && checkedAt && now() - checkedAt < 60000) return snapshot();
		active = (async () => {
			status = "checking"; error = "";
			try {
				const response = await fetchImpl(api, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Chiaki-NG-Web-Updater" }, signal: AbortSignal.timeout(15000) });
				if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? "GitHub rate limit reached. Try again later." : "Could not check GitHub releases.");
				const raw = await response.text();
				if (raw.length > 4 * 1024 * 1024) throw new Error("GitHub release response is too large.");
				latest = selectRelease(JSON.parse(raw), current); checkedAt = now();
				status = latest ? "available" : "current";
			} catch (e) { error = e.message; status = "error"; }
			return snapshot();
		})().finally(() => { active = null; });
		return active;
	}
	async function installLatest(version) {
		await ready;
		if (!installable) throw new Error("Automatic installation requires the installed Windows edition. Use the GitHub download for portable/source builds.");
		if (active || status === "installing") throw new Error("An update operation is already running.");
		await check(true);
		if (status === "error" || !latest || latest.version !== version) {
			error = "Release changed or could not be verified. Check again before installing."; status = "error"; throw new Error(error);
		}
		const selected = { ...latest };
		active = (async () => {
			let destination;
			try {
				status = "downloading"; error = "";
				const response = await fetchImpl(selected.url, { signal: AbortSignal.timeout(180000) });
				if (!response.ok || !response.body) throw new Error("Update download failed.");
				const folder = path.join(dataDir, "updates"); await fs.mkdir(folder, { recursive: true, mode: 0o700 });
				destination = path.join(folder, `update-${selected.version}-${crypto.randomBytes(12).toString("hex")}.exe`);
				const file = await fs.open(destination, "wx", 0o600);
				const hash = crypto.createHash("sha256"); let bytes = 0;
				try {
					for await (const chunk of response.body) {
						bytes += chunk.length;
						if (bytes > selected.size || bytes > limit) throw new Error("Update exceeds its published size.");
						hash.update(chunk); await file.writeFile(chunk);
					}
				} finally { await file.close(); }
				if (bytes !== selected.size || hash.digest("hex") !== selected.sha256) throw new Error("Checksum verification failed. The update will not run.");
				status = "installing";
				await install(destination, selected.sha256);
			} catch (e) {
				if (destination) await fs.unlink(destination).catch(() => {});
				error = e.message; status = "error"; throw e;
			}
		})().finally(() => { active = null; });
		return active;
	}
	return {
		async snapshot() { await ready; return snapshot(); }, check, installLatest,
		async setAuto(enabled) {
			await ready; autoCheck = !!enabled; await fs.mkdir(dataDir, { recursive: true });
			await fs.writeFile(preferences, JSON.stringify({ autoCheck }), { mode: 0o600 }); return snapshot();
		},
		start() {
			// Network activity stays in the Node process, away from browser decoding.
			const tick = async () => { await ready; if (autoCheck) await check(); };
			const initial = setTimeout(tick, 30000); initial.unref();
			timer = setInterval(tick, 6 * 60 * 60 * 1000); timer.unref();
			return () => { clearTimeout(initial); clearInterval(timer); };
		}
	};
}
