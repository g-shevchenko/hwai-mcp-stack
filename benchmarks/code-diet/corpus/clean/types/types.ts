// TS type-only exports: compile-time, no runtime refs. Must yield 0 CD03 (Category-D FP guard).
export interface OptimizeOptions { width?: number; height?: number }
export type OptimizationResult = { ok: boolean; bytes: number }
export interface TraceMetadata { id: string; surface: string }
