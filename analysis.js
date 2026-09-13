// All numerical defaults are implementation choices; see docs/requirements.md.
export const VERSION = "shadow-v1.0";
export const clamp = (v, a = 0, b = 1) =>
  Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
export function hull(points) {
  if (points.length < 3) return points;
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [],
    hi = [];
  for (const v of p) {
    while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), v) <= 0) lo.pop();
    lo.push(v);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    while (hi.length > 1 && cross(hi.at(-2), hi.at(-1), v) <= 0) hi.pop();
    hi.push(v);
  }
  lo.pop();
  hi.pop();
  return lo.concat(hi);
}
export function polygonMetrics(p) {
  let a = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length],
      r = p[i],
      c = r[0] * q[1] - q[0] * r[1];
    a += c;
    x += (r[0] + q[0]) * c;
    y += (r[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-10) return { area: 0, centroid: [0.5, 0.5] };
  return { area: Math.abs(a / 2), centroid: [x / (3 * a), y / (3 * a)] };
}
export function clipHalfPlane(poly, n, b) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      c = poly[(i + 1) % poly.length],
      da = n[0] * a[0] + n[1] * a[1] - b,
      dc = n[0] * c[0] + n[1] * c[1] - b;
    if (da <= 1e-10) out.push(a);
    if ((da < 0 && dc > 0) || (da > 0 && dc < 0)) {
      const t = da / (da - dc);
      out.push([a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])]);
    }
  }
  return out;
}
export function contourVoronoi(contour) {
  const h = hull(contour),
    m = polygonMetrics(h);
  if (m.area === 0)
    return {
      polygon: [],
      seed: m.centroid,
      neighbors: [],
      area: 0,
      centroid: m.centroid,
    };
  const s = m.centroid,
    neighbors = [];
  let polygon = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (let i = 0; i < h.length; i++) {
    const a = h[i],
      b = h[(i + 1) % h.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    if (!len) continue;
    const n = [dy / len, -dx / len],
      d = n[0] * (a[0] - s[0]) + n[1] * (a[1] - s[1]);
    const q = [s[0] + 2 * d * n[0], s[1] + 2 * d * n[1]];
    neighbors.push(q);
    const normal = [q[0] - s[0], q[1] - s[1]],
      bisector = (q[0] ** 2 + q[1] ** 2 - s[0] ** 2 - s[1] ** 2) / 2;
    polygon = clipHalfPlane(polygon, normal, bisector);
  }
  return { polygon, seed: s, neighbors, ...polygonMetrics(polygon) };
}
export function analyze(rgba, width, height, options = {}) {
  if (![16, 64, 256].includes(options.bands ?? 256))
    throw Error("Invalid band count");
  if (rgba.length !== width * height * 4) throw Error("Frame size mismatch");
  const bands = options.bands ?? 256,
    threshold = clamp(options.threshold ?? 0.12, 0.02, 0.8),
    gamma = clamp(options.gamma ?? 1, 0.3, 3),
    roi = clamp(options.roi ?? 1, 0.2, 1),
    bg = options.background;
  const n = width * height,
    luminance = new Float32Array(n),
    quantized = new Uint8Array(n),
    mask = new Uint8Array(n),
    histogram = new Uint32Array(bands),
    points = Array.from({ length: bands }, () => []);
  const x0 = Math.floor((width * (1 - roi)) / 2),
    x1 = width - x0,
    y0 = Math.floor((height * (1 - roi)) / 2),
    y1 = height - y0,
    roiPixels = (x1 - x0) * (y1 - y0);
  let area = 0,
    totalDark = 0,
    cx = 0,
    cy = 0,
    darkSum = 0;
  for (let y = 0; y < height; y++) {
    const min = new Int32Array(bands).fill(width),
      max = new Int32Array(bands).fill(-1);
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        j = i * 4;
      let l =
        (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255;
      if (bg?.length === n) l = clamp(l / Math.max(0.08, bg[i]));
      l = clamp(l) ** gamma;
      luminance[i] = l;
      const b = Math.min(bands - 1, Math.floor(l * bands));
      quantized[i] = b;
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
      const d = 1 - l;
      totalDark += d;
      if (d >= threshold) {
        mask[i] = 1;
        histogram[b]++;
        area++;
        cx += x * d;
        cy += y * d;
        darkSum += d;
        min[b] = Math.min(min[b], x);
        max[b] = Math.max(max[b], x);
      }
    }
    for (let b = 0; b < bands; b++)
      if (max[b] >= 0) {
        points[b].push(
          [min[b] / width, y / height],
          [(max[b] + 1) / width, y / height],
          [(max[b] + 1) / width, (y + 1) / height],
          [min[b] / width, (y + 1) / height],
        );
      }
  }
  const gradients = new Float32Array(n),
    penumbra = new Uint8Array(n),
    widths = [];
  let perimeter = 0,
    penumbraArea = 0;
  const contours = [];
  for (let y = y0 + 1; y < y1 - 1; y++)
    for (let x = x0 + 1; x < x1 - 1; x++) {
      const i = y * width + x;
      const gx = (luminance[i + 1] - luminance[i - 1]) / 2,
        gy = (luminance[i + width] - luminance[i - width]) / 2,
        g = Math.hypot(gx, gy);
      gradients[i] = g;

      if (luminance[i] > 0.1 && luminance[i] < 0.9 && g > 0.003) {
        penumbra[i] = 1;
        penumbraArea++;
        widths.push(clamp(0.8 / g, 0, Math.max(width, height)));
      }
    }
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const a = x / width,
        b = y / height,
        c = (x + 1) / width,
        d = (y + 1) / height;
      if (x === x0 || !mask[i - 1]) {
        perimeter++;
        contours.push([a, b, a, d]);
      }
      if (x === x1 - 1 || !mask[i + 1]) {
        perimeter++;
        contours.push([c, b, c, d]);
      }
      if (y === y0 || !mask[i - width]) {
        perimeter++;
        contours.push([a, b, c, b]);
      }
      if (y === y1 - 1 || !mask[i + width]) {
        perimeter++;
        contours.push([a, d, c, d]);
      }
    }
  widths.sort((a, b) => a - b);
  const penumbraWidth = widths.length
    ? widths[Math.floor(widths.length / 2)]
    : 0;
  const layers = [];
  let cumulative = [];
  for (let b = 0; b < bands; b++) {
    if (points[b].length) cumulative = hull(cumulative.concat(points[b]));
    const cell = contourVoronoi(cumulative),
      tone = b / (bands - 1);
    layers.push({
      id: b + 1,
      tone,
      count: histogram[b],
      density: histogram[b] / roiPixels,
      cell,
      centroid: cell.centroid,
      area: cell.area,
    });
  }
  return {
    version: VERSION,
    width,
    height,
    bands,
    roiPixels,
    area: area / roiPixels,
    darkness: totalDark / roiPixels,
    centroid: darkSum
      ? [cx / darkSum / width, cy / darkSum / height]
      : [0.5, 0.5],
    perimeter,
    penumbraWidth,
    penumbraArea: penumbraArea / roiPixels,
    layers,
    histogram: Array.from(histogram),
    luminance,
    quantized,
    mask,
    gradients,
    penumbra,
    contours,
  };
}
export function toSources(features, options = {}, comparison = null) {
  const low = clamp(options.frequencyMin ?? 110, 20, 1000),
    high = clamp(options.frequencyMax ?? 3520, low + 1, 16000),
    spreadScale = clamp(options.spread ?? 1, 0, 2),
    reverb =
      clamp((features.penumbraWidth / features.width) * 8) *
      clamp(options.reverb ?? 0.5);
  const sources = features.layers.map((l) => ({
    id: l.id,
    tone: l.tone,
    frequency: low * (high / low) ** l.tone,
    x: (l.centroid[0] - 0.5) * 2.4,
    y: (0.5 - l.centroid[1]) * 2.6,
    z: 0.319 + l.tone * (1.65 - 0.319),
    gain: Math.sqrt(l.density) * (1 - l.tone * 0.5),
    density: l.density,
    spread: clamp(Math.sqrt(l.area) * spreadScale),
    reverb,
    area: l.area,
    polygon: l.cell.polygon,
  }));
  // The +1 layer is the generated comparison, distinct from the hardware subwoofer.
  if (comparison?.valid) {
    const f = comparison.features,
      d = comparison.distance,
      cell = f.layers.filter((l) => l.area > 0).at(-1)?.cell ?? {
        centroid: [0.5, 0.5],
        area: 0,
        polygon: [],
      };
    sources.push({
      id: 257,
      tone: 0,
      frequency: 40,
      x: (cell.centroid[0] - 0.5) * 2.4,
      y: (0.5 - cell.centroid[1]) * 2.6,
      z: 0.319,
      gain: clamp(d) * 0.45,
      density: f.area,
      spread: clamp(Math.sqrt(cell.area)),
      reverb,
      area: cell.area,
      polygon: cell.polygon,
    });
  }
  const sum = sources.reduce((s, v) => s + v.gain, 0),
    scale =
      sum > 0 ? Math.min(1, 0.65 / sum) * Math.sqrt(clamp(features.area)) : 0;
  for (const s of sources) s.gain *= scale;
  return sources;
}
export function compareFeatures(a, b) {
  if (a.bands !== b.bands || a.width !== b.width || a.height !== b.height)
    throw Error("Comparison settings mismatch");
  let hist = 0;
  for (let i = 0; i < a.bands; i++)
    hist += Math.abs(
      a.histogram[i] / a.roiPixels - b.histogram[i] / b.roiPixels,
    );
  const position =
    Math.hypot(a.centroid[0] - b.centroid[0], a.centroid[1] - b.centroid[1]) /
    Math.SQRT2;
  return clamp(
    0.35 * Math.min(1, hist / 2) +
      0.25 * Math.abs(a.area - b.area) +
      0.2 * position +
      (0.2 * Math.abs(a.penumbraWidth - b.penumbraWidth)) /
        Math.max(a.width, a.height),
  );
}
export class ComparisonValidator {
  constructor() {
    this.reset();
  }
  reset() {
    this.count = 0;
    this.lastId = null;
    this.direction = "hold";
  }
  validate({
    sourceId,
    generatedFrom,
    generatedId,
    sourceAt,
    generatedAt,
    now = Date.now(),
    distance,
    target = 0.12,
  }) {
    let reason = "";
    if (sourceId !== generatedFrom || !sourceId || !generatedId)
      reason = "由来が一致しません";
    else if (
      !Number.isFinite(sourceAt) ||
      !Number.isFinite(generatedAt) ||
      now - sourceAt > 5000 ||
      now - generatedAt > 5000 ||
      generatedAt < sourceAt ||
      generatedAt > now + 1000
    )
      reason = "比較画像が古いか時刻が無効です";
    else if (!Number.isFinite(distance) || distance < 0 || distance > 1)
      reason = "比較値が範囲外です";
    if (reason) {
      this.reset();
      return { valid: false, label: "hold", reason };
    }
    const direction =
      distance < target - 0.02
        ? "depart"
        : distance > target + 0.02
          ? "converge"
          : "hold";
    if (generatedId !== this.lastId) {
      this.count = this.direction === direction ? this.count + 1 : 1;
      this.lastId = generatedId;
      this.direction = direction;
    }
    return {
      valid: this.count >= 3,
      label: this.count >= 3 ? direction : "hold",
      reason: this.count >= 3 ? "比較を採用" : `継続確認 ${this.count}/3`,
    };
  }
}
export function summarize(features) {
  return {
    version: features.version,
    width: features.width,
    height: features.height,
    bands: features.bands,
    area: features.area,
    darkness: features.darkness,
    centroid: features.centroid,
    perimeter: features.perimeter,
    penumbraWidth: features.penumbraWidth,
    histogram: features.histogram,
  };
}
export function testFrame(width, height, t = 0, deviation = 0) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const xx =
          (x / width - 0.5 - Math.sin(t * 0.37) * 0.1 - deviation * 0.08) /
          (0.24 + deviation * 0.06),
        yy = (y / height - 0.5 - Math.cos(t * 0.29) * 0.05) / 0.27;
      const angle = Math.atan2(yy, xx),
        r = Math.hypot(xx, yy) * (1 + 0.09 * Math.sin(angle * 5 + t * 0.2));
      const v = Math.round(248 - 225 * Math.exp(-Math.pow(r, 3.2)));
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return data;
}
