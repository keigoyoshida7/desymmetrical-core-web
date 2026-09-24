const CORE_OUTPUT_CHANNELS = 18;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const bounded = (value, minimum, maximum, fallback) =>
  Math.min(maximum, Math.max(minimum, finite(value, fallback)));

const audioTimeout = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};
const closeContext = async context => {
  if (context && context.state !== "closed") {
    try { await context.close(); } catch { /* The OS may already have closed it. */ }
  }
};

export class ShadowAudio {
  constructor() {
    this.starting = false;
    this.error = "";
    this.onstatechange = null;
    this.sessionRestore = null;
    this.context = null;
    this.node = null;
    this.volume = 0.2;
    this.mode = "stereo";
    this.epoch = 0;
    this.calibration = [];
    this.calibrationKey = "";
    this.discreteChannels = CORE_OUTPUT_CHANNELS;
  }
  get state() {
    return this.error ? "error" : this.starting ? "starting" : this.context?.state ?? "stopped";
  }
  emitState() { this.onstatechange?.(this.state); }
  requestPlaybackSession() {
    // Supported by Safari; playback audio should behave like media, not ambient UI sounds.
    try {
      const session = globalThis.navigator?.audioSession;
      if (!session) return;
      const type = session.type;
      session.type = "playback";
      this.sessionRestore = { session, type };
    } catch { /* AudioSession is optional and may be restricted by the host app. */ }
  }
  restoreSession() {
    const prior = this.sessionRestore;
    this.sessionRestore = null;
    try { if (prior?.session.type === "playback") prior.session.type = prior.type; } catch {}
  }
  async start(mode = "stereo") {
    // Do not await close() before creating/resuming: both must run inside the tap.
    const closing = this.stop();
    const epoch = ++this.epoch;
    let context;
    this.starting = true;
    this.mode = mode;
    this.emitState();
    try {
      this.requestPlaybackSession();
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw Error("このブラウザは音声再生に対応していません。SafariまたはChromeで開いてください。");
      context = new AudioContextClass({ latencyHint: "interactive" });
      this.context = context;
      context.onstatechange = () => { if (this.context === context) this.emitState(); };
      const resumed = audioTimeout(context.resume(), 8000, "音声の開始が保留されています。もう一度再生ボタンを押してください。");
      // Observe rejection immediately even if capability checks below fail synchronously.
      resumed.catch(() => {});
      if (!context.audioWorklet || !globalThis.AudioWorkletNode)
        throw Error("このブラウザは音声処理に対応していません。SafariまたはChromeで開いてください。");
      const channels = mode === "discrete"
        ? Math.round(bounded(this.discreteChannels, 2, 32, CORE_OUTPUT_CHANNELS))
        : 2;
      if (channels > context.destination.maxChannelCount)
        throw Error(
          `この出力は${context.destination.maxChannelCount}chまでです。Core 17.1chには18出力対応の機器・ブラウザ設定が必要です。ステレオ試聴も選べます。`,
        );
      await Promise.all([
        closing,
        resumed,
        audioTimeout(context.audioWorklet.addModule(
          new URL("./audio-worklet.js?v=mobile-audio-1", import.meta.url),
        ), 15000, "音声の読み込みが完了しませんでした。ページを再読み込みしてください。"),
      ]);
      if (epoch !== this.epoch) {
        throw Error("音の開始を取り消しました。");
      }
      if (mode === "discrete") {
        context.destination.channelCount = channels;
        context.destination.channelCountMode = "explicit";
        context.destination.channelInterpretation = "discrete";
      }
      const node = new AudioWorkletNode(context, "shadow-layers", {
        numberOfInputs: 0,
        numberOfOutputs: 2,
        outputChannelCount: [channels, 2],
        processorOptions: { channels },
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });
      this.node = node;
      node.onprocessorerror = () => {
        if (this.node !== node) return;
        this.error = "音声処理が中断されました。再生ボタンで再試行してください。";
        this.restoreSession();
        this.emitState();
        void closeContext(context);
      };
      const reverb = context.createConvolver(),
        length = Math.floor(context.sampleRate * 2.8),
        buffer = context.createBuffer(2, length, context.sampleRate);
      let seed = 67;
      for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          data[i] =
            ((seed / 4294967296) * 2 - 1) *
            Math.exp((-i / context.sampleRate) * 2.5) *
            0.22;
        }
      }
      reverb.buffer = buffer;
      node.connect(reverb, 1);
      if (channels === 2) {
        node.connect(context.destination, 0);
        reverb.connect(context.destination);
      } else {
        const split = context.createChannelSplitter(channels),
          wet = context.createChannelSplitter(2),
          merge = context.createChannelMerger(channels);
        node.connect(split, 0);
        reverb.connect(wet);
        const curve = new Float32Array(4096);
        for (let i = 0; i < curve.length; i++)
          curve[i] = Math.tanh((i / (curve.length - 1)) * 2 - 1);
        this.calibration = [];
        for (let i = 0; i < channels; i++) {
          const gain = context.createGain(),
            delay = context.createDelay(1),
            limiter = context.createWaveShaper();
          limiter.curve = curve;
          split.connect(gain, i);
          if (i < channels - 1) {
            const diffuse = context.createGain();
            diffuse.gain.value = 1 / Math.sqrt((channels - 1) / 2);
            wet.connect(diffuse, i % 2);
            diffuse.connect(gain);
          }
          const filters = Array.from({ length: 4 }, () => {
            const f = context.createBiquadFilter();
            f.type = "peaking";
            f.gain.value = 0;
            return f;
          });
          gain.connect(delay);
          let tail = delay;
          if (i === channels - 1) {
            // Every selected waveform, including overtone-rich shapes and
            // noise, reaches the sub only through a fourth-order low-pass.
            for (let stage = 0; stage < 2; stage++) {
              const lowpass = context.createBiquadFilter();
              lowpass.type = "lowpass";
              lowpass.frequency.value = 100;
              lowpass.Q.value = stage === 0 ? 0.5411961 : 1.306563;
              tail.connect(lowpass);
              tail = lowpass;
            }
          }
          for (const f of filters) {
            tail.connect(f);
            tail = f;
          }
          tail.connect(limiter);
          limiter.connect(merge, 0, i);
          this.calibration.push({ gain, delay, filters });
        }
        merge.connect(context.destination);
      }
      this.starting = false;
      this.emitState();
    } catch (e) {
      if (context) context.onstatechange = null;
      if (epoch === this.epoch) {
        this.context = null;
        this.node = null;
        this.starting = false;
        this.error = e.message;
        this.restoreSession();
        this.emitState();
      }
      await closeContext(context);
      throw e;
    }
  }
  async resume() {
    const context = this.context, epoch = this.epoch;
    if (!context || !this.node || this.error) return this.start(this.mode);
    try {
      // Called directly from the user's next tap after an iOS interruption.
      const resumed = context.resume();
      await audioTimeout(resumed, 8000, "音声を再開できません。再生ボタンで再試行してください。");
      if (this.context !== context || epoch !== this.epoch) throw Error("音の開始を取り消しました。");
      this.emitState();
    } catch (e) {
      if (this.context === context && epoch === this.epoch) {
        this.error = e.message;
        this.restoreSession();
        this.emitState();
        await closeContext(context);
      }
      throw e;
    }
  }
  update(sources, speakers) {
    this.node?.port.postMessage({
      type: "state",
      sources,
      volume: this.volume,
      speakers,
    });
    if (this.mode === "discrete" && this.context) {
      const key = JSON.stringify(speakers);
      if (key !== this.calibrationKey) {
        this.calibrationKey = key;
        this.calibration.forEach((c, i) => {
          const s = speakers[i];
          if (!s) return;
          const t = this.context.currentTime;
          c.gain.gain.setTargetAtTime(
            10 ** (bounded(s.gainDb, -60, 12, 0) / 20) * (s.polarity === -1 ? -1 : 1),
            t,
            0.04,
          );
          c.delay.delayTime.setTargetAtTime(bounded(s.delayMs, 0, 1000, 0) / 1000, t, 0.04);
          c.filters.forEach((f, j) => {
            const eq = s.eq?.[j];
            f.frequency.value = bounded(eq?.frequency, 20, this.context.sampleRate * 0.45, 1000);
            f.Q.value = bounded(eq?.q, 0.1, 20, 1);
            f.gain.value = bounded(eq?.gainDb, -24, 24, 0);
          });
        });
      }
    }
  }
  async stop() {
    this.epoch++;
    const context = this.context, node = this.node;
    if (context) context.onstatechange = null;
    if (node) { node.onprocessorerror = null; try { node.disconnect(); } catch {} }
    this.starting = false;
    this.error = "";
    this.context = null;
    this.node = null;
    this.calibration = [];
    this.calibrationKey = "";
    this.restoreSession();
    this.emitState();
    await closeContext(context);
  }
}
