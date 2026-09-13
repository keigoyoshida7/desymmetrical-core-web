export class ShadowAudio {
  constructor() {
    this.context = null;
    this.node = null;
    this.volume = 0.2;
    this.mode = "stereo";
    this.epoch = 0;
    this.calibration = [];
    this.calibrationKey = "";
  }
  async start(mode = "stereo") {
    await this.stop();
    const epoch = ++this.epoch,
      context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;
    try {
      await context.resume();
      const channels = mode === "discrete" ? 13 : 2;
      if (channels > context.destination.maxChannelCount)
        throw Error(
          `この出力は${context.destination.maxChannelCount}chまでです。12.1chには13出力の機器が必要です。`,
        );
      await context.audioWorklet.addModule(
        new URL("./audio-worklet.js", import.meta.url),
      );
      if (epoch !== this.epoch) {
        if (context.state !== "closed") await context.close();
        throw Error("音の開始を取り消しました。");
      }
      if (channels === 13) {
        context.destination.channelCount = 13;
        context.destination.channelCountMode = "explicit";
        context.destination.channelInterpretation = "discrete";
      }
      const node = new AudioWorkletNode(context, "shadow-layers", {
        numberOfInputs: 0,
        numberOfOutputs: 2,
        outputChannelCount: [channels, 2],
        processorOptions: { channels },
      });
      this.node = node;
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
        const split = context.createChannelSplitter(13),
          wet = context.createChannelSplitter(2),
          merge = context.createChannelMerger(13);
        node.connect(split, 0);
        reverb.connect(wet);
        const curve = new Float32Array(4096);
        for (let i = 0; i < curve.length; i++)
          curve[i] = Math.tanh((i / (curve.length - 1)) * 2 - 1);
        this.calibration = [];
        for (let i = 0; i < 13; i++) {
          const gain = context.createGain(),
            delay = context.createDelay(1),
            limiter = context.createWaveShaper();
          limiter.curve = curve;
          split.connect(gain, i);
          if (i < 12) {
            const diffuse = context.createGain();
            diffuse.gain.value = 1 / Math.sqrt(6);
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
      this.mode = mode;
    } catch (e) {
      if (context.state !== "closed") await context.close();
      if (this.context === context) {
        this.context = null;
        this.node = null;
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
            10 ** (s.gainDb / 20) * s.polarity,
            t,
            0.04,
          );
          c.delay.delayTime.setTargetAtTime(s.delayMs / 1000, t, 0.04);
          c.filters.forEach((f, j) => {
            const eq = s.eq?.[j];
            f.frequency.value = eq?.frequency ?? 1000;
            f.Q.value = eq?.q ?? 1;
            f.gain.value = eq?.gainDb ?? 0;
          });
        });
      }
    }
  }
  async stop() {
    this.epoch++;
    const context = this.context;
    this.context = null;
    this.node = null;
    this.calibration = [];
    this.calibrationKey = "";
    if (context && context.state !== "closed") await context.close();
  }
}
