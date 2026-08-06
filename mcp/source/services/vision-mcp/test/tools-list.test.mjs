// Smoke test: the built stdio server responds to tools/list with the expected
// tool set, and the removed knowledge-rag module (TODO(unwired-feature),
// never imported by index.ts across all of git history — see task 6 evidence
// packet) is gone from the build output rather than silently dead-shipped.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.join(__dirname, "..", "dist", "index.js");

function callToolsList() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distIndex], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out waiting for tools/list response"));
    }, 10_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const line = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      if (line) {
        clearTimeout(timeout);
        child.kill();
        try {
          resolve(JSON.parse(line));
        } catch (error) {
          reject(error);
        }
      }
    });

    child.on("error", reject);

    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    );
  });
}

test("dist build does not ship the unwired knowledge-rag module", () => {
  assert.equal(
    existsSync(path.join(__dirname, "..", "dist", "knowledge-rag.js")),
    false,
    "knowledge-rag.js should have been removed from dist, not left as dead-shipped output",
  );
});

test("src no longer contains knowledge-rag.ts", () => {
  assert.equal(
    existsSync(path.join(__dirname, "..", "src", "knowledge-rag.ts")),
    false,
  );
});

test("stdio server tools/list responds with expected tools", async () => {
  const response = await callToolsList();
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, 1);
  assert.ok(Array.isArray(response.result?.tools), "expected a tools array");

  const names = response.result.tools.map((tool) => tool.name);
  for (const expected of [
    "analyze_screenshot",
    "analyze_screenshot_diff",
    "batch_analyze_screenshots",
    "fetch_image",
    "image_url_to_text",
    "get_runtime_diagnostics",
  ]) {
    assert.ok(names.includes(expected), `expected tools/list to include ${expected}`);
  }
});
