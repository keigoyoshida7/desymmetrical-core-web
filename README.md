# De-symmetrical Core · Shadow Study

[Open the Web UI](https://keigoyoshida7.github.io/desymmetrical-core-web/)

A browser instrument for comparing four provisional sound organizations from the same shadow-analysis data. Adapted from [De-symmetrical Adaptation Web](https://github.com/keigoyoshida7/desymmetrical-adaptation-web), guided by De-symmetrical Core EN v22. Artist: Keigo Yoshida.

## Listen and compare

1. Choose the test signal, a camera, or an image/video. Camera frames are processed locally.
2. Click **ブラウザで試聴** to start sound. Sine is the original Adaptation waveform; square, sawtooth, triangle and band-pass noise are also available.
3. Click **解析値を固定して比較** to keep the exact same analyzed frame while switching chapters, waveform or frequency range.
4. Edit each chapter independently. Settings persist locally; export the four settings and current analysis/source data as JSON.

| Provisional chapter | Default material | Organization | Fundamental / center range |
|---|---|---|---|
| I Sustain | Original sine | Continuous tonal layers | 110–3520 Hz |
| II Pulse | Square | Short, phase-offset pulses | 220–1760 Hz |
| III Harmonic | Triangle | Integer harmonics and horizontal ring positions | 55–880 Hz |
| IV Texture | Band-pass noise | Overlapping bands and penumbra-driven spread | 800–8000 Hz |

These are editable study proposals, not a fixed composition prescribed by the PDF. The waveform and organization can be chosen independently. Waveforms with harmonics extend above the selected fundamental range; noise bandwidth extends around the selected center frequency. If a custom harmonic band contains no partial of its chosen fundamental, frequency remains inside that band without quantization. Sound levels are not perceptually loudness-matched across materials; adjust volume when comparing.

## Core mapping

The default analyzer uses **30 real-shadow layers + one validated comparison layer**. Optional 16 / 64 / 256-band modes retain the Adaptation experiments. Darkness maps to lower pitch/height; cell centroid to position, cell area to spread, and penumbra width to reverb. Coordinates assume an editable provisional 7 m room.

Stereo listening is available on ordinary hardware. Discrete mode needs an audio device exposed by the browser with **18 outputs**: wall speakers 1–16, arm speaker 17, sub 18. The arm position is a manual placeholder. The browser's distance-weighted renderer is not IRCAM Spat 5. The sub receives low-frequency sources with a 100 Hz low-pass. Actual room calibration and hardware output assignment require onsite verification.

The large central signal field is an interpretive visualization driven by the current measured layers, sound sources, chapter and waveform. It is not an acoustic measurement or hardware routing meter.

## Scope and integrations

This study uses one browser camera input. The PDF's two synchronized shadow cameras, visitor tracking, robot control, optional vibration output, LLM and physical safety system are not implemented here. StreamDiffusion requires a separately configured endpoint; only selecting that mode sends input images to it. Synthetic/transform demos are clearly labeled.

The original [Max package](https://keigoyoshida7.github.io/desymmetrical-adaptation-web/De-symmetrical-Max.zip) remains a **legacy 12.1-channel sine-only system**. Core's new waveforms and chapters run in the browser; this UI intentionally does not send incompatible Core states to the legacy Max patch. Use exported source/settings data for a future Core Max integration.

## Develop

Requires Node.js 18 or later. No runtime dependencies or build step.

```sh
npm test
npm run dev
```

Open http://127.0.0.1:5174. GitHub Pages serves the repository root. The supplied PDF and private workstation files are not bundled.
