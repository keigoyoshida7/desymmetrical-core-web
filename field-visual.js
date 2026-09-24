// A tonal topography of the acquired shadow, alongside its sound mapping.
// Envelopes come from the analyzer's cumulative convex cells; the ground trace
// is the actual threshold boundary. This is not a waveform or a speaker meter.
const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
const ink = '#d5d8d3';
const muted = '#858d8e';
const text = (ctx, label, x, y, size = 12, color = muted, align = 'left') => {
  ctx.font = `${size}px ${mono}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(label, x, y);
};
function line(ctx, x1, y1, x2, y2, color = '#2c3335', width = .8) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function path(ctx, points) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
}
function dot(ctx, x, y, radius, color) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fillStyle = color; ctx.fill();
}
const hz = v => v >= 1000 ? `${+(v / 1000).toFixed(2)}k` : `${+v.toFixed(1)}`;

// Pure mapping shared by the drawing and regression checks. No phase animation
// is added: frozen acquisition and unchanged settings produce a stable image.
export function buildFieldStudy(features, sources = [], settings = {}) {
  const lo = Math.max(20, Number(settings.frequencyMin) || 110);
  const hi = Math.max(lo + 1, Number(settings.frequencyMax) || 3520);
  const position = f => clamp(Math.log(Math.max(lo, f) / lo) / Math.log(hi / lo));
  const byId = new Map(sources.map(s => [s.id, s]));
  const layers = (features?.layers ?? []).map(layer => {
    const source = byId.get(layer.id);
    const frequency = source?.frequency ?? lo * (hi / lo) ** layer.tone;
    const separation = source?.detuneHz ?? 0;
    return {
      id: layer.id, tone: layer.tone, polygon: layer.cell?.polygon ?? [],
      density: layer.density, gain: source?.gain ?? 0,
      spread: source?.spread ?? 0, partial: source?.harmonicPartial ?? null,
      frequency, height: position(frequency),
      pair: [frequency - separation / 2, frequency + separation / 2],
      separation,
    };
  });
  return { layers, lo, hi, position, comparison: sources.some(s => s.id === 257 && s.gain > 0) };
}

function drawStrata(ctx, model, features, kind, box, mobile, ja) {
  const { x, y, w, h } = box;
  const font = mobile ? 19 : 12;
  const cx = x + w * .50, baseY = y + h * .79;
  const span = w * .71, rise = h * .53;
  const project = (p, height = 0, offset = 0) => [
    cx + (p[0] - .5) * span + (p[1] - .5) * span * .31,
    baseY + (p[1] - .5) * h * .30 - (p[0] - .5) * h * .12 - height * rise + offset,
  ];
  const guide = [[.03,.04],[.97,.04],[.97,.96],[.03,.96]];
  const floor = guide.map(p => project(p));
  path(ctx, floor); ctx.strokeStyle = '#202729'; ctx.lineWidth = .8; ctx.stroke();
  for (const p of [[.03,.04],[.97,.04],[.97,.96],[.03,.96],[.5,.5]]) {
    const [px, py] = project(p);
    line(ctx, px-4, py, px+4, py, '#4a5051');
    line(ctx, px, py-4, px, py+4, '#4a5051');
  }

  // The literal threshold boundary anchors the elevated tonal envelopes.
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of features?.contours ?? []) {
    ctx.moveTo(...project([x1,y1])); ctx.lineTo(...project([x2,y2]));
  }
  ctx.strokeStyle = '#78827d'; ctx.lineWidth = mobile ? 1.4 : .9; ctx.stroke();
  const boundaryLabel = project([.06,1.06]);
  text(ctx, ja ? '入力の影 / 境界線' : 'INPUT SHADOW / BOUNDARY', boundaryLabel[0], boundaryLabel[1]+font, font-1, '#89958d');

  // One real analyzer envelope per layer. Small edge echoes convey spatial
  // spread or paired tones schematically, without inventing additional layers.
  const strongest = Math.max(.00001, ...model.layers.map(l => l.gain));
  const active = model.layers.filter(l => l.polygon.length > 2 && l.density > 0);
  for (const layer of active) {
    const weight = Math.sqrt(clamp(layer.gain / strongest));
    const height = layer.height;
    const points = layer.polygon.map(p => project(p, height));
    const alpha = .18 + weight * .60;
    path(ctx, points);
    const wash = ctx.createLinearGradient(0, baseY-rise, 0, baseY);
    wash.addColorStop(0, `rgba(202,215,215,${.010 + weight*.018})`);
    wash.addColorStop(1, 'rgba(178,194,190,.003)');
    ctx.fillStyle = wash; ctx.fill();

    if (kind === 'texture') {
      const center = points.reduce((a,p) => [a[0]+p[0]/points.length,a[1]+p[1]/points.length], [0,0]);
      for (let echo = 1; echo <= 5; echo++) {
        const scale = 1 + echo * (.009 + layer.spread * .014);
        path(ctx, points.map(p => [center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale]));
        ctx.strokeStyle = `rgba(208,219,214,${alpha*(.12-echo*.014)})`;
        ctx.lineWidth = 1; ctx.stroke();
      }
    }
    if (kind === 'interference') {
      const gap = 2.0 + Math.min(8, layer.separation) * .48;
      for (const offset of [-gap/2, gap/2]) {
        path(ctx, layer.polygon.map(p => project(p, height, offset)));
        ctx.strokeStyle = `rgba(${offset < 0 ? '232,232,218' : '151,174,185'},${alpha*.83})`;
        ctx.lineWidth = mobile ? 1.4 : .85; ctx.stroke();
      }
    } else {
      path(ctx, points);
      ctx.strokeStyle = `rgba(218,228,223,${alpha})`;
      ctx.lineWidth = mobile ? 1.5 : .85; ctx.stroke();
      // A restrained highlight on the near edge makes the stack read in depth.
      ctx.beginPath();
      for (let i=0; i<points.length; i++) {
        const next = (i+1) % points.length;
        if (layer.polygon[i][1] < .5 && layer.polygon[next][1] < .5) continue;
        ctx.moveTo(...points[i]); ctx.lineTo(...points[next]);
      }
      ctx.strokeStyle = `rgba(243,239,222,${alpha*.40})`; ctx.lineWidth = 1.1; ctx.stroke();
    }
  }

  // A slim elevation ruler names the mapping, replacing fictitious I/O wires.
  const axisX = x + w * .055;
  line(ctx, axisX, baseY, axisX, baseY-rise, '#424a4b');
  for (const [height, label] of [[0,hz(model.lo)], [.5,hz(Math.sqrt(model.lo*model.hi))], [1,hz(model.hi)]]) {
    const py = baseY-height*rise;
    line(ctx, axisX-3, py, axisX+5, py, '#737c7b');
    text(ctx, label, axisX+12, py+4, font-1, '#9aaba6');
  }
  text(ctx, 'Hz', axisX, baseY-rise-18, font-1, '#9aaba6');
  text(ctx, ja ? '階調の包絡線' : 'TONAL ENVELOPES', x+20, y+27, font, ink);
  text(ctx, ja ? '影の形を保ち、周波数に沿って積層' : 'SHADOW GEOMETRY / FREQUENCY ELEVATION', x+20, y+50, font-2);
  if (!active.length) text(ctx, ja ? '影の入力を待機' : 'WAITING FOR SHADOW', cx, y+h*.44, font+1, muted, 'center');
}

function drawScore(ctx, model, kind, waveform, box, mobile, ja) {
  const { x, y, w, h } = box;
  const font = mobile ? 19 : 12;
  const left = x + (mobile ? 48 : 28), right = x+w-15;
  const top = y+108, bottom = y+h-62;
  const px = f => left + model.position(f)*(right-left);
  text(ctx, ja ? '音への対応' : 'LISTENING MAP', x, y+27, font, ink);
  const subtitles = {
    sustain: waveform==='noise' ? (ja?'連続した帯域中心':'CONTINUOUS BAND CENTERS') : (ja?'連続した音高':'CONTINUOUS PITCH'),
    harmonic: ja ? '基音の整数倍への配置' : 'HARMONIC RELATIONSHIPS',
    texture: waveform==='noise' ? (ja?'帯域中心と空間的な広がり':'BAND CENTERS & SPATIAL DIFFUSION') : (ja?'音高と空間的な広がり':'PITCH & SPATIAL DIFFUSION'),
    interference: ja ? '近接する2つの周波数' : 'PAIRS OF NEARBY FREQUENCIES',
  };
  text(ctx, subtitles[kind] ?? subtitles.sustain, x, y+50, font-2);
  for (const value of [model.lo,Math.sqrt(model.lo*model.hi),model.hi]) {
    const xp = px(value);
    line(ctx,xp,top-16,xp,bottom+9,'#242c2e');
    text(ctx,hz(value),xp,top-28,font-1,'#909c99',value===model.lo?'left':value===model.hi?'right':'center');
  }
  const max = Math.max(.00001,...model.layers.map(l=>l.gain));
  for (let i=0;i<model.layers.length;i++) {
    const layer=model.layers[i], row=bottom-i/Math.max(1,model.layers.length-1)*(bottom-top);
    const xp=px(layer.frequency), strength=Math.sqrt(clamp(layer.gain/max));
    const alpha=layer.density>0 ? .25+strength*.65 : .10;
    // The rows preserve the identity of the 16/30 measured tone bins.
    line(ctx,left,row,right,row,'rgba(157,174,170,.045)');
    if (i===0 || i===model.layers.length-1 || (i+1)%5===0)
      text(ctx,String(layer.id).padStart(2,'0'),left-14,row+4,font-2,'#697673','right');
    if (layer.density<=0) continue;
    if (kind==='texture') {
      // Vertical softness encodes spatial spread, not spectral bandwidth.
      const halo=ctx.createRadialGradient(xp,row,0,xp,row,4+layer.spread*9);
      halo.addColorStop(0,`rgba(210,221,216,${alpha*.4})`); halo.addColorStop(1,'rgba(210,221,216,0)');
      ctx.fillStyle=halo; ctx.fillRect(xp-14,row-14,28,28);
    }
    if (kind==='interference') {
      const a=px(layer.pair[0]),b=px(layer.pair[1]);
      line(ctx,a,row,b,row,`rgba(210,224,219,${alpha})`,1);
      dot(ctx,a,row,1.9,`rgba(235,231,216,${alpha})`);
      dot(ctx,b,row,1.9,`rgba(148,177,192,${alpha})`);
    } else {
      line(ctx,xp,row-2-strength*1.5,xp,row+2+strength*1.5,`rgba(229,235,227,${alpha})`,mobile?2:1.4);
    }
    if (kind==='harmonic' && layer.partial && (i===0 || i===model.layers.length-1 || (i+1)%5===0))
      text(ctx,`×${layer.partial}`,Math.min(right-24,xp+9),row+4,font-3,'#a8b4aa');
  }
  text(ctx,ja?'基音 / 帯域中心 · Hz':'FUNDAMENTAL / BAND CENTER · Hz',x,y+h-19,font-2,'#929d98');
  const explanation={
    sustain:ja?'線の強さ：各階調の音量':'Line strength: mapped layer level',
    harmonic:ja?'同じ周波数を共有する階調は縦に整列':'Layers align at shared frequencies',
    texture:ja?'にじみ：空間的な広がりの模式表示':'Softness: schematic spatial spread',
    interference:ja?'積層の二重線は間隔を拡大して表示':'Envelope pairs: separation enlarged',
  };
  text(ctx,explanation[kind]??explanation.sustain,x,y+h+9,font-2,'#788783');
}

export function renderSignalField(canvas, {features=null,sources=[],settings={},language='en',frozen=false,running=true}={}) {
  if (!canvas?.getContext) return;
  const ctx=canvas.getContext('2d'); if(!ctx)return;
  const cssWidth=canvas.clientWidth || 1500;
  const mobile=cssWidth<650;
  const width=mobile?720:1500, height=mobile?1080:680;
  const ratio=Math.min(2,globalThis.devicePixelRatio || 1);
  const bufferWidth=Math.round(cssWidth*ratio),bufferHeight=Math.round(bufferWidth*height/width);
  if(canvas.width!==bufferWidth || canvas.height!==bufferHeight){canvas.width=bufferWidth;canvas.height=bufferHeight;}
  ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#070809';ctx.fillRect(0,0,width,height);
  const model=buildFieldStudy(features,sources,settings);
  const kind=settings.organization || 'sustain',ja=language==='ja',font=mobile?19:12;
  if(mobile){
    drawStrata(ctx,model,features,kind,{x:0,y:8,w:720,h:610},true,ja);
    line(ctx,24,636,696,636,'#303839');
    drawScore(ctx,model,kind,settings.waveform,{x:30,y:661,w:650,h:300},true,ja);
  }else{
    drawStrata(ctx,model,features,kind,{x:0,y:12,w:1000,h:605},false,ja);
    line(ctx,1018,40,1018,564,'#303839');
    drawScore(ctx,model,kind,settings.waveform,{x:1060,y:12,w:404,h:545},false,ja);
  }
  const y=height-32;
  const state=frozen?(ja?'固定した影':'SAMPLE HELD'):running?(ja?'入力に追従':'FOLLOWING INPUT'):(ja?'停止中':'STOPPED');
  text(ctx,state, mobile?30:20,y,font-1,'#acb8b1');
  const area=features?`${(features.area*100).toFixed(1)}%`:'—';
  text(ctx,`${ja?'影の面積':'SHADOW AREA'} ${area}`,width/2,y,font-1,'#acb8b1','center');
  text(ctx,model.comparison?(ja?'比較音あり':'COMPARISON VOICE ON'):(ja?'音への変換を可視化':'MAPPING STUDY'),width-(mobile?30:36),y,font-2,muted,'right');
}
