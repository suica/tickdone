/** Fades out the launch screen from index.html once the app has rendered. */

// Keep the logo up long enough for its draw-in to finish, so a fast start doesn't just flash it.
const MIN_VISIBLE_MS = 1100

export function hideLaunchScreen() {
  const el = document.getElementById('launch')
  if (!el) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const wait = reduced ? 0 : Math.max(0, MIN_VISIBLE_MS - performance.now())
  setTimeout(() => {
    if (reduced) return el.remove()
    el.classList.add('out')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
    setTimeout(() => el.remove(), 600)
  }, wait)
}
