// Re-encodes Chromium's 8-bit, non-interlaced PNG screenshots smaller, with Node's zlib only.
// Chromium dithers gradients, so smooth backgrounds are full of one-level noise that PNG cannot compress;
// `lsb: true` drops the lowest bit of every channel (at most 1/255 off, invisible) before encoding.
import { crc32, deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function shrinkPng(png, { lsb = false } = {}) {
  const { width, height, channels, pixels } = decode(png)
  // Drop the alpha channel when the image is opaque.
  let px = pixels
  let ch = channels
  if (ch === 4 && px.every((v, i) => i % 4 !== 3 || v === 255)) {
    px = Buffer.alloc(width * height * 3)
    for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) pixels.copy(px, j, i, i + 3)
    ch = 3
  }
  if (lsb) for (let i = 0; i < px.length; i++) if (px[i] !== 255) px[i] &= 0xfe
  return encode(width, height, ch, px)
}

function decode(png) {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let pos = 8
  let ihdr
  const idat = []
  while (pos < png.length) {
    const len = png.readUInt32BE(pos)
    const type = png.toString('latin1', pos + 4, pos + 8)
    const data = png.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') ihdr = data
    else if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const [depth, colorType, , , interlace] = ihdr.subarray(8)
  const channels = { 2: 3, 6: 4 }[colorType]
  if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      out[x] = (line[x] + predict(filter, a, b, c)) & 255
    }
  }
  return { width, height, channels, pixels }
}

function encode(width, height, channels, pixels) {
  const stride = width * channels
  const out = Buffer.alloc((stride + 1) * height)
  const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride))
  for (let y = 0; y < height; y++) {
    const line = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    // Pick the filter whose output has the smallest sum of absolute values (the usual heuristic).
    let best = 0
    let bestSum = Infinity
    for (let f = 0; f < 5; f++) {
      const buf = candidates[f]
      let sum = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? line[x - channels] : 0
        const b = prev[x]
        const c = x >= channels ? prev[x - channels] : 0
        const v = (line[x] - predict(f, a, b, c)) & 255
        buf[x] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) {
        bestSum = sum
        best = f
      }
    }
    out[y * (stride + 1)] = best
    candidates[best].copy(out, y * (stride + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8)
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(out, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** The PNG filter predictors: none, sub, up, average, Paeth. */
function predict(filter, a, b, c) {
  switch (filter) {
    case 0:
      return 0
    case 1:
      return a
    case 2:
      return b
    case 3:
      return (a + b) >> 1
    default: {
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
  }
}
