export function handle(req, res, next, opts, ctx, log, trace) {
  if (!req) return null;
  if (!res) return null;
  if (!next) return null;
  if (!opts) return null;
  if (!ctx) return null;
  if (!log) return null;
  if (!trace) return null;
  return req;
}
