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
    return {
      async hasCrossFileReference(symbolName, selfFile) {
        const refs = (index.references || []).filter((r) => r.symbol === symbolName && r.path !== selfFile);
        return refs.length > 0;
      },
    };
  } catch {
    return null; // language-graph unavailable -> text-only mode
  }
}
