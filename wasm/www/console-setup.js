globalThis.ChiakiSetup = Object.freeze({
	validAddress(value) {
		const s = String(value).trim();
		if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return false;
		const octets = s.split(".").map(Number);
		return octets.every((n) => n <= 255) && octets[0] > 0 && octets[0] !== 127
			&& octets[0] < 224 && !(octets[0] === 169 && octets[1] === 254);
	},
	validPin(value) { return /^\d{8}$/.test(String(value).replace(/\s/g, "")); },
	validKeys(regist, morning) {
		return (/^[\da-f]{32}$/i.test(regist) || /^[\x20-\x7e]{1,16}$/.test(regist))
			&& /^[\da-f]{32}$/i.test(morning);
	}
});
