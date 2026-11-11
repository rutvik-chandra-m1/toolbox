import { describe, expect, it } from 'vitest';
import { CATEGORIES, convert, formatResult, unitsOf } from './logic';

describe('converter logic', () => {
  it('converts by factor', () => {
    expect(convert(1, 'Length', 'km', 'm')).toBe(1000);
    expect(convert(1, 'Length', 'mile', 'km')).toBeCloseTo(1.609344);
    expect(convert(10, 'Weight', 'kg', 'lb')).toBeCloseTo(22.0462, 4);
    expect(convert(36, 'Speed', 'km/h', 'm/s')).toBeCloseTo(10);
    expect(convert(2, 'Data', 'GB', 'MB')).toBe(2048);
  });

  it('converts temperature with offsets', () => {
    expect(convert(100, 'Temperature', '°C', '°F')).toBeCloseTo(212);
    expect(convert(-40, 'Temperature', '°F', '°C')).toBeCloseTo(-40);
    expect(convert(0, 'Temperature', '°C', 'K')).toBeCloseTo(273.15);
  });

  it('round-trips every unit of every category', () => {
    for (const category of CATEGORIES) {
      for (const unit of unitsOf(category)) {
        const base = unitsOf(category)[0] as string;
        expect(convert(convert(5, category, base, unit), category, unit, base)).toBeCloseTo(5, 6);
      }
    }
  });

  it('gives NaN for a unit of another category, shown as nothing', () => {
    expect(convert(1, 'Length', 'kg', 'm')).toBeNaN();
    expect(formatResult(NaN)).toBe('');
  });
});
