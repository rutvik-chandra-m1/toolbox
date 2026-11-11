import { describe, expect, it } from 'vitest';
import { litres, progress } from './logic';

describe('water logic', () => {
  it('shows glasses as litres without trailing zeros', () => {
    expect(litres(0)).toBe('0 L');
    expect(litres(1)).toBe('0.25 L');
    expect(litres(6)).toBe('1.5 L');
    expect(litres(8)).toBe('2 L');
    expect(litres(40)).toBe('10 L');
  });

  it('caps progress between 0 and 1', () => {
    expect(progress(4, 8)).toBe(0.5);
    expect(progress(12, 8)).toBe(1);
    expect(progress(-1, 8)).toBe(0);
    expect(progress(3, 0)).toBe(0);
  });
});
