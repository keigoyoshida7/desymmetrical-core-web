import { SynthCore } from "./synth-core.js";
class ShadowProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.synth = new SynthCore(
      sampleRate,
      options.processorOptions?.channels ?? 2,
    );
    this.port.onmessage = (e) => {
      if (e.data?.type === "state")
        this.synth.update(e.data.sources, e.data.volume, e.data.speakers);
    };
  }
  process(inputs, outputs) {
    this.synth.render(outputs[0], outputs[1]);
    return true;
  }
}
registerProcessor("shadow-layers", ShadowProcessor);
