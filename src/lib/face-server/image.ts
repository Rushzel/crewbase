// Images as plain RGB pixel arrays, and the few operations the face checks need.
// Kept free of native code so the signal tests can build synthetic frames with it.

export type Rgb = { data: Uint8Array; width: number; height: number };

export type Box = { x: number; y: number; w: number; h: number };

export function makeImage(width: number, height: number, fill: [number, number, number] = [0, 0, 0]): Rgb {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) data.set(fill, i * 3);
  return { data, width, height };
}

// Bilinear sample of one channel at a fractional position; outside the image the edge is mirrored.
export function sample(img: Rgb, x: number, y: number, channel: number): number {
  const mirror = (v: number, max: number) => {
    if (max <= 1) return 0;
    const period = 2 * (max - 1);
    let m = Math.abs(v) % period;
    if (m > max - 1) m = period - m;
    return m;
  };
  const xm = mirror(x, img.width);
  const ym = mirror(y, img.height);
  const x0 = Math.floor(xm);
  const y0 = Math.floor(ym);
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const fx = xm - x0;
  const fy = ym - y0;
  const at = (xx: number, yy: number) => img.data[(yy * img.width + xx) * 3 + channel];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) + at(x1, y0) * fx * (1 - fy) + at(x0, y1) * (1 - fx) * fy + at(x1, y1) * fx * fy
  );
}

// A square crop of side `size` (in source pixels) centred on (cx, cy), resized to `out` x `out`.
export function cropSquare(img: Rgb, cx: number, cy: number, size: number, out: number): Rgb {
  const result = makeImage(out, out);
  const scale = size / out;
  for (let v = 0; v < out; v++) {
    for (let u = 0; u < out; u++) {
      const sx = cx - size / 2 + (u + 0.5) * scale - 0.5;
      const sy = cy - size / 2 + (v + 0.5) * scale - 0.5;
      for (let c = 0; c < 3; c++) result.data[(v * out + u) * 3 + c] = Math.round(sample(img, sx, sy, c));
    }
  }
  return result;
}

// Mean RGB over a box, clipped to the image.
export function meanRgb(img: Rgb, box: Box): [number, number, number] {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.w));
  const y1 = Math.min(img.height, Math.ceil(box.y + box.h));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 3;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

// Planar float tensor (NCHW, one image) in RGB or BGR order, scaled by `scale`.
export function toTensor(img: Rgb, order: "rgb" | "bgr", scale = 1): Float32Array {
  const plane = img.width * img.height;
  const out = new Float32Array(plane * 3);
  const map = order === "rgb" ? [0, 1, 2] : [2, 1, 0];
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = img.data[i * 3 + map[c]] * scale;
  }
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
