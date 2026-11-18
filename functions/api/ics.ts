// GET /api/ics?url=… — a stateless same-origin pass-through for calendar feeds (Cloudflare Pages Function).
//
// Most calendar servers send no CORS headers, so the browser cannot read a feed directly. This function
// fetches the feed and returns it as is. It keeps nothing: no storage, no logs of its own, no shared cache.
// It only fetches public http(s) hosts, gives up after a timeout and a size limit, and only passes on
// iCalendar data.

export const TIMEOUT_MS = 10_000
export const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 4

/** Whether an IPv4 address is private, loopback, link-local or otherwise not on the public internet. */
function privateV4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function privateV6(host: string): boolean {
  const ip = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (ip === '::' || ip === '::1') return true
  // IPv4-mapped / -compatible addresses: ::ffff:7f00:1 or ::ffff:127.0.0.1
  const mapped = /^::(?:ffff:)?(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(ip)
  if (mapped) {
    if (mapped[1]) return privateV4(mapped[1])
    const hi = parseInt(mapped[2], 16)
    const lo = parseInt(mapped[3], 16)
    return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  const first = parseInt(ip.split(':')[0] || '0', 16)
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    ip.startsWith('64:ff9b:') || // NAT64
    ip.startsWith('2001:db8:') // documentation
  )
}

/**
 * Checks a feed address. `webcal://` becomes `https://`; only http(s) to public host names and
 * addresses is allowed, without user names or passwords. Returns the URL to fetch or an error code.
 */
export function checkFeedUrl(raw: string | null): { url: URL } | { error: 'missing' | 'invalid' | 'scheme' | 'host' } {
  const s = raw?.trim()
  if (!s) return { error: 'missing' }
  let url: URL
  try {
    url = new URL(s.replace(/^webcals?:\/\//i, 'https://'))
  } catch {
    return { error: 'invalid' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'scheme' }
  if (url.username || url.password) return { error: 'invalid' }
  // The URL parser has already normalised numeric forms such as http://2130706433/ to 127.0.0.1.
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { error: 'invalid' }
  if (host.startsWith('[')) return privateV6(host) ? { error: 'host' } : { url }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return privateV4(host) ? { error: 'host' } : { url }
  if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/.test(host)) return { error: 'host' }
  return { url }
}

const HEADERS = { 'X-Ics-Proxy': '1', 'X-Content-Type-Options': 'nosniff' }

function fail(status: number, code: string): Response {
  return new Response(code, { status, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Reads at most MAX_BYTES of a body; null when it is larger. */
async function readCapped(res: Response): Promise<Uint8Array | null> {
  const len = Number(res.headers.get('Content-Length') ?? 0)
  if (len > MAX_BYTES) return null
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.byteLength
  }
  return out
}

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  // Only for the app itself: browsers mark requests from other sites.
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return fail(403, 'cross-site')
  const checked = checkFeedUrl(new URL(request.url).searchParams.get('url'))
  if ('error' in checked) return fail(checked.error === 'host' ? 403 : 400, checked.error)

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    let url = checked.url
    let res: Response | undefined
    // Follow redirects by hand so that every hop is checked again.
    for (let hop = 0; ; hop++) {
      res = await fetch(url.toString(), {
        redirect: 'manual',
        signal: ctl.signal,
        headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5', 'User-Agent': 'TickDone calendar subscription' },
      })
      const loc = res.headers.get('Location')
      if (res.status < 300 || res.status > 399 || !loc) break
      if (hop >= MAX_REDIRECTS) return fail(502, 'redirects')
      const next = checkFeedUrl(new URL(loc, url).toString())
      if ('error' in next) return fail(403, next.error)
      url = next.url
    }
    if (!res.ok) return fail(502, `upstream ${res.status}`)
    const body = await readCapped(res)
    if (!body) return fail(413, 'too-large')
    const text = new TextDecoder().decode(body)
    const type = res.headers.get('Content-Type') ?? ''
    if (!/text\/calendar/i.test(type) && !/^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ''))) return fail(415, 'not-calendar')
    return new Response(text, {
      status: 200,
      // Private: the address of a feed can be a secret, so no shared cache may keep it.
      headers: { ...HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' },
    })
  } catch {
    return fail(ctl.signal.aborted ? 504 : 502, ctl.signal.aborted ? 'timeout' : 'unreachable')
  } finally {
    clearTimeout(timer)
  }
}
