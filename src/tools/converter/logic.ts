/** Each unit's size in the category's base unit (the one with factor 1). Temperature is handled apart. */
export const UNITS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mile: 1609.344, ft: 0.3048, inch: 0.0254, yard: 0.9144 },
  Weight: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523125 },
  Volume: { L: 1, mL: 0.001, 'cup (US)': 0.2365882365, 'tbsp (US)': 0.01478676478125, 'tsp (US)': 0.00492892159375, 'gallon (US)': 3.785411784 },
  Speed: { 'km/h': 1 / 3.6, 'm/s': 1, mph: 0.44704, knot: 1852 / 3600 },
  Area: { 'm²': 1, 'ft²': 0.09290304, acre: 4046.8564224, hectare: 10_000, 'km²': 1_000_000 },
  Data: { MB: 1, KB: 1 / 1024, GB: 1024, TB: 1024 * 1024 },
  Temperature: { '°C': 1, '°F': 1, K: 1 },
} as const satisfies Record<string, Record<string, number>>;

export type Category = keyof typeof UNITS;
export const CATEGORIES = Object.keys(UNITS) as Category[];
export const unitsOf = (category: Category): string[] => Object.keys(UNITS[category]);

const toCelsius: Record<string, (n: number) => number> = {
  '°C': (n) => n,
  '°F': (n) => ((n - 32) * 5) / 9,
  K: (n) => n - 273.15,
};
const fromCelsius: Record<string, (n: number) => number> = {
  '°C': (n) => n,
  '°F': (n) => (n * 9) / 5 + 32,
  K: (n) => n + 273.15,
};

/** Converts `value` between two units of one category; NaN if a unit does not belong to it. */
export function convert(value: number, category: Category, from: string, to: string): number {
  if (category === 'Temperature') {
    const [a, b] = [toCelsius[from], fromCelsius[to]];
    return a && b ? b(a(value)) : NaN;
  }
  const factors: Record<string, number> = UNITS[category];
  const [a, b] = [factors[from], factors[to]];
  return a !== undefined && b !== undefined ? (value * a) / b : NaN;
}

/** Up to 6 significant digits, without floating-point noise such as 0.30000000000000004. */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value);
}
