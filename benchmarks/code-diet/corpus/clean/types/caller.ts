import type { OptimizeOptions } from "./types.js";
function useOptions(o: OptimizeOptions): number { return o.width ?? 0; }
// Type-only exports consumed here; value function referenced internally; no unused export.
const DEFAULT_WIDTH = useOptions({ width: 1200 });
if (DEFAULT_WIDTH < 0) throw new Error("unreachable");
