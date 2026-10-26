/* Shared by the browser bootstrap and streaming preflight. */
globalThis.ChiakiRuntime = Object.freeze({
	issue(env, streaming = false) {
		if (!env.isSecureContext) return "log.insecureOrigin";
		if (!env.crossOriginIsolated || typeof env.SharedArrayBuffer !== "function")
			return "log.isolationMissing";
		if (typeof env.WebAssembly !== "object") return "log.wasmMissing";
		if (streaming && typeof env.VideoDecoder !== "function") return "log.webcodecsMissing";
		return null;
	}
});
