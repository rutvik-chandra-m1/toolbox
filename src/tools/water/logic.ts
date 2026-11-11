import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'water';
export const DEFAULT_GOAL = 8;
const GLASS_ML = 250;

/** In the `days` collection the id is the local `YYYY-MM-DD`; in `settings` the single record `goal`. */
export interface Glasses extends Entity {
  glasses: number;
}

export function litres(glasses: number): string {
  return `${((glasses * GLASS_ML) / 1000).toFixed(2).replace(/\.?0+$/, '')} L`;
}

/** Share of the goal reached, capped at 1. */
export function progress(glasses: number, goal: number): number {
  return goal > 0 ? Math.min(1, Math.max(0, glasses) / goal) : 0;
}
