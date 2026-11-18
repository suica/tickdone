// The arithmetic of list windowing (see components/listWindow.ts), free of DOM code so it can be unit tested.


/** The rows [start, end) that overlap the band [top, bottom] (px from the top of the first row). */
export function windowRange(heights: readonly number[], top: number, bottom: number): [number, number] {
  let y = 0
  let start = heights.length
  let i = 0
  for (; i < heights.length; i++) {
    if (y + heights[i] > top) {
      start = i
      break
    }
    y += heights[i]
  }
  let end = start
  for (i = start; i < heights.length && y < bottom; i++) {
    y += heights[i]
    end = i + 1
  }
  return [start, Math.max(start, end)]
}

export type Part = { kind: 'rows'; from: number; to: number } | { kind: 'gap'; from: number; to: number; height: number }

/** The rows to render: the range plus the kept indexes, with spacers (their estimated height) for the rows between. */
export function windowParts(heights: readonly number[], range: readonly [number, number], keep: Iterable<number> = []): Part[] {
  const n = heights.length
  const on = new Set<number>()
  for (let i = range[0]; i < Math.min(range[1], n); i++) on.add(i)
  for (const k of keep) if (k >= 0 && k < n) on.add(k)
  const idx = [...on].sort((a, b) => a - b)
  const parts: Part[] = []
  let at = 0
  const gap = (to: number) => {
    if (to <= at) return
    let h = 0
    for (let i = at; i < to; i++) h += heights[i]
    parts.push({ kind: 'gap', from: at, to, height: h })
  }
  for (let j = 0; j < idx.length; ) {
    let k = j
    while (k + 1 < idx.length && idx[k + 1] === idx[k] + 1) k++
    gap(idx[j])
    parts.push({ kind: 'rows', from: idx[j], to: idx[k] + 1 })
    at = idx[k] + 1
    j = k + 1
  }
  gap(n)
  return parts
}
