#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getCodeDietConfig } from "./config.js";
import { analyzeSource, DetectorOptions } from "./detectors.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const config = getCodeDietConfig();

const METADATA_SCHEMA = {
  type: "object",
  description:
    "Optional attribution metadata: source, task_id, surface, traffic_class, repo, branch. No raw prompts, code, secrets, file bodies.",
  properties: {
    source: { type: "string" },
    task_id: { type: "string" },
    surface: { type: "string" },
    traffic_class: { type: "string" },
    repo: { type: "string" },
    branch: { type: "string" },
  },
};

const COMMON_PROPS = {
  repo_root: { type: "string", description: "Local repo root. Not logged raw." },
  max_files: { type: "number" },
  max_findings: { type: "number" },
  metadata: METADATA_SCHEMA,
};

const TOOLS: Tool[] = [
  {
    name: "detect_ai_slop",
    description:
      "Deterministic AI-slop detection (CD01-CD06): abstraction bloat, guard spam, unused exports, re-export plumbing. Advisory; agents read exact files before edits.",
    inputSchema: {
      type: "object",
      properties: {
        ...COMMON_PROPS,
        paths: { type: "array", items: { type: "string" }, description: "Optional file/dir list to scope the scan. Defaults to src/." },
        thresholds: { type: "object", description: "Optional detector threshold overrides (generic defaults are public-safe)." },
      },
    },
  },
  {
    name: "delete_first_report",
    description:
      "What in the diff/repo slice can be deleted without losing behavior: unreferenced new exports, dead branches, redundant guards, unused files. Tied to test presence; never proposes removing tests.",
    inputSchema: {
      type: "object",
      properties: {
        ...COMMON_PROPS,
        diff_text: { type: "string", description: "Unified diff text. If omitted, scans repo slice." },
      },
    },
  },
  {
    name: "review_diff",
    description:
      "Risk-scored review of a diff: changed symbols, blast-radius size, static-check deltas, AI-slop hits. LLM reranks findings; detection is deterministic.",
    inputSchema: {
      type: "object",
      properties: {
        ...COMMON_PROPS,
        diff_text: { type: "string", description: "Unified diff text (required)." },
      },
      required: ["diff_text"],
    },
  },
  {
    name: "simplification_plan",
    description:
      "Ordered simplification candidates with effort/risk/behavior-preservation note. No file changes.",
    inputSchema: {
      type: "object",
      properties: COMMON_PROPS,
    },
  },
  {
    name: "get_artifact",
    description: "Raw evidence for a compact finding.",
    inputSchema: { type: "object", properties: { artifact_file: { type: "string" }, max_chars: { type: "number" } }, required: ["artifact_file"] },
  },
  {
    name: "get_measurement_report",
    description: "Daily savings/quality rollup (Pantheon-safe aggregate).",
    inputSchema: { type: "object", properties: { date: { type: "string" } } },
  },
];

function asDetectorOptions(args: Record<string, unknown>): DetectorOptions {
  const thresholds = typeof args.thresholds === "object" && args.thresholds && !Array.isArray(args.thresholds) ? args.thresholds : undefined;
  return {
    thresholds: thresholds as DetectorOptions["thresholds"],
  };
}

function collectSourceFiles(root: string, maxFiles: number, maxBytes: number): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!entry.startsWith(".") && entry !== "node_modules" && entry !== "dist" && entry !== "build") stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(entry)) continue;
      if (st.size > maxBytes) continue;
      try {
        out.push({ path: full, text: readFileSync(full, "utf8") });
      } catch {
        // skip unreadable
      }
    }
  }
  return out;
}

function runDetect(args: Record<string, unknown>) {
  const root = typeof args.repo_root === "string" ? args.repo_root : process.cwd();
  const maxFiles = typeof args.max_files === "number" ? args.max_files : config.maxFiles;
  const maxBytes = config.maxFileBytes;
  const scope = Array.isArray(args.paths) && args.paths.length ? args.paths.map((p) => join(root, String(p))) : [root];
  let files: { path: string; text: string }[] = [];
  for (const p of scope) {
    try {
      if (statSync(p).isDirectory()) files = files.concat(collectSourceFiles(p, maxFiles, maxBytes));
      else files.push({ path: p, text: readFileSync(p, "utf8") });
    } catch {
      // skip missing
    }
  }
  const allTexts = files.map((f) => f.text);
  const findings = [];
  for (const f of files) {
    const hits = analyzeSource(f.text, f.path, { ...asDetectorOptions(args), allSources: allTexts });
    for (const h of hits) findings.push({ ...h, file: relative(root, f.path) });
  }
  return { findings: findings.slice(0, config.maxFindings), scanned_files: files.length, findings_count: findings.length };
}

function runDeleteFirst(args: Record<string, unknown>) {
  const result = runDetect(args);
  const candidates = result.findings.filter((f) => ["CD03", "CD04", "CD06"].includes(f.id));
  return {
    delete_candidates: candidates,
    delete_candidates_count: candidates.length,
    scanned_files: result.scanned_files,
    behavior_preservation_note:
      "Candidates exclude test files. Verify each with language-graph blast-radius and run the test suite before removal.",
  };
}

function runReviewDiff(args: Record<string, unknown>) {
  const diffText = typeof args.diff_text === "string" ? args.diff_text : "";
  if (!diffText.trim()) throw new Error("diff_text is required");
  const added = diffText.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
  const findings = analyzeSource(added, "<diff>", asDetectorOptions(args));
  return {
    risk_score: Math.min(100, findings.length * 15),
    findings,
    findings_count: findings.length,
    note: "Deterministic detection only. LLM may rerank/narrate; never re-detect.",
  };
}

function runSimplificationPlan(args: Record<string, unknown>) {
  const result = runDetect(args);
  const items = result.findings.map((f, i) => ({
    order: i + 1,
    file: f.file,
    id: f.id,
    action: f.suggested_action,
    effort: f.id === "CD03" ? "low" : "medium",
    risk: f.id === "CD03" ? "low" : "medium",
    behavior_preservation: "Run tests before/after; do not weaken assertions.",
  }));
  return { plan_items: items, plan_items_count: items.length, scanned_files: result.scanned_files };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function stringifyResult(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

async function runTool(name: string, rawArgs: unknown) {
  const args = typeof rawArgs === "object" && rawArgs && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
  try {
    let result: unknown;
    switch (name) {
      case "detect_ai_slop":
        result = runDetect(args);
        break;
      case "delete_first_report":
        result = runDeleteFirst(args);
        break;
      case "review_diff":
        result = runReviewDiff(args);
        break;
      case "simplification_plan":
        result = runSimplificationPlan(args);
        break;
      case "get_artifact":
        result = { note: "artifact store not implemented in v0.1 scaffold" };
        break;
      case "get_measurement_report":
        result = { note: "measurement report not implemented in v0.1 scaffold" };
        break;
      default:
        return toolError(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text" as const, text: stringifyResult(result) }] };
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error));
  }
}

const server = new Server(
  { name: "hwai-code-diet-mcp", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Use code-diet tools for diff-scoped AI-slop detection and delete-first review. Advisory only; agents read exact files and run proof loops before edits.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => runTool(request.params.name, request.params.arguments));

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HWAI Code Diet MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Code Diet MCP fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
