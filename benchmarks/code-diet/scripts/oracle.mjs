// Shared language-graph oracle for the eval grader (eval v2 §5c).
// Mirrors the implementation in code-diet-mcp/src/index.ts buildLanguageGraphOracle:
// builds/loads the language-graph index for a corpus root and answers
// hasCrossFileReference(symbolName, selfFile) from index.references.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LG_DIST = path.resolve(__dirname, "../../../mcp/source/services/language-graph-mcp/dist");

export async function buildLanguageGraphOracle(corpusRoot) {
  try {
    const configModule = await import(path.join(LG_DIST, "config.js"));
    const graphModule = await import(path.join(LG_DIST, "graph.js"));
    const textUtilsModule = await import(path.join(LG_DIST, "text-utils.js"));
    const lgConfig = configModule.getLanguageGraphConfig();
    await graphModule.buildLanguageGraphIndex(lgConfig, { repo_root: corpusRoot, auto_index: true });
    const indexFile = path.join(lgConfig.indexDir, `${textUtilsModule.stableHash(path.resolve(corpusRoot))}.json`);
    let index = null;
    try {
      index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    } catch {
      return null;
    }
    const indexedTexts = [];
    const seenPaths = new Set();
    // index.files is an OBJECT keyed by path (not an array) — normalize both shapes.
    const collections = [
      index.files && !Array.isArray(index.files) ? Object.values(index.files) : index.files,
      index.symbols,
      index.references,
    ];
    for (const coll of collections) {
      for (const rec of coll || []) {
        const p = rec.path || rec.file;
        if (p && !seenPaths.has(p)) {
          seenPaths.add(p);
          const abs = path.isAbsolute(p) ? p : path.join(corpusRoot, p);
          try { indexedTexts.push(fs.readFileSync(abs, "utf8")); } catch { /* file moved */ }
        }
      }
    }
    return {
      indexedTexts,
      async hasCrossFileReference(symbolName, selfFile) {
        const refs = (index.references || []).filter((r) => r.symbol === symbolName && r.path !== selfFile);
        return refs.length > 0;
      },
    };
  } catch {
    return null; // language-graph unavailable -> text-only mode
  }
}
