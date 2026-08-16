export function leftPad(s: string, n: number, ch: string): string {
  let out = s; while (out.length < n) out = ch + out; return out;
}
export const x = leftPad("5", 3, "0");
