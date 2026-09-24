# De-symmetrical Core · Shadow Study

[Open the Web UI](https://keigoyoshida7.github.io/desymmetrical-core-web/)

A browser instrument for comparing four provisional sound organizations from the same shadow-analysis data. Adapted from [De-symmetrical Adaptation Web](https://github.com/keigoyoshida7/desymmetrical-adaptation-web), guided by De-symmetrical Core EN v22. Artist: Keigo Yoshida.

## Listen and compare

The interface opens in English on first visit. Use **JP / EN** beside the title to switch the interface and usage guide between Japanese and English. The preference is saved on this browser. Switching language keeps the current input, sound, chapter settings and fixed analysis sample. Listening and stop controls sit beside the camera and tone-band controls.

1. Choose the test signal, a camera, or an image/video. Camera frames are processed locally.
2. Click **ブラウザで試聴 / Start audio** to start sound. The waveform choices are **sine wave, band-limited noise, triangle wave**, in that order.
3. Click **解析値を固定して比較 / Freeze analysis to compare** to keep the exact same analyzed frame while switching chapters, waveform or frequency range.
4. Edit each chapter independently. Settings persist locally; export the four settings and current analysis/source data as JSON.

| Provisional chapter | Default material | Organization | Fundamental / center range |
|---|---|---|---|
| I Sustain | Original sine | Continuous tonal layers | 110–3520 Hz |
| II Harmonic | Triangle | Integer harmonics and horizontal ring positions | 55–880 Hz |
| III Texture | Band-pass noise | Overlapping bands and penumbra-driven spread | 800–8000 Hz |
| IV Interference | Sine | Pairs of nearby, continuously sounding frequencies | 110–1760 Hz |

Interference adds a second continuous oscillator around each source frequency. The frequency difference is adjustable from 0.1 to 8 Hz and varies with tone; both frequencies stay within the selected band. Sine/triangle pairs produce natural beating without gating the sound on and off. With noise, two independently filtered bands overlap instead of producing a predictable beat. Switching to the revised chapter order keeps the saved Harmonic and Texture settings and replaces removed options with supported defaults.

These are editable study proposals, not a fixed composition prescribed by the PDF. The waveform and organization can be chosen independently. Waveforms with harmonics extend above the selected fundamental range; noise bandwidth extends around the selected center frequency. If a custom harmonic band contains no partial of its chosen fundamental, frequency remains inside that band without quantization. Sound levels are not perceptually loudness-matched across materials; adjust volume when comparing.

## Core mapping

The default analyzer uses **30 real-shadow layers + one validated comparison layer**. An optional 16-band mode retains the Adaptation experiment. Darkness maps to lower pitch/height; cell centroid to position, cell area to spread, and penumbra width to reverb. Coordinates assume an editable provisional 7 m room.

Stereo listening is available on ordinary hardware. Discrete mode needs an audio device exposed by the browser with **18 outputs**: wall speakers 1–16, arm speaker 17, sub 18. The arm position is a manual placeholder. The browser's distance-weighted renderer is not IRCAM Spat 5. The sub receives low-frequency sources with a 100 Hz low-pass. Actual room calibration and hardware output assignment require onsite verification.

The large central signal field is an interpretive visualization driven by the current measured layers, sound sources, chapter and waveform. It is not an acoustic measurement or hardware routing meter.

## Scope and integrations

This study uses one browser camera input. The PDF's two synchronized shadow cameras, visitor tracking, robot control, optional vibration output, LLM and physical safety system are not implemented here. StreamDiffusion requires a separately configured endpoint; only selecting that mode sends input images to it. Synthetic/transform demos are clearly labeled.

The original [Max package](https://keigoyoshida7.github.io/desymmetrical-adaptation-web/De-symmetrical-Max.zip) remains a **legacy 12.1-channel sine-only system**. Core's new waveforms and chapters run in the browser; this UI intentionally does not send incompatible Core states to the legacy Max patch. Use exported source/settings data for a future Core Max integration.

## Develop

The appended **Spatial study** adds the reference Core installation editor in the same black/silver style, including room/sculpture/arm/light geometry, motion studies, sources, Spat mapping, presets and automation. It follows JP/EN and can optionally follow numerical shadow features from the analysis above. Scene controls remain independent of browser audio. See [spatial-study/README.md](spatial-study/README.md) for provenance, mapping conventions, OSC scope and rebuilding the committed `spatial/` bundle.

Requires Node.js 18 or later. No runtime dependencies or build step.

```sh
npm test
npm run dev
```

Open http://127.0.0.1:5174. GitHub Pages serves the repository root. The supplied PDF and private workstation files are not bundled.
