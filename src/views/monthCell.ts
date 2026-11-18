// Month view cells, kept free of DOM and store code so they can be unit tested.
import { getISOWeek, getWeek } from 'date-fns'

/** Most bars a month cell shows; the rest are behind "+N more". */
export const MAX_CHIPS = 4

/**
 * How many of `count` tasks a month cell shows when `rows` bar rows fit in it: all of them when they
 * fit (at most MAX_CHIPS), otherwise one row less than fits (at most MAX_CHIPS) plus a "+N more" row.
 */
export function capChips(count: number, rows: number): { shown: number; more: number } {
  const room = Math.max(1, Math.min(rows, MAX_CHIPS + 1))
  if (count <= Math.min(room, MAX_CHIPS)) return { shown: count, more: 0 }
  const shown = Math.max(0, Math.min(room - 1, MAX_CHIPS))
  return { shown, more: count - shown }
}

/**
 * The week number of `d`: ISO 8601 weeks when weeks start on Monday, otherwise weeks starting on
 * Sunday where week 1 holds January 1.
 */
export function weekNumber(d: Date, weekStartsOn: 0 | 1): number {
  return weekStartsOn === 1 ? getISOWeek(d) : getWeek(d, { weekStartsOn: 0, firstWeekContainsDate: 1 })
}
