// Interpretive signal-field drawing. It visualizes analysis and organization;
// these filaments are neither EEG measurements nor calibrated loudspeaker feeds.
const TAU = Math.PI * 2;
const bounded = (v, low = 0, high = 1) => Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));
const value = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const chapterKey = chapter => typeof chapter === 'string' ? chapter : chapter?.organization ?? chapter?.id ?? chapter?.chapterId ?? 'sustain';
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

function waveAt(phase, waveform) {
  const phase01 = ((phase / TAU) % 1 + 1) % 1;
  if (waveform === 'square') return Math.tanh(Math.sin(phase) * 4);
  if (waveform === 'sawtooth') return 2 * phase01 - 1;
  if (waveform === 'triangle') return 1 - 4 * Math.abs(phase01 - .5);
  if (waveform === 'noise') return (Math.sin(phase * 7.31) + .5 * Math.sin(phase * 17.7)) / 1.5;
  return Math.sin(phase);
}

// Resample an observed contour around its centroid. The radial scale is used
// artistically in the central sculpture; source position/gain remain visible too.
function contourProfile(layer, source) {
  const polygon = source?.polygon ?? layer?.cell?.polygon ?? [];
  const center = layer?.centroid ?? layer?.cell?.centroid ?? [.5, .5];
  if (polygon.length < 3) return null;
  const radial = polygon.map(p => ({
    angle: (Math.atan2(p[1] - center[1], p[0] - center[0]) + TAU) % TAU,
    radius: Math.hypot(p[0] - center[0], p[1] - center[1]),
  })).sort((a, b) => a.angle - b.angle);
  const mean = radial.reduce((sum, p) => sum + p.radius, 0) / radial.length;
  return mean > 0 ? { radial, mean } : null;
}
function radiusAt(profile, angle) {
  if (!profile) return 1;
  const a = (angle + TAU) % TAU;
  const list = profile.radial;
  let upper = list.findIndex(p => p.angle >= a);
  if (upper < 0) upper = 0;
  const end = list[upper], start = list[(upper + list.length - 1) % list.length];
  let da = end.angle - start.angle;
  let position = a - start.angle;
  if (da <= 0) da += TAU;
  if (position < 0) position += TAU;
  return bounded((start.radius + (end.radius - start.radius) * position / da) / profile.mean, .6, 1.5);
}
function text(ctx, label, x, y, color = '#777b7c', size = 9, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${mono}`;
  ctx.textAlign = align;
  ctx.fillText(label, x, y);
}
function line(ctx, x1, y1, x2, y2, stroke, width = .6) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

export function renderSignalField(canvas, { features = null, sources = [], chapter = 'sustain', waveform = 'sine', time = 0, frozen = false } = {}) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width || 1500, height = canvas.height || 650;
  ctx.save();
  ctx.setTransform(width / 1500, 0, 0, height / 650, 0, 0);
  ctx.clearRect(0, 0, 1500, 650);
  ctx.fillStyle = '#070809'; ctx.fillRect(0, 0, 1500, 650);
  const kind = chapterKey(chapter);
  const t = frozen ? 0 : value(time);
  const layers = features?.layers ?? [];
  const sourceList = Array.isArray(sources) ? sources : [];
  const sourceById = new Map(sourceList.map(s => [s.id, s]));
  const hasData = layers.length > 0;
  const layerCount = layers.length || 30;
  const count = Math.min(30, layerCount);
  const darkness = bounded(value(features?.darkness, .42));
  const area = bounded(value(features?.area, .45));
  const centroid = features?.centroid ?? [.5, .5];
  const centerX = 750 + (value(centroid[0], .5) - .5) * 130;
  const centerY = 315 + (value(centroid[1], .5) - .5) * 85;
  const maxGain = Math.max(.008, ...sourceList.map(s => value(s.gain)));
  const baseRadius = 232 + area * 74;
  const drift = Math.sin(t * .18) * 5;
  const warm = kind === 'pulse' ? [200, 157, 121] : [190, 169, 146];

  // Sparse registration marks keep the field a visual instrument, not a card.
  for (const [x, y] of [[180, 70], [1320, 70], [180, 572], [1320, 572]]) {
    line(ctx, x-4, y, x+4, y, '#333638'); line(ctx, x, y-4, x, y+4, '#333638');
  }
  text(ctx, 'INPUT', 36, 62, '#d3d1ca', 12);
  text(ctx, `${String(layerCount).padStart(2, '0')} / TONE LAYERS`, 36, 81, '#9b9f9e', 10);
  text(ctx, 'SPATIAL OUTPUT', 1464, 62, '#d3d1ca', 12, 'right');
  text(ctx, '17 + SUB / PROVISIONAL', 1464, 81, '#9b9f9e', 10, 'right');
  text(ctx, 'CONTOUR → SIGNAL FIELD', 750, 54, '#888e8f', 9, 'center');

  // The right rail denotes the proposed output layout. Lines are associations,
  // never fabricated measured speaker-level meters.
  for (let j = 0; j < 18; j++) {
    const y = 119 + j * 23;
    const label = j < 16 ? `W${String(j+1).padStart(2,'0')}` : j === 16 ? 'ARM' : 'SUB';
    text(ctx, label, 1455, y+3, j > 15 ? '#d4b698' : '#a1a7a6', 10, 'right');
    line(ctx, 1334, y, 1410, y, j > 15 ? '#4b4238' : '#34383a');
    ctx.fillStyle = j > 15 ? '#c2a080' : '#c4c4ba';
    ctx.beginPath(); ctx.arc(1329, y, 1.7, 0, TAU); ctx.fill();
  }

  for (let i = 0; i < count; i++) {
    const layerIndex = count === layerCount ? i : Math.round(i / Math.max(1, count-1) * (layerCount-1));
    const layer = layers[layerIndex];
    const source = sourceById.get(layer?.id ?? i+1) ?? sourceList[layerIndex];
    const tone = bounded(value(source?.tone, value(layer?.tone, i / Math.max(1,count-1))));
    const gain = bounded(value(source?.gain) / maxGain);
    const density = bounded(Math.sqrt(value(layer?.density, 0)) * 5);
    const signal = hasData ? Math.max(gain, density * .6) : .12;
    const profile = contourProfile(layer, source);
    const layerRadius = baseRadius * (.40 + tone * .74);
    const sourceX = bounded(value(source?.x) / 3.5, -1, 1);
    const sourceY = bounded(value(source?.y) / 3.5, -1, 1);
    const phase = tone * TAU + t * .07;
    const pulse = kind === 'pulse' ? .5 + .5 * Math.sin(t * 2.1 - tone * TAU) : 1;
    const alpha = hasData ? .25 + signal * .62 : .10;
    const colored = i % 7 === 2 || (kind === 'texture' && i % 3 === 0);
    const rgb = colored ? warm : [235, 240, 237];
    const inputY = 108 + i * 14.9;
    const outIndex = i === count-1 ? 17 : Math.min(16, Math.floor(tone * 17));
    const outputY = 119 + outIndex * 23;
    const nodeX = 169;
    const localX = centerX + sourceX * 60 + (tone-.5) * 67;
    const localY = centerY + sourceY * 43 + drift + (tone-.5) * 75;
    let points = [];
    const segments = 128;
    const shape = [];
    // Smooth contour sampling preserves measured asymmetry without turning the
    // field into a hard polygon stack. Cache it for all five visual strands.
    for (let k = 0; k <= segments; k++) {
      const theta = k / segments * TAU - Math.PI;
      const angle = theta + Math.PI;
      const contour = 1 + (
        radiusAt(profile, angle) * .5 + radiusAt(profile, angle-.13) * .25 +
        radiusAt(profile, angle+.13) * .25 - 1
      ) * .38;
      shape.push({ theta, contour });
    }
    // Four fine parallel strands per actual layer create a twisting ribbon.
    // They share the layer's contour, gain, centroid and organization: they are
    // visual detail, not additional inferred sources or measured channels.
    for (let strand = 4; strand >= 0; strand--) {
      const ribbon = (strand-2) * (1.8 + signal * 1.7);
      const strandPoints = [];
      for (let k = 0; k <= segments; k++) {
        const { theta, contour } = shape[k];
        const angle = theta + ribbon * .0012;
        const radius = layerRadius + ribbon;
        const depth = Math.sin(angle+.35+tone*1.7);
        const sweep = Math.sin(angle*2+tone*.85+.5);
        const curl = Math.cos(angle*3+tone*2.2);
        const material = waveAt(angle * (kind === 'texture' ? 7 : 3) + phase, waveform) * (1.4 + signal * 3);
        const spiral = kind === 'harmonic' ? Math.sin(angle*3+tone*4)*10 : 0;
        const x = localX + Math.cos(angle)*radius*contour + sweep*radius*.17 + depth*27 + spiral;
        const y = localY + Math.sin(angle)*radius*.66*contour + sweep*(34+darkness*20)
          + Math.cos(angle)*(tone-.5)*92 + curl*12 + ribbon*Math.cos(angle*2+tone) + material;
        strandPoints.push([x,y,depth]);
      }
      const visualAlpha = alpha * (strand === 2 ? .77 : .29) * (.68+.32*pulse);
      ctx.beginPath(); ctx.moveTo(strandPoints[0][0],strandPoints[0][1]);
      for (let k = 1; k < strandPoints.length; k++) ctx.lineTo(strandPoints[k][0],strandPoints[k][1]);
      ctx.strokeStyle = `rgba(${rgb.join(',')},${visualAlpha})`;
      ctx.lineWidth = strand === 2 ? .95 : .56; ctx.stroke();
      // Bright near-facing sections make the folded surface legible while
      // far-facing strands recede. Copper is limited to selected inflections.
      ctx.beginPath();
      let drawing = false;
      for (const point of strandPoints) {
        if (point[2] > .10) {
          if (drawing) ctx.lineTo(point[0],point[1]);
          else ctx.moveTo(point[0],point[1]);
          drawing = true;
        } else drawing = false;
      }
      const highlight = colored ? [221,182,146] : [250,250,241];
      ctx.strokeStyle = `rgba(${highlight.join(',')},${alpha*(strand===2?.52:.24)})`;
      ctx.lineWidth = strand === 2 ? 1.12 : .62; ctx.stroke();
      if (strand === 2) points = strandPoints;
    }
    // A single narrow stream links the analysis rail, sculptural contour, and
    // output rail; no all-to-all neural-network metaphor is used.
    const start = points[0], exit = points[Math.floor(segments/2)];
    ctx.beginPath(); ctx.moveTo(nodeX, inputY);
    ctx.bezierCurveTo(300, inputY, 325, start[1], start[0], start[1]);
    ctx.strokeStyle = `rgba(${rgb.join(',')},${alpha * .30})`; ctx.lineWidth = .6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(exit[0],exit[1]);
    ctx.bezierCurveTo(1175, exit[1], 1205, outputY, 1329, outputY);
    ctx.strokeStyle = `rgba(${rgb.join(',')},${alpha * .22})`; ctx.lineWidth = .6; ctx.stroke();
    if (kind === 'pulse') {
      const cursor = points[Math.floor((((t*.08+tone)%1)+1)%1 * segments)];
      ctx.fillStyle = `rgba(222,200,174,${.25+signal*.6})`;
      ctx.beginPath(); ctx.arc(cursor[0], cursor[1], 1.4, 0, TAU); ctx.fill();
    }
    text(ctx, String(layerIndex+1).padStart(2, '0'), 42, inputY+3, '#929b9b', 10);
    line(ctx, 72, inputY, 72+71*signal, inputY, `rgba(209,215,210,${.25+signal*.48})`, .8);
    line(ctx, 72+71*signal, inputY, 158, inputY, '#272d2e', .5);
    ctx.fillStyle = hasData ? `rgba(222,215,200,${.35+signal*.65})` : '#3d4243';
    ctx.beginPath(); ctx.arc(nodeX, inputY, 1.3, 0, TAU); ctx.fill();
  }

  const coreValue = hasData ? `${Math.round(area*100).toString().padStart(2,'0')}%` : '—';
  text(ctx, 'SHADOW AREA', 750, 567, '#929a9a', 9, 'center');
  text(ctx, coreValue, 750, 590, '#c3c6bf', 17, 'center');
  text(ctx, hasData ? (frozen ? 'SAMPLE HELD' : 'FOLLOWING INPUT') : 'AWAITING ANALYSIS', 36, 607, '#b4c0b9', 10);
  text(ctx, `${String(waveform).toUpperCase()} / ${String(kind).toUpperCase()}`, 750, 621, '#8d9797', 9, 'center');
  text(ctx, 'INTERPRETIVE VISUALIZATION', 1464, 607, '#8d9797', 9, 'right');
  ctx.restore();
}
