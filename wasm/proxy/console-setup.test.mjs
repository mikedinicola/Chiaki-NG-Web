import assert from "node:assert/strict";
import { test } from "node:test";
import "../www/console-setup.js";

test("console identifiers stay masked unless explicitly revealed", () => {
	const id = "001122AABBCC";
	assert.equal(ChiakiSetup.displayConsoleId(id), "••••••••••••");
	assert.equal(ChiakiSetup.displayConsoleId(id, true), id);
	assert.equal(ChiakiSetup.displayConsoleId(""), "—");
});

test("setup accepts console IPv4 addresses and rejects malformed or special destinations", () => {
	for (const ip of ["192.168.1.70", "10.0.0.2", "172.16.1.1", "203.0.113.5"])
		assert.equal(ChiakiSetup.validAddress(ip), true, ip);
	for (const ip of ["", "256.1.1.1", "192.168.1", "192.168.1.2:9295", "127.0.0.1", "0.0.0.0", "169.254.1.2", "255.255.255.255", "::1", "console.local"])
		assert.equal(ChiakiSetup.validAddress(ip), false, ip);
});

test("pairing codes preserve leading zeroes and must contain exactly eight digits", () => {
	assert.equal(ChiakiSetup.validPin("01234567"), true);
	assert.equal(ChiakiSetup.validPin("0123 4567"), true);
	for (const pin of ["", "1234567", "123456789", "1e7", "abcdefgh", "1234-5678"])
		assert.equal(ChiakiSetup.validPin(pin), false, pin);
});

test("key import requires both usable keys", () => {
	assert.equal(ChiakiSetup.validKeys("a".repeat(32), "B".repeat(32)), true);
	assert.equal(ChiakiSetup.validKeys("old-ascii-key", "a".repeat(32)), true);
	assert.equal(ChiakiSetup.validKeys("a".repeat(32), ""), false);
	assert.equal(ChiakiSetup.validKeys("", "a".repeat(32)), false);
	assert.equal(ChiakiSetup.validKeys("a".repeat(32), "not-a-key"), false);
});
