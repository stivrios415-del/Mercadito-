import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO con imágenes PNG incrustadas (compatible con Chrome, Edge y Safari). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = []
  const payloads = []
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    payloads.push(data)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...payloads])
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function makeIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const s = size / 512
  const radius = 112 * s
  const strokes = [
    [150, 250, 362, 250, 14],  // borde de la canasta
    [168, 250, 198, 372, 13],  // pared izquierda
    [344, 250, 314, 372, 13],  // pared derecha
    [198, 372, 314, 372, 13],  // base
    [222, 250, 238, 372, 7],   // varilla
    [256, 250, 256, 372, 7],   // varilla
    [290, 250, 274, 372, 7],   // varilla
    [180, 310, 332, 310, 7],   // trama horizontal
    [214, 250, 236, 186, 13],  // asa izquierda
    [236, 186, 276, 186, 13],  // asa superior
    [276, 186, 298, 250, 13],  // asa derecha
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const qx = x / s
      const qy = y / s
      const dx = Math.max(0, Math.min(qx, 512 - qx) - (512 - radius))
      const dy = Math.max(0, Math.min(qy, 512 - qy) - (512 - radius))
      const corner = Math.hypot(dx, dy) - radius
      const bgAlpha = Math.max(0, Math.min(1, 1 - corner))
      if (bgAlpha <= 0) continue

      const t = Math.min(1, (qx + qy) / 1024)
      const gold = t < 0.5 ? mix([247, 228, 174], [212, 173, 85], t * 2) : mix([212, 173, 85], [169, 121, 31], (t - 0.5) * 2)
      let whiteAlpha = 0
      for (const [ax, ay, bx, by, w] of strokes) {
        const d = segmentDistance(qx, qy, ax, ay, bx, by)
        whiteAlpha = Math.max(whiteAlpha, Math.max(0, Math.min(1, w + 1 - d)))
      }
      const r = Math.round(gold[0] + (255 - gold[0]) * whiteAlpha)
      const g = Math.round(gold[1] + (253 - gold[1]) * whiteAlpha)
      const b = Math.round(gold[2] + (247 - gold[2]) * whiteAlpha)
      const i = (y * size + x) * 4
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
      pixels[i + 3] = Math.round(255 * bgAlpha)
    }
  }
  return png(size, pixels)
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), makeIcon(size))
  console.log(`icon-${size}.png generado`)
}

writeFileSync(
  new URL('../public/favicon.ico', import.meta.url),
  ico([16, 32, 48].map((size) => ({ size, data: makeIcon(size) }))),
)
console.log('favicon.ico generado')
