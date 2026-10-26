// Minimum fixed versions from Node's 2026-10-21 security release.
export function isPatchedEmbeddedNode(version) {
    const [major, minor, patch] = String(version).split('.').map(Number);
    if (![major, minor, patch].every(Number.isInteger)) return false;
    const floor = {22: [23, 4], 24: [22, 1], 26: [12, 1]}[major];
    return !!floor && (minor > floor[0] || (minor === floor[0] && patch >= floor[1]));
}
