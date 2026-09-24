// These four chapters are provisional listening experiments, not fixed scores
// prescribed by the Core PDF. All consume the same acquired shadow features.
export const WAVEFORMS = ["sine", "square", "sawtooth", "triangle", "noise"];
export const ORGANIZATIONS = ["sustain", "pulse", "harmonic", "texture"];

export const CHAPTERS = [
  {
    id: "sustain",
    number: "I",
    title: "持続 / Sustain",
    subtitle: "影の濃淡を、連続した音の層へ",
    description: "従来の正弦波を保持。濃淡を連続した対数周波数へ、面積を音量へ、重心を位置へ変換します。",
    material: "正弦波（従来の音）",
    organizationLabel: "連続・持続",
    mapping: "濃淡 → 連続音高 ／ 密度 → 音量 ／ 重心 → 位置",
    waveform: "sine",
    organization: "sustain",
    frequencyMin: 110,
    frequencyMax: 3520,
    pulseRate: 2,
    pulseWidth: 0.18,
    harmonicFundamental: 55,
  },
  {
    id: "pulse",
    number: "II",
    title: "点滅 / Pulse",
    subtitle: "同じ濃淡を、時間差のある出来事へ",
    description: "矩形波を短いパルスに分割。濃淡ごとに発音時刻をずらし、影の層を時間の列として聴きます。",
    material: "矩形波",
    organizationLabel: "周期的なパルス・濃淡順の時間差",
    mapping: "濃淡 → 音高と発音位相 ／ 密度 → パルス音量",
    waveform: "square",
    organization: "pulse",
    frequencyMin: 220,
    frequencyMax: 1760,
    pulseRate: 3,
    pulseWidth: 0.18,
    harmonicFundamental: 55,
  },
  {
    id: "harmonic",
    number: "III",
    title: "倍音 / Harmonic",
    subtitle: "濃淡を、共通の基音を持つ音の関係へ",
    description: "三角波の音高を基音の整数倍へ量子化。濃淡順に水平円周へ配置し、連続した濃淡から倍音の関係を作ります。",
    material: "三角波",
    organizationLabel: "倍音列への量子化・円周配置",
    mapping: "濃淡 → 基音の整数倍と円周位置 ／ 密度 → 音量",
    waveform: "triangle",
    organization: "harmonic",
    frequencyMin: 55,
    frequencyMax: 880,
    pulseRate: 2,
    pulseWidth: 0.18,
    harmonicFundamental: 55,
  },
  {
    id: "texture",
    number: "IV",
    title: "粒子 / Texture",
    subtitle: "音高の層を、帯域と広がりの質感へ",
    description: "帯域を絞ったノイズを重ねます。濃淡を各帯域の中心周波数へ、半影の広さを音像の広がりへ変換します。",
    material: "帯域制限ノイズ",
    organizationLabel: "帯域の重なり・半影による音像拡散",
    mapping: "濃淡 → 帯域中心 ／ 密度 → 音量 ／ 半影 → 広がり",
    waveform: "noise",
    organization: "texture",
    frequencyMin: 800,
    frequencyMax: 8000,
    pulseRate: 2,
    pulseWidth: 0.18,
    harmonicFundamental: 55,
  },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const numberOr = (value, fallback) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function getChapter(id) {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? CHAPTERS[0];
}

export function normalizeSoundSettings(settings = {}) {
  const input = settings ?? {};
  const chapter = getChapter(input.chapterId ?? input.chapter ?? input.id);
  const frequencyMin = clamp(numberOr(input.frequencyMin, chapter.frequencyMin), 20, 15999);
  const frequencyMax = clamp(numberOr(input.frequencyMax, chapter.frequencyMax), frequencyMin + 1, 16000);
  return {
    chapterId: chapter.id,
    waveform: WAVEFORMS.includes(input.waveform) ? input.waveform : chapter.waveform,
    organization: ORGANIZATIONS.includes(input.organization) ? input.organization : chapter.organization,
    frequencyMin,
    frequencyMax,
    pulseRate: clamp(numberOr(input.pulseRate, chapter.pulseRate), 0.25, 16),
    pulseWidth: clamp(numberOr(input.pulseWidth, chapter.pulseWidth), 0.02, 0.9),
    harmonicFundamental: clamp(numberOr(input.harmonicFundamental, chapter.harmonicFundamental), 20, 1000),
  };
}

// Frequencies already follow the chosen logarithmic range in toSources().
// This stage changes organization without changing the acquired features.
export function applyChapter(sources, features, settings = {}) {
  const sound = normalizeSoundSettings(settings);
  const penumbra = clamp(
    numberOr(features?.penumbraWidth, 0) / Math.max(1, numberOr(features?.width, 1)) * 8,
  );
  return sources.map((source, index) => {
    const tone = clamp(numberOr(source.tone, index / Math.max(1, sources.length - 1)));
    const mappedFrequency = sound.frequencyMin * (sound.frequencyMax / sound.frequencyMin) ** tone;
    const next = {
      ...source,
      frequency: clamp(numberOr(source.frequency, mappedFrequency), sound.frequencyMin, sound.frequencyMax),
      waveform: sound.waveform,
      organization: sound.organization,
      pulseRate: sound.pulseRate,
      pulseWidth: sound.pulseWidth,
      // A stable phase in cycles makes pulses independent of rendering FPS.
      phaseOffset: sound.organization === "pulse" ? tone * 0.75 : 0,
    };

    if (sound.organization === "harmonic") {
      const first = Math.ceil(sound.frequencyMin / sound.harmonicFundamental);
      const last = Math.floor(sound.frequencyMax / sound.harmonicFundamental);
      if (first <= last) {
        const partial = clamp(Math.round(next.frequency / sound.harmonicFundamental), first, last);
        next.frequency = partial * sound.harmonicFundamental;
        next.harmonicPartial = partial;
      } else {
        // A narrow custom band may contain no partial of the chosen fundamental.
        // Preserve the explicit band; do not silently alter its boundaries.
        next.harmonicPartial = null;
      }
      const angle = tone * 2 * Math.PI;
      // A provisional 2.5 m listening ring fits inside the 7 m Core room.
      next.x = Math.sin(angle) * 2.5;
      next.y = Math.cos(angle) * 2.5;
      // Retain the Core height mapping and measured amplitude.
    } else if (sound.organization === "texture") {
      const spread = clamp(numberOr(source.spread, 0));
      next.spread = clamp(Math.max(spread, 0.35) + penumbra * 0.45);
      next.x = clamp(numberOr(source.x, 0) * 1.15, -3.5, 3.5);
      next.y = clamp(numberOr(source.y, 0) * 1.15, -3.5, 3.5);
    }
    return next;
  });
}
