import { ROWS } from './automaton.ts'

export const INITIAL_ROWS = 1 + Math.round(0.65 * (ROWS - 1))
export const DURATION = 32
export const REMAINING_DURATION = ((ROWS - INITIAL_ROWS) * DURATION) / ROWS
export const automaticRows = (seconds: number) =>
  Math.min(ROWS, INITIAL_ROWS + Math.floor((seconds * ROWS) / DURATION))
