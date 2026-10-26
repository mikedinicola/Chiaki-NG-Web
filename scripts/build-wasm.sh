#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${1:-build-wasm}"
cd "$ROOT"

if ! command -v emcmake >/dev/null; then
	echo "emcmake introuvable. Installez Emscripten (emsdk)." >&2
	exit 1
fi

PROTOC_DIR="$ROOT/tools/protoc/bin"
PROTOC_BIN="$PROTOC_DIR/protoc"
VER="36.2"
NEED=1
if [ -x "$PROTOC_BIN" ] && "$PROTOC_BIN" --version 2>/dev/null | grep -q '^libprotoc 36\.2$'; then
	NEED=0
fi
if [ "$NEED" -eq 1 ]; then
	if [ "$(uname -m)" = "aarch64" ]; then ARCH="aarch_64"; else ARCH="x86_64"; fi
	URL="https://github.com/protocolbuffers/protobuf/releases/download/v${VER}/protoc-${VER}-linux-${ARCH}.zip"
	DEST="$ROOT/tools/protoc"
	ZIP="$(mktemp).zip"
	echo "Telechargement de protoc ${VER} vers tools/protoc (ignore le protoc systeme) ..."
	mkdir -p "$DEST"
	curl -L "$URL" -o "$ZIP"
	unzip -o "$ZIP" -d "$DEST"
	rm -f "$ZIP"
	chmod +x "$DEST/bin/protoc"
fi
export PATH="$PROTOC_DIR:$PATH"
if [ ! -x "$PROTOC_BIN" ]; then
	echo "protoc 36.2 introuvable dans tools/protoc/bin." >&2
	exit 1
fi

GF_CPU="$ROOT/third-party/gf-complete/src/gf_cpu.c"
if [ -f "$GF_CPU" ] && grep -q "^int gf_cpu_identify(void)" "$GF_CPU"; then
	echo "Correction de gf_cpu_identify (prototype void vs definition int) ..."
	python3 - "$GF_CPU" <<'EOF'
import io, re, sys
p = sys.argv[1]
s = io.open(p, "rb").read().decode("utf-8")
pat = r"int gf_cpu_identify\(void\)(\r?\n\{\r?\n    gf_cpu_identified = 1;)\r?\n    return 0;(\r?\n\})"
s = re.sub(pat, r"void gf_cpu_identify(void)\1\2", s)
io.open(p, "wb").write(s.encode("utf-8"))
EOF
fi

VENV="$ROOT/tools/wasm-python"
if [ -x "$VENV/bin/python" ]; then
	WASM_PYTHON="$VENV/bin/python"
else
	echo "Creation de tools/wasm-python (protobuf 7.36.2) ..."
	python3 -m venv "$VENV"
	WASM_PYTHON="$VENV/bin/python"
fi
if ! "$WASM_PYTHON" -c "import google.protobuf; assert google.protobuf.__version__ == '7.36.2'" 2>/dev/null; then
	echo "Installation de protobuf 7.36.2 dans tools/wasm-python ..."
	"$WASM_PYTHON" -m pip install --quiet --disable-pip-version-check "protobuf==7.36.2"
fi

NANOPB_PROTO="$ROOT/third-party/nanopb/generator/proto"
"$PROTOC_BIN" "--proto_path=$NANOPB_PROTO" "--proto_path=$ROOT/tools/protoc/include" "--python_out=$NANOPB_PROTO" "$NANOPB_PROTO/nanopb.proto"

emcmake cmake -S "$ROOT" -B "$ROOT/$BUILD_DIR" -G Ninja -DCHIAKI_ENABLE_WASM=ON -DPYTHON_EXECUTABLE="$WASM_PYTHON" -DPython_EXECUTABLE="$WASM_PYTHON" -DPython3_EXECUTABLE="$WASM_PYTHON" -DPROTOC="$PROTOC_BIN"
cmake --build "$ROOT/$BUILD_DIR" --target chiaki-wasm
echo "OK. Lancer: node $ROOT/$BUILD_DIR/wasm/server.mjs"
echo "Puis ouvrir http://127.0.0.1:8080/"
