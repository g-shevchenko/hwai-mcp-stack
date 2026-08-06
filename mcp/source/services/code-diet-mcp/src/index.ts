#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getCodeDietConfig } from "./config.js";
import { analyzeSource, DetectorOptions, LanguageGraphOracle } from "./detectors.js";
import { FindingsStore, findingKey } from "./findings_store.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import path from "node:path";
import fs from "node:fs/promises";

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

async function buildLanguageGraphOracle(repoRoot: string): Promise<LanguageGraphOracle | null> {
  try {
    const lgDistRoot = path.resolve(repoRoot, "../../language-graph-mcp/dist");
    const configModule = await import(path.join(lgDistRoot, "config.js"));
    const graphModule = await import(path.join(lgDistRoot, "graph.js"));
    const textUtilsModule = await import(path.join(lgDistRoot, "text-utils.js"));
    const lgConfig = configModule.getLanguageGraphConfig();
    // Build (or load) the index for this repo root. auto_index=true creates it on first use.
    await graphModule.buildLanguageGraphIndex(lgConfig, { repo_root: repoRoot, auto_index: true });
    const indexFile = path.join(lgConfig.indexDir, `${textUtilsModule.stableHash(path.resolve(repoRoot))}.json`);
    let indexedTexts: string[] | undefined;
    try {
      const raw = await fs.readFile(indexFile, "utf8");
      const index = JSON.parse(raw);
      const seen = new Set<string>();
      indexedTexts = [];
      // index.files is an OBJECT keyed by path (not an array) — normalize both shapes.
      const collections = [
        index.files && !Array.isArray(index.files) ? Object.values(index.files) : index.files,
        index.symbols,
        index.references,
      ];
      for (const coll of collections) {
        for (const rec of coll || []) {
          const p = rec.path || rec.file;
          if (p && !seen.has(p)) {
            seen.add(p);
            const abs = path.isAbsolute(p) ? p : path.join(repoRoot, p);
            try { indexedTexts.push(readFileSync(abs, "utf8")); } catch { /* file moved */ }
          }
        }
      }
    } catch {
      indexedTexts = undefined; // cannot expose corpus; detector trusts graph verdicts directly
    }
    return {
      indexedTexts,
      async hasCrossFileReference(symbolName: string, selfFile: string): Promise<boolean> {
        try {
          const raw = await fs.readFile(indexFile, "utf8");
          const index = JSON.parse(raw);
          const refs = index.references.filter((r: { symbol: string; path: string }) => r.symbol === symbolName && r.path !== selfFile);
          return refs.length > 0;
        } catch {
          return false; // on any failure, be conservative: do not confirm death
        }
      },
    };
  } catch {
    return null; // language-graph not available -> text-only mode
  }
}

function asDetectorOptions(args: Record<string, unknown>, oracle: LanguageGraphOracle | null): DetectorOptions {
  const thresholds = typeof args.thresholds === "object" && args.thresholds && !Array.isArray(args.thresholds) ? args.thresholds : undefined;
  return {
    thresholds: thresholds as DetectorOptions["thresholds"],
    ...(oracle ? { languageGraphOracle: oracle } : {}),
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

async function runDetect(args: Record<string, unknown>) {
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
  const oracle = await buildLanguageGraphOracle(root);
  const allTexts = files.map((f) => f.text);
  // Cross-run dead-code memory (spec §2): annotate each finding with whether a prior
  // scan already surfaced it (still-unfixed) vs new, then record this scan. The store
  // is opt-out via CODE_DIET_PERSIST=0; failures never break the scan.
  const persist = process.env.CODE_DIET_PERSIST !== "0";
  const store = persist ? new FindingsStore(config.cacheDir) : null;
  const priorKeys = store ? store.load() : new Set<string>();
  const runId = new Date().toISOString();
  const findings = [];
  for (const f of files) {
    const hits = await analyzeSource(f.text, f.path, { ...asDetectorOptions(args, oracle), allSources: allTexts });
    for (const h of hits) {
      const rel = relative(root, f.path);
      const withFile = { ...h, file: rel };
      const seenBefore = store ? priorKeys.has(findingKey(withFile)) : false;
      findings.push({ ...withFile, seen_before: seenBefore, new_finding: !seenBefore });
    }
  }
  if (store) {
    try {
      store.recordScan(findings, runId);
    } catch {
      // a persistence failure must never fail the scan
    }
  }
  const newCount = findings.filter((f) => f.new_finding).length;
  const recurringCount = findings.length - newCount;
  return {
    findings: findings.slice(0, config.maxFindings),
    scanned_files: files.length,
    findings_count: findings.length,
    new_findings_count: newCount,
    recurring_findings_count: recurringCount,
    oracle_used: oracle !== null,
    persistence: persist ? { enabled: true, store: "findings.jsonl", note: "seen_before=true means a prior scan already surfaced this finding (still unfixed)." } : { enabled: false },
  };
}

async function runDeleteFirst(args: Record<string, unknown>) {
  const result = await runDetect(args);
  const candidates = result.findings.filter((f) => ["CD03", "CD04", "CD06"].includes(f.id));
  return {
    delete_candidates: candidates,
    delete_candidates_count: candidates.length,
    scanned_files: result.scanned_files,
    oracle_used: result.oracle_used,
    behavior_preservation_note:
      "Candidates exclude test files. Verify each with language-graph blast-radius and run the test suite before removal.",
  };
}

async function runReviewDiff(args: Record<string, unknown>) {
  const diffText = typeof args.diff_text === "string" ? args.diff_text : "";
  if (!diffText.trim()) throw new Error("diff_text is required");
  const added = diffText.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
  const findings = await analyzeSource(added, "<diff>", asDetectorOptions(args, null));
  return {
    risk_score: Math.min(100, findings.length * 15),
    findings,
    findings_count: findings.length,
    note: "Deterministic detection only. LLM may rerank/narrate; never re-detect.",
  };
}

async function runSimplificationPlan(args: Record<string, unknown>) {
  const result = await runDetect(args);
  const items = result.findings.map((f, i) => ({
    order: i + 1,
    file: f.file,
    id: f.id,
    action: f.suggested_action,
    effort: f.id === "CD03" ? "low" : "medium",
    risk: f.id === "CD03" ? "low" : "medium",
    behavior_preservation: "Run tests before/after; do not weaken assertions.",
  }));
  return { plan_items: items, plan_items_count: items.length, scanned_files: result.scanned_files, oracle_used: result.oracle_used };
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
        result = await runDetect(args);
        break;
      case "delete_first_report":
        result = await runDeleteFirst(args);
        break;
      case "review_diff":
        result = await runReviewDiff(args);
        break;
      case "simplification_plan":
        result = await runSimplificationPlan(args);
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
