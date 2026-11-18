import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkFeedUrl, onRequestGet } from '../functions/api/ics'

const ok = (raw: string) => {
  const r = checkFeedUrl(raw)
  return 'url' in r ? r.url.toString() : r.error
}

describe('checkFeedUrl', () => {
  it('accepts public http(s) addresses and turns webcal:// into https://', () => {
    expect(ok('https://calendar.example.com/feed.ics')).toBe('https://calendar.example.com/feed.ics')
    expect(ok('  http://example.org/a.ics?token=x ')).toBe('http://example.org/a.ics?token=x')
    expect(ok('webcal://example.com/basic.ics')).toBe('https://example.com/basic.ics')
    expect(ok('WEBCAL://example.com/basic.ics')).toBe('https://example.com/basic.ics')
    expect(ok('https://93.184.216.34/x.ics')).toBe('https://93.184.216.34/x.ics')
    expect(ok('https://[2606:4700::1111]/x.ics')).toBe('https://[2606:4700::1111]/x.ics')
  })

  it('refuses other schemes, garbage and credentials', () => {
    expect(ok('')).toBe('missing')
    expect(ok('not a url')).toBe('invalid')
    expect(ok('ftp://example.com/a.ics')).toBe('scheme')
    expect(ok('file:///etc/passwd')).toBe('scheme')
    expect(ok('javascript:alert(1)')).toBe('scheme')
    expect(ok('https://user:pw@example.com/a.ics')).toBe('invalid')
  })

  it('refuses private, loopback and local hosts in every spelling', () => {
    for (const u of [
      'http://localhost/a.ics',
      'http://app.localhost/a.ics',
      'http://printer.local/a.ics',
      'http://intranet/a.ics',
      'http://127.0.0.1/a.ics',
      'http://2130706433/a.ics',
      'http://0x7f.1/a.ics',
      'http://10.1.2.3/a.ics',
      'http://172.16.0.1/a.ics',
      'http://192.168.1.1/a.ics',
      'http://169.254.169.254/latest/meta-data',
      'http://100.64.0.1/a.ics',
      'http://0.0.0.0/a.ics',
      'http://[::1]/a.ics',
      'http://[::ffff:127.0.0.1]/a.ics',
      'http://[fd00::1]/a.ics',
      'http://[fe80::1]/a.ics',
      'http://localhost./a.ics',
    ])
      expect(ok(u), u).toBe('host')
  })
})

describe('onRequestGet', () => {
  afterEach(() => vi.unstubAllGlobals())
  const call = (url: string, headers: Record<string, string> = {}) => onRequestGet({ request: new Request('https://app.test/api/ics?url=' + encodeURIComponent(url), { headers }) })

  it('passes a calendar through with private cache headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', { headers: { 'Content-Type': 'application/octet-stream' } })))
    const res = await call('webcal://example.com/a.ics')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/calendar')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300')
    expect(res.headers.get('X-Ics-Proxy')).toBe('1')
    expect(await res.text()).toContain('BEGIN:VCALENDAR')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://example.com/a.ics')
  })

  it('refuses pages that are not calendars, private hosts and cross-site callers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })))
    expect((await call('https://example.com/a.ics')).status).toBe(415)
    expect((await call('http://192.168.0.1/a.ics')).status).toBe(403)
    expect((await call('https://example.com/a.ics', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
  })

  it('checks every redirect hop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/secret' } })))
    expect((await call('https://example.com/a.ics')).status).toBe(403)
  })

  it('stops reading bodies over the size limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'Content-Length': String(6 * 1024 * 1024) } })))
    expect((await call('https://example.com/a.ics')).status).toBe(413)
  })
})
