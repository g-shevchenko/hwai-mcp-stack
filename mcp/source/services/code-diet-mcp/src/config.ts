import path from "node:path";

export const CODE_DIET_SCHEMA_VERSION = "code-diet.v0.1";
export const CODE_DIET_MEASUREMENT_SCHEMA_VERSION = "code-diet-measurement.v0.1";
export const CODE_DIET_PIPELINE_VERSION = "2026-08-05.local-code-diet-v0.1.0";

export interface CodeDietConfig {
  artifactDir: string;
  cacheDir: string;
  maxArtifactChars: number;
  maxFileBytes: number;
  maxFiles: number;
  maxFindings: number;
  publicBaseUrl: string;
  requestLogPath: string;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultCacheDir(): string {
  const home = process.env.HOME?.trim();
  return home ? path.join(home, ".hwai", "code-diet-mcp") : path.join("/tmp", "hwai-code-diet-mcp-cache");
}

export function getCodeDietConfig(): CodeDietConfig {
  const cacheDir = process.env.CODE_DIET_CACHE_DIR || defaultCacheDir();
  return {
    artifactDir: process.env.CODE_DIET_ARTIFACT_DIR || path.join(cacheDir, "artifacts"),
    cacheDir,
    maxArtifactChars: readPositiveInt(process.env.CODE_DIET_MAX_ARTIFACT_CHARS, 2_000_000),
    maxFileBytes: readPositiveInt(process.env.CODE_DIET_MAX_FILE_BYTES, 512_000),
    maxFiles: readPositiveInt(process.env.CODE_DIET_MAX_FILES, 4_000),
    maxFindings: readPositiveInt(process.env.CODE_DIET_MAX_FINDINGS, 120),
    publicBaseUrl: (process.env.CODE_DIET_PUBLIC_BASE_URL || "code-diet://local").replace(/\/+$/, ""),
    requestLogPath: process.env.CODE_DIET_REQUEST_LOG_PATH || path.join(cacheDir, "requests.jsonl"),
  };
}
