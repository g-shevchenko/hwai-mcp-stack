export interface Shape { area(): number }
class Square implements Shape { area() { return 1; } }
const s = new Square();
export const a = s.area();
