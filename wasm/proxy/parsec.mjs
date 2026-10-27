import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export function createParsecLauncher({ platform = process.platform, env = process.env, stat = fs.stat, spawnImpl = spawn } = {}) {
	async function executable() {
		if (platform !== "win32") return null;
		// Fixed vendor locations only. No request-supplied command, path or arguments.
		const roots = [...new Set([env.ProgramW6432, env.ProgramFiles, env["ProgramFiles(x86)"]].filter((p) => p && path.win32.isAbsolute(p)))];
		for (const root of roots) {
			const file = path.win32.join(root, "Parsec", "parsecd.exe");
			try { if ((await stat(file)).isFile()) return file; } catch {}
		}
		return null;
	}
	return {
		async status() { return { supported: platform === "win32", installed: !!await executable() }; },
		async open() {
			const file = await executable();
			if (!file) throw new Error(platform === "win32" ? "Parsec was not found in its standard install folder. Install it from the official download page, or open your portable copy yourself." : "Open Parsec from your system's app launcher. Windows hosting is recommended for guest controllers.");
			await new Promise((resolve, reject) => {
				const child = spawnImpl(file, [], { detached: true, stdio: "ignore", windowsHide: false, shell: false });
				child.once("error", () => reject(new Error("Windows could not open Parsec. Try opening it from Start.")));
				child.once("spawn", () => { child.unref(); resolve(); });
			});
			return { opened: true };
		}
	};
}
