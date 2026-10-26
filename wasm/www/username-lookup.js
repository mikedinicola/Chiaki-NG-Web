globalThis.ChiakiLookup = Object.freeze({
	create({ lookup, pending, success, failure, delay = 1000, interval = 3100, now = Date.now, schedule = setTimeout, unschedule = clearTimeout }) {
		let timer, request, serial = 0, lastStart = -Infinity;
		const cache = new Map();
		const cancel = () => { serial++; unschedule(timer); request?.abort(); request = null; };
		const input = (raw, immediate = false) => {
			cancel();
			const username = String(raw || "").trim();
			if (!/^[a-z][a-z0-9_-]{2,15}$/i.test(username)) return false;
			const id = serial;
			const key = username.toLowerCase();
			const cached = cache.get(key);
			if (cached && now() - cached.at < 300000) { success(cached.value, username); return true; }
			timer = schedule(async () => {
				lastStart = now();
				request = new AbortController();
				pending(username);
				try {
					const value = await lookup(username, request.signal);
					if (id !== serial) return;
					cache.set(key, { value, at: now() });
					success(value, username);
				} catch (error) { if (id === serial) failure(error, username); }
			}, Math.max(immediate ? 0 : delay, interval - (now() - lastStart)));
			return true;
		};
		return { input, cancel };
	}
});
