import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The server announces its actual address only after listen() succeeds. This
// also handles its ephemeral-port fallback when 8090 is already occupied.
export function waitForLocalServer(child) {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const clean = () => { child.stdout.off("data", data); child.off("exit", exit); child.off("error", error); };
		const error = (err) => { clean(); reject(err); };
		const exit = (code) => error(new Error(`Chiaki stopped before it was ready (exit ${code ?? "signal"}). See the build/startup error above.`));
		const data = (chunk) => {
			buffer += chunk.toString();
			let end;
			while ((end = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
				const match = /^chiaki-ng WASM \(local\): http:\/\/127\.0\.0\.1:([0-9]{1,5})\/$/.exec(line);
				if (match && Number(match[1]) > 0 && Number(match[1]) <= 65535) { clean(); resolve(`http://127.0.0.1:${Number(match[1])}/`); return; }
			}
			buffer = buffer.slice(-2048);
		};
		child.stdout.on("data", data); child.once("exit", exit); child.once("error", error);
	});
}

function openBrowser(url, chrome = true) {
	const child = spawn("open", chrome ? ["-a", "Google Chrome", url] : [url], { stdio: "ignore" });
	child.once("error", () => { if (chrome) openBrowser(url, false); else console.error(`Open ${url} in your browser.`); });
	child.once("exit", (code) => { if (code && chrome) openBrowser(url, false); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = fileURLToPath(new URL("../", import.meta.url));
	const child = spawn("/bin/sh", ["./scripts/run-web.sh"], { cwd: root, env: { ...process.env, CHIAKI_WASM_PORT: "8090", CHIAKI_WASM_BIND: "127.0.0.1" }, stdio: ["inherit", "pipe", "inherit"] });
	child.stdout.pipe(process.stdout);
	const stop = (signal) => child.kill(signal);
	process.once("SIGINT", () => stop("SIGINT")); process.once("SIGTERM", () => stop("SIGTERM")); process.once("SIGHUP", () => stop("SIGHUP"));
	child.once("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
	waitForLocalServer(child).then(openBrowser, (err) => { console.error(err.message); process.exitCode = 1; });
}
