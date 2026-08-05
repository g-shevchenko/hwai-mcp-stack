#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/code-diet-mcp"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$SERVICE_DIR"
npm run build >/dev/null

# Build a fixture with one AI-slop file + one clean file
mkdir -p "$TMP_DIR/src"
cat > "$TMP_DIR/src/barrel.ts" <<'TS'
export { foo } from "./foo.js";
export { bar } from "./bar.js";
TS
cat > "$TMP_DIR/src/clean.ts" <<'TS'
export function add(a: number, b: number): number { return a + b; }
TS

export CODE_DIET_CACHE_DIR="$TMP_DIR/.cache"
OUT=$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"detect_ai_slop","arguments":{"repo_root":"'"$TMP_DIR"'"}}}' \
  | node "$SERVICE_DIR/dist/index.js" 2>/dev/null | tail -1)

echo "$OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
text=d['result']['content'][0]['text']
res=json.loads(text)
assert res['scanned_files']>=2, f'expected >=2 files, got {res}'
ids=[f['id'] for f in res['findings']]
assert 'CD04' in ids, f'expected CD04 barrel finding, got {ids}'
print('smoke OK:', res['scanned_files'], 'files,', res['findings_count'], 'findings, ids=', ids)
"
