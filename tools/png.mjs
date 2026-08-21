// tools/png.mjs — write a PNG with nothing installed.
//
// The scan produces images and images have to leave the process. Node ships zlib,
// which is the only hard part of a PNG; the rest is four chunks and a CRC.
import zlib from 'node:zlib';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

/** rgb: (x, y) -> [r, g, b], each 0..255. */
export function png(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;                                  // filter: none
    for (let x = 0; x < width; x++) {
      const c = rgb(x, y);
      raw[o++] = c[0] & 255; raw[o++] = c[1] & 255; raw[o++] = c[2] & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * A film palette rather than a rainbow. Radiographs and exposure plates are read
 * by people who need to see a faint thing next to a bright thing, and a rainbow
 * makes small differences look like large ones wherever the hue happens to turn.
 */
export const FILM = (t) => {
  const v = Math.max(0, Math.min(1, t));
  // black -> deep blue -> cyan -> white, monotonic in luminance the whole way
  const r = Math.round(255 * Math.max(0, (v - 0.55) / 0.45) ** 0.9);
  const g = Math.round(255 * Math.max(0, (v - 0.25) / 0.75) ** 0.8);
  const b = Math.round(255 * Math.min(1, v / 0.35) ** 0.7);
  return [r, g, b];
};

/**
 * Log stretch with a floor: one bright cluster should not black out twenty faint
 * ones, and a single hit must be visible. On a leak plate most pixels are 0 and
 * the ones that matter are 1 or 2 — ramped from zero, the whole finding came out
 * as dark blue speckle you had to already know was there.
 */
export const stretch = (v, peak, floor = 0.42) =>
  (v <= 0 || peak <= 0) ? 0 : floor + (1 - floor) * (Math.log1p(v) / Math.log1p(peak));
