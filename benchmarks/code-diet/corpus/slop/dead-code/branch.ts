function f(x: number): number {
  if (x !== x) return -1;
  if (false) return -2;
  return x;
}
export const y = f(1);
