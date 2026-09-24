import {
  analyze,
  toSources,
  compareFeatures,
  ComparisonValidator,
  summarize,
  testFrame,
  clamp,
} from "./analysis.js";
import { ShadowAudio } from "./audio.js?v=mobile-audio-1";
import { CHAPTERS, getChapter, normalizeSoundSettings, applyChapter } from "./chapters.js";
import { renderSignalField } from "./field-visual.js";
import { createCoreSpeakers } from "./core-layout.js";
import { migrateStudy } from "./study-state.js";
import { tr as t, getLanguage, onLanguageChange } from "./i18n.js";
import { initSpatialIntegration } from "./spatial-integration.js";
const $ = (id) => document.getElementById(id),
  canvases = ["live", "analysis", "generated", "spatial"].map($),
  contexts = canvases.map((c) =>
    c.getContext("2d", { willReadFrequently: true }),
  ),
  video = $("video"),
  scratch = document.createElement("canvas"),
  sc = scratch.getContext("2d", { willReadFrequently: true }),
  audio = new ShadowAudio(),
  validator = new ComparisonValidator();
let stream = null,
  imageSource = null,
  fileURL = null,
  source = "demo",
  running = true,
  frameNumber = 0,
  view = "bands",
  background = null,
  backgroundId = null,
  features = null,
  comparison = null,
  sources = [],
  previousSources = [],
  lastFrame = 0,
  lastLog = 0,
  lastGeneration = 0,
  generationBusy = false,
  generationEpoch = 0,
  generationAbort = null,
  socket = null,
  lastBridge = 0,
  frameToken = 0,
  lastSourceTime = -1,
  db = null,
  records = [];
const speakers = createCoreSpeakers();
let chapterId = "sustain", chapterSettings = {}, frozenStudy = null, currentSourceId = "", lastVisual = 0;
const WAVE_LABELS = {sine:"sin波",noise:"帯域ノイズ",triangle:"三角波"};
const WAVE_LABELS_EN = { sine: "Sine wave", noise: "Band-limited noise", triangle: "Triangle wave" };
const CHAPTER_LABELS = {
  sustain: { title: ["持続", "Sustain"], organization: ["連続・持続", "Continuous, sustained tones"], mapping: ["濃淡 → 連続音高 ／ 密度 → 音量 ／ 重心 → 位置", "Tone → continuous pitch / Density → level / Centroid → position"] },
  harmonic: { title: ["倍音", "Harmonic"], organization: ["倍音列への量子化・円周配置", "Harmonic quantization, circular positioning"], mapping: ["濃淡 → 基音の整数倍と円周位置 ／ 密度 → 音量", "Tone → harmonic partial and circle position / Density → level"] },
  texture: { title: ["粒子", "Texture"], organization: ["帯域の重なり・半影による音像拡散", "Overlapping bands, penumbra-driven diffusion"], mapping: ["濃淡 → 帯域中心 ／ 密度 → 音量 ／ 半影 → 広がり", "Tone → band center / Density → level / Penumbra → spread"] },
  interference: { title: ["干渉", "Interference"], organization: ["近接周波数の持続・干渉", "Sustained adjacent frequencies, interference"], mapping: ["濃淡 → 中心周波数と周波数差 ／ 密度 → 音量 ／ 重心 → 位置", "Tone → center frequency and frequency difference / Density → level / Centroid → position"] },
};
const waveLabel = (waveform) => t(WAVE_LABELS[waveform] || waveform, WAVE_LABELS_EN[waveform] || waveform);
const chapterLabel = (id, field = "title") => t(...CHAPTER_LABELS[getChapter(id).id][field]);
const MESSAGES = {
  "解析値を固定して比較": "Freeze analysis to compare",
  "LIVE · 入力に追従": "LIVE · Following input",
  "解析値が届いてから固定してください。": "Wait for analysis data before freezing it.",
  "ライブ入力に戻す": "Return to live input",
  "同一条件の解析を待機": "Waiting for analysis under matching conditions",
  "比較像は未接続": "No comparison image connected",
  "比較を準備中": "Preparing comparison",
  "明るい基準を取得": "Capture bright reference",
  "Mac の標準カメラ": "Default Mac camera",
  "カメラを利用できません。HTTPS または localhost で開いてください。": "Camera unavailable. Open this page over HTTPS or localhost.",
  "カメラ入力": "Camera input",
  "カメラ切断 · 音を停止": "Camera disconnected · Audio stopped",
  "カメラが切断されました。再接続してください。": "The camera was disconnected. Please reconnect it.",
  "明るい面だけを映して基準を取得し、その範囲に影を入れてください。カメラ映像は保存しません。": "Capture a reference with only a bright surface in view, then introduce a shadow into that area. Camera footage is not saved.",
  "カメラが許可されていません。ブラウザとMacの設定で許可してから再接続してください。": "Camera access is not allowed. Enable it in your browser and Mac settings, then reconnect.",
  "カメラが見つかりません。": "No camera found.",
  "カメラを開けません。他のアプリで使用中か確認してください。": "The camera could not be opened. Check whether another app is using it.",
  "選択したカメラを利用できません。別の入力を選んでください。": "The selected camera is unavailable. Choose another input.",
  "カメラ未接続": "Camera disconnected",
  "テスト信号": "Test signal",
  "合成した階調信号 · 実測ではありません": "Synthetic tonal signal · Not measured data",
  "合成したテスト信号を解析しています。実測にはカメラ入力へ切り替えてください。": "Analyzing a synthetic test signal. Switch to camera input for measured data.",
  "画像は data:image または blob 形式が必要です。": "The image must use a data:image or blob URL.",
  "比較像を接続すると、差分が音に加わります。": "Connect a comparison image to add its difference to the sound.",
  "変形テスト · AI未使用": "Transform test · No AI",
  "生成サービスの URL を設定してください": "Set the generation service URL",
  "生成サービスにはHTTPSを使用してください。": "Use HTTPS for the generation service.",
  "生成元に StreamDiffusion の識別がありません。": "The generation source is not identified as StreamDiffusion.",
  "StreamDiffusion · 外部接続": "StreamDiffusion · External connection",
  "由来が一致しません": "Source provenance does not match",
  "比較画像が古いか時刻が無効です": "Comparison image is stale or its timestamp is invalid",
  "比較値が範囲外です": "Comparison value is out of range",
  "比較を採用": "Comparison accepted",
  "比較を保留 · 実像の解析は継続": "Comparison on hold · Input analysis continues",
  "由来を保ちながら、比較像の変化を少し広げる。": "Preserve the source relationship while slightly increasing variation in the comparison image.",
  "比較像と実像の距離を少し縮める。": "Slightly reduce the difference between the comparison image and the input.",
  "現在の関係を保ち、影の変化を観測する。": "Hold the current relationship and observe changes in the shadow.",
  "比較が古いため保留": "Comparison on hold because it is stale",
  "停止": "Stopped",
  "配置": "Position",
  "極性": "Polarity",
  "後壁": "Rear wall",
  "前壁": "Front wall",
  "右壁": "Right wall",
  "左壁": "Left wall",
  "アーム（仮）": "Arm (provisional)",
  "校正値が範囲外です。": "Calibration value is out of range.",
  "編集した校正値。会場での測定・確認は未完了です。": "Edited calibration values. Venue measurement and verification are still pending.",
  "18chの校正データが必要です。": "Calibration data for 18 channels is required.",
  "校正値の形式が無効です。": "Invalid calibration data format.",
  "EQは最大4バンド、20–20000Hz、Q 0.1–20、±12dBです。": "EQ allows up to 4 bands: 20–20000 Hz, Q 0.1–20, and ±12 dB.",
  "画像または動画を選択してください。": "Select an image or video.",
  "ファイル入力": "File input",
  "読み込んだファイルをこの端末で解析しています。": "Analyzing the loaded file on this device.",
  "基準が暗すぎます。影のない明るい面で取得してください。": "The reference is too dark. Capture a bright surface without a shadow.",
  "基準を再取得": "Recapture reference",
  "明るい基準を取得しました。影を入れて観測してください。": "Bright reference captured. Introduce a shadow to observe it.",
  "解析と音響の設定を初期値に戻しました。": "Analysis and audio settings have been reset to defaults.",
  "音声出力モード": "Audio output mode",
  "音の開始を取り消しました。": "Audio start was cancelled.",
  "ステレオ試聴": "Stereo monitor",
  "17.1ch 直接出力": "17.1ch direct output",
  "ブラウザで試聴": "Start audio",
  "音響停止": "Audio stopped",
  "音の準備中…": "Preparing audio…",
  "音を準備しています…": "Preparing audio…",
  "音を再開": "Resume audio",
  "音を再試行": "Retry audio",
  "音声が一時停止中 · 再開してください": "Audio paused · Tap Resume audio",
  "音声エラー · 再試行できます": "Audio error · Tap Retry audio",
  "このブラウザは音声再生に対応していません。SafariまたはChromeで開いてください。": "Audio playback is unavailable here. Open this page in Safari or Chrome.",
  "このブラウザは音声処理に対応していません。SafariまたはChromeで開いてください。": "Audio processing is unavailable here. Open this page in Safari or Chrome.",
  "音声の開始が保留されています。もう一度再生ボタンを押してください。": "Audio start is pending. Tap the audio button again.",
  "音声の読み込みが完了しませんでした。ページを再読み込みしてください。": "Audio could not finish loading. Reload this page.",
  "音声処理が中断されました。再生ボタンで再試行してください。": "Audio processing was interrupted. Tap the audio button to retry.",
  "音声を再開できません。再生ボタンで再試行してください。": "Audio could not resume. Tap the audio button to retry.",

  "動画を選び直して再開してください。": "Select the video again to resume.",
  "音をミュート": "Mute audio",
  "17.1ch · ブラウザ直接出力": "17.1ch · Browser direct output",
  "STEREO MONITOR · 再生中": "STEREO MONITOR · Playing",
  "18chへ出力中。ブラウザの距離重み付けレンダラーです。会場用Spat5のレンダリングとは異なります。": "Outputting 18 channels with the browser's distance-weighted renderer. This differs from the venue's Spat5 rendering.",
  "影の階調ごとの音が鳴っています。停止ボタンでカメラと音を停止できます。": "Each shadow tone layer is sounding. Use Stop to stop the camera and audio.",
  "停止中": "Stopped",
  "カメラ・解析・音・外部送信を停止しました。入力を選択すると再開します。": "Camera, analysis, audio, and external transmission have stopped. Select an input to resume.",
  "従来のMaxパッチは12.1ch・sin波専用です。Coreの波形と4章はブラウザで試聴してください。接続仕様に現在の対応範囲を記載しています。": "The legacy Max patch supports 12.1ch sine waves only. Listen to Core's waveforms and four chapters in the browser. See the connection specification for current support.",
  "ws:// または wss:// を指定してください。": "Specify a ws:// or wss:// URL.",
  "接続中": "Connecting",
  "接続済み · Max応答待ち": "Connected · Waiting for Max",
  "Max接続を解除": "Disconnect Max",
  "Maxから応答なし · パッチを開いてください": "No response from Max · Open the patch",
  "無音": "Silent",
  "Max受信を確認": "Max reception confirmed",
  "Max応答あり · このUIの入力待ち": "Max responding · Waiting for input from this UI",
  "未接続": "Disconnected",
  "Maxへ接続": "Connect to Max",
  "Max未接続": "Max disconnected",
  "接続できません · Maxの①で起動し、このMacの接続用UIを開いてください": "Connection failed · Start step 1 in Max and open the connection UI on this Mac",
  "Max応答が途切れました": "Max stopped responding",
  "この端末の観測記録を消去しました。": "Observation records on this device have been cleared.",
  "読み込んだ測定値を使用。測定の妥当性は会場で確認してください。": "Using imported measurements. Verify their validity at the venue.",
  "校正値を読み込みました。未測定チャンネルが含まれます。": "Calibration imported. Some channels are unmeasured.",
  "記録の保存領域を利用できません。この画面を開いている間の記録は書き出せます。": "Record storage is unavailable. You can export records collected while this page remains open.",
};
function localize(message) {
  const text = String(message);
  if (getLanguage() === "ja") return text;
  if (Object.hasOwn(MESSAGES, text)) return MESSAGES[text];
  let match;
  if ((match = text.match(/^カメラ (\d+)$/))) return `Camera ${match[1]}`;
  if ((match = text.match(/^継続確認 (\d+)\/3$/))) return `Confirming continuity ${match[1]}/3`;
  if ((match = text.match(/^(.*) · (HOLD|DEPART|CONVERGE) · 遅延 (\d+)ms$/))) return `${localize(match[1])} · ${match[2]} · Latency ${match[3]} ms`;
  if ((match = text.match(/^生成サービス: (.*)$/))) return `Generation service: ${match[1]}`;
  if ((match = text.match(/^解析を停止しました: (.*)$/))) return `Analysis stopped: ${localize(match[1])}`;
  if ((match = text.match(/^音を開始できません: (.*)$/))) return `Could not start audio: ${localize(match[1])}`;
  if ((match = text.match(/^この出力は(\d+)chまでです。Core 17\.1chには18出力対応の機器・ブラウザ設定が必要です。ステレオ試聴も選べます。$/))) return `This output supports up to ${match[1]} channels. Core 17.1ch requires hardware and browser settings that support 18 outputs. You can also select stereo monitoring.`;
  if ((match = text.match(/^この端末の過去の観測 (\d+)件を読み込みました。テスト信号で再開しています。$/))) return `Loaded ${match[1]} past observations from this device. Resuming with the test signal.`;
  if ((match = text.match(/^送信中 · (\d+)音源$/))) return `Sending · ${match[1]} sources`;
  if ((match = text.match(/^送信エラー: (.*)$/))) return `Transmission error: ${localize(match[1])}`;
  if ((match = text.match(/^(受信|音源|出力) (.*)$/))) return `${({受信:"Receive",音源:"Sources",出力:"Output"})[match[1]]} ${localize(match[2])}`;
  if ((match = text.match(/^(\d+)音源$/))) return `${match[1]} sources`;
  if (text === "待機") return "Waiting";
  if (text === "DSP OFF → Maxの③") return "DSP OFF → Step 3 in Max";
  if ((match = text.match(/^(.*) · (ステレオ|12\.1ch) · master (.*) dB$/))) return `${localize(match[1])} · ${match[2] === "ステレオ" ? "Stereo" : match[2]} · master ${match[3]} dB`;
  return text;
}
// Store original messages (or render functions), not translated DOM snapshots.
// Language changes can then repaint text without touching audio, input or data.
const dynamicText = new Map();
function setText(id, value, translate = true) {
  dynamicText.set(id, { value, translate });
  const text = typeof value === "function" ? value() : value;
  $(id).textContent = translate ? localize(text) : text;
}
try {
  const saved = JSON.parse(localStorage.getItem("desymmetrical-core-study-v1") || "null");
  const restored = migrateStudy(saved);
  chapterId = restored.chapterId; chapterSettings = restored.settings;
} catch {}
function soundSettings() {
  return normalizeSoundSettings({chapter: chapterId, waveform:$("waveform").value, organization:$("organization").value,
    frequencyMin:Number($("frequency-min").value), frequencyMax:Number($("frequency-max").value),
    beatHz:Number($("beat-hz").value), harmonicFundamental:Number($("harmonic-fundamental").value)});
}
function saveSound() {
  chapterSettings[chapterId] = soundSettings();
  try { localStorage.setItem("desymmetrical-core-study-v1", JSON.stringify({version:2,chapterId,settings:chapterSettings})); } catch {}
}
function updateSoundUI() {
  const settings = soundSettings(), chapter = getChapter(chapterId);
  setText("current-wave", () => waveLabel(settings.waveform));
  $("beat-hz").disabled = settings.organization !== "interference";
  $("harmonic-fundamental").disabled = settings.organization !== "harmonic";
  setText("chapter-description", () => chapterLabel(settings.organization, "mapping") + t(" / 現在: ", " / Current: ") + waveLabel(settings.waveform) + " · " + settings.frequencyMin + "–" + settings.frequencyMax + " Hz" + (settings.organization === "interference" ? (settings.waveform === "noise" ? t(" / 2つの近接帯域を重ねる持続ノイズ", " / Sustained noise with two overlapping adjacent bands") : t(" / 周波数差 " + settings.beatHz + " Hzを基準にした持続音の重なり", " / Overlapping sustained tones with a base frequency difference of " + settings.beatHz + " Hz")) : ""));
  setText("stage-mode", () => `${chapter.number} / ${chapterLabel(chapter.id)}`);
  setText("stage-readout", () => `${$("bands").value} TONE LAYERS · ${waveLabel(settings.waveform)} · ${settings.organization.toUpperCase()}`);
  document.querySelectorAll("[data-chapter]").forEach(b => {
    const selected=b.dataset.chapter===chapterId;
    b.setAttribute("aria-pressed",String(selected));
    const config=selected?settings:normalizeSoundSettings(chapterSettings[b.dataset.chapter]||getChapter(b.dataset.chapter));
    const lines=b.querySelectorAll("small");
    b.querySelector("b").textContent=chapterLabel(b.dataset.chapter);
    lines[0].textContent=`${waveLabel(config.waveform)} · ${config.frequencyMin}–${config.frequencyMax} Hz`;
    lines[1].textContent=chapterLabel(config.organization,"organization");
  });
  const ctx = $("wave-preview").getContext("2d");
  ctx.clearRect(0,0,240,70); ctx.strokeStyle="#d4d2cc";ctx.lineWidth=1.5;ctx.beginPath();
  for (let x=0;x<240;x++) { const phase=(x/80)%1; const v=settings.waveform==="sine"?Math.sin(phase*Math.PI*2):settings.waveform==="triangle"?1-4*Math.abs(phase-.5):Math.sin(x*4.91)*Math.sin(x*.83); const y=35-v*22; x?ctx.lineTo(x,y):ctx.moveTo(x,y); }ctx.stroke();
}
function selectChapter(id, reset=false) {
  chapterId = getChapter(id).id;
  const settings = normalizeSoundSettings(reset ? getChapter(id) : {...getChapter(id),...chapterSettings[id], chapter:id});
  for (const [key,control] of Object.entries({waveform:"waveform",organization:"organization",frequencyMin:"frequency-min",frequencyMax:"frequency-max",beatHz:"beat-hz",harmonicFundamental:"harmonic-fundamental"})) $(control).value=settings[key];
  chapterSettings[id] = settings; previousSources=[]; updateSoundUI(); saveSound();
}
for (const chapter of CHAPTERS) {
  const b=document.createElement("button"); b.className="chapter-card"; b.dataset.chapter=chapter.id;
  b.innerHTML=`<span class="chapter-num">CHAPTER ${chapter.number}</span><b>${chapterLabel(chapter.id)}</b><small></small><small></small>`;
  b.onclick=()=>{saveSound();selectChapter(chapter.id);};$("chapter-cards").append(b);
}
function releaseStudy() {
  frozenStudy=null; setText("freeze-analysis", "解析値を固定して比較");setText("sample-status", "LIVE · 入力に追従");
  for (const el of document.querySelectorAll("[data-freeze-lock]")) el.disabled=false;
  lastSourceTime=-1;
}
$("freeze-analysis").onclick=()=>{
  if(frozenStudy){releaseStudy();return;}
  if(!features){notice("解析値が届いてから固定してください。",true);return;}
  frozenStudy={features:structuredClone(features),comparison:comparison?.valid?structuredClone(comparison):null,id:currentSourceId,at:new Date().toISOString()};
  generationEpoch++;generationAbort?.abort();
  setText("freeze-analysis", "ライブ入力に戻す");setText("sample-status", `FIXED · ${frozenStudy.id}`);
  for(const el of document.querySelectorAll("[data-freeze-lock]"))el.disabled=true;
};
$("chapter-reset").onclick=()=>selectChapter(chapterId,true);
for(const id of ["waveform","organization","beat-hz","harmonic-fundamental"]) $(id).onchange=()=>{const s=soundSettings();$("beat-hz").value=s.beatHz;$("harmonic-fundamental").value=s.harmonicFundamental;updateSoundUI();saveSound();};
$("export-study").onclick=()=>{saveSound();download("de-symmetrical-core-study.json",JSON.stringify({version:3,chapter:chapterId,chapters:Object.fromEntries(CHAPTERS.map(c=>[c.id,chapterSettings[c.id]||normalizeSoundSettings(c)])),sampleId:frozenStudy?.id||currentSourceId,fixed:!!frozenStudy,analysis:features?summarize(features):null,sources,speakers},null,2));};
function options() {
  return {
    ...soundSettings(),
    bands: Number($("bands").value),
    threshold: Number($("threshold").value),
    gamma: Number($("gamma").value),
    roi: Number($("roi").value) / 100,
    background,

    spread: Number($("spread").value),
    reverb: Number($("reverb").value),
  };
}
function notice(text, error = false) {
  setText("notice", text);
  $("notice").style.color = error ? "#ffb7b7" : "#bdbeb8";
}
function resetComparison() {
  generationEpoch++;
  generationAbort?.abort();
  comparison = null;
  validator.reset();
  setText("difference", "Δ —");
  setText("comparison-state", "同一条件の解析を待機");
  setText("generation-note", $("comparison").value === "none" ? "比較像は未接続" : "比較を準備中");
}
function resetAnalysis() {
  releaseStudy();
  background = null;
  backgroundId = null;
  previousSources = [];
  resetComparison();
  setText("capture-bg", "明るい基準を取得");
}
function muteBridge() {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "mute" }));
}
async function stopCamera() {
  frameToken++;
  muteBridge();
  audio.update([], speakers);
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
  video.pause();
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
  lastSourceTime = -1;
}
async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const chosen = $("camera").value,
    devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput",
    );
  const defaultCamera = new Option(localize("Mac の標準カメラ"), "");
  defaultCamera.dataset.cameraLabel = "Mac の標準カメラ";
  $("camera").replaceChildren(defaultCamera);
  devices.forEach((d, i) => {
    const option = new Option(d.label || localize(`カメラ ${i + 1}`), d.deviceId);
    if (!d.label) option.dataset.cameraLabel = `カメラ ${i + 1}`;
    $("camera").add(option);
  });
  if (devices.some((d) => d.deviceId === chosen)) $("camera").value = chosen;
}
async function connectCamera() {
  const deviceId = $("camera").value;
  await stopCamera();
  const token = frameToken;
  $("camera-start").disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(
        "カメラを利用できません。HTTPS または localhost で開いてください。",
      );
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
    if (token !== frameToken) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = media;
    imageSource = null;
    video.srcObject = stream;
    await video.play();
    if (token !== frameToken) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    source = "camera";
    $("source").value = "camera";
    running = true;
    resetAnalysis();
    await listCameras();
    if (token !== frameToken) return;
    const track = media.getVideoTracks()[0],
      s = track.getSettings();
    setText("source-detail", `${s.width} × ${s.height} · ${track.label}`, false);
    setText("input-label", "LIVE CAMERA");
    setText("state", "カメラ入力");
    track.addEventListener("ended", () => {
      running = false;
      resetComparison();
      muteBridge();
      audio.stop();
      setText("audio-status", "カメラ切断 · 音を停止");
      notice("カメラが切断されました。再接続してください。", true);
    });
    notice(
      "明るい面だけを映して基準を取得し、その範囲に影を入れてください。カメラ映像は保存しません。",
    );
  } catch (e) {
    notice(
      {
        NotAllowedError:
          "カメラが許可されていません。ブラウザとMacの設定で許可してから再接続してください。",
        NotFoundError: "カメラが見つかりません。",
        NotReadableError:
          "カメラを開けません。他のアプリで使用中か確認してください。",
        OverconstrainedError:
          "選択したカメラを利用できません。別の入力を選んでください。",
      }[e.name] || e.message,
      true,
    );
    if (token === frameToken && !stream) {
      resetAnalysis();
      imageSource = null;
      running = false;
      muteBridge();
      audio.stop();
      setText("state", "カメラ未接続");
    }
  } finally {
    $("camera-start").disabled = false;
  }
}
async function setSource(value) {
  if (value === "camera") return connectCamera();
  if (value === "file") {
    $("file").click();
    return;
  }
  await stopCamera();
  source = "demo";
  imageSource = null;
  running = true;
  $("source").value = "demo";
  setText("state", "テスト信号");
  setText("input-label", "TEST SIGNAL");
  setText("source-detail", "合成した階調信号 · 実測ではありません");
  resetAnalysis();
  notice(
    "合成したテスト信号を解析しています。実測にはカメラ入力へ切り替えてください。",
  );
}
function drawSource(t, w, h) {
  scratch.width = w;
  scratch.height = h;
  if (source === "demo")
    sc.putImageData(new ImageData(testFrame(w, h, t / 1000), w, h), 0, 0);
  else {
    const input = imageSource || video;
    if (!imageSource && video.readyState < 2) return null;
    sc.save();
    if ($("mirror").checked) {
      sc.translate(w, 0);
      sc.scale(-1, 1);
    }
    sc.drawImage(input, 0, 0, w, h);
    sc.restore();
  }
  return sc.getImageData(0, 0, w, h);
}
const displayScratch = document.createElement("canvas"),
  displayCtx = displayScratch.getContext("2d");
function showFrame(ctx, data, w, h) {
  displayScratch.width = w;
  displayScratch.height = h;
  displayCtx.putImageData(new ImageData(data, w, h), 0, 0);
  ctx.clearRect(0, 0, 640, 400);
  ctx.drawImage(displayScratch, 0, 0, 640, 400);
}
function path(ctx, poly, project) {
  ctx.beginPath();
  poly.forEach((p, i) => {
    const q = project(p);
    i ? ctx.lineTo(...q) : ctx.moveTo(...q);
  });
  ctx.closePath();
}
function renderAnalysis(f) {
  const ctx = contexts[1],
    out = new Uint8ClampedArray(f.width * f.height * 4);
  for (let i = 0; i < f.width * f.height; i++) {
    const j = i * 4,
      b = f.quantized[i] / (f.bands - 1);
    if (view === "penumbra") {
      const v = f.penumbra[i] ? clamp(f.gradients[i] * 15) : 0;
      out[j] = 16 + v * 218;
      out[j + 1] = 16 + v * 198;
      out[j + 2] = 16 + v * 176;
    } else if (view === "contour") {
      const v = f.mask[i] ? 42 : 20;
      out[j] = v;
      out[j + 1] = v;
      out[j + 2] = v;
    } else {
      const tone = f.mask[i] ? Math.round(40 + b * 180) : 12;
      out[j] = tone; out[j + 1] = tone; out[j + 2] = tone;
    }
    out[j + 3] = 255;
  }
  showFrame(ctx, out, f.width, f.height);
  ctx.strokeStyle = "#d1ccc3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const p of f.contours) {
    ctx.moveTo(p[0] * 640, p[1] * 400);
    ctx.lineTo(p[2] * 640, p[3] * 400);
  }
  ctx.stroke();
  const stride = Math.max(1, Math.floor(f.bands / 9));
  if (view !== "penumbra")
    for (let i = 0; i < f.bands; i += stride) {
      const poly = f.layers[i].cell.polygon;
      if (poly.length) {
        ctx.strokeStyle = "rgba(207,208,204,.24)";
        path(ctx, poly, (p) => [p[0] * 640, p[1] * 400]);
        ctx.stroke();
      }
    }
  const [x, y] = f.centroid;
  ctx.strokeStyle = "#edeee9";
  ctx.beginPath();
  ctx.moveTo(x * 640 - 7, y * 400);
  ctx.lineTo(x * 640 + 7, y * 400);
  ctx.moveTo(x * 640, y * 400 - 7);
  ctx.lineTo(x * 640, y * 400 + 7);
  ctx.stroke();
  const max = Math.max(1, ...f.histogram);
  ctx.fillStyle = "#bfc1be";
  for (let i = 0; i < f.bands; i++) {
    const bh = (35 * f.histogram[i]) / max;
    ctx.fillRect(
      (i * 640) / f.bands,
      400 - bh,
      Math.max(1, 640 / f.bands - 0.5),
      bh,
    );
  }
  const physical = Number($("physical-width").value),
    scale = physical > 0 ? physical / f.width : 1,
    unit = physical > 0 ? "mm" : "px";
  setText("area", `${(f.area * 100).toFixed(1)}%`);
  setText("darkness", f.darkness.toFixed(3));
  setText("penumbra", `${(f.penumbraWidth * scale).toFixed(1)} ${unit}`);
  setText("perimeter", `${Math.round(f.perimeter * scale)} ${unit}`);
  setText("band-note", `${f.bands} TONE BANDS · ${f.layers.filter((l) => l.count > 0).length} OCCUPIED`);
}
function renderSpatial(f) {
  const ctx = contexts[3];
  ctx.clearRect(0, 0, 640, 400);
  const project = (x, y, z) => [320 + x * 180 + y * 55, 340 + y * 36 - z * 245];
  ctx.strokeStyle = "#292b2c";
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const x = k / 2 - 1;
    ctx.beginPath();
    ctx.moveTo(...project(x, -1, 0));
    ctx.lineTo(...project(x, 1, 0));
    ctx.stroke();
  }
  for (let k = 0; k <= 4; k++) {
    const y = k / 2 - 1;
    ctx.beginPath();
    ctx.moveTo(...project(-1, y, 0));
    ctx.lineTo(...project(1, y, 0));
    ctx.stroke();
  }
  const stride = Math.max(1, Math.floor(f.bands / 32));
  for (let i = 0; i < f.bands; i += stride) {
    const l = f.layers[i];
    if (!l.area) continue;
    const z = l.tone,
      opacity = 0.15 + 0.65 * clamp(Math.sqrt(l.density) * 12);
    path(ctx, l.cell.polygon, (p) =>
      project((p[0] - 0.5) * 2, (p[1] - 0.5) * 2, z),
    );
    ctx.fillStyle = `rgba(164,165,160,${opacity * 0.15})`;
    ctx.strokeStyle = `rgba(207,208,204,${opacity})`;
    ctx.fill();
    ctx.stroke();
    const xy = project((l.centroid[0] - 0.5) * 2, (l.centroid[1] - 0.5) * 2, z);
    ctx.fillStyle = "#eeeae3";
    ctx.beginPath();
    ctx.arc(...xy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (comparison?.valid) {
    path(
      ctx,
      comparison.features.layers.filter((l) => l.area > 0).at(-1)?.cell
        .polygon ?? [],
      (p) => project((p[0] - 0.5) * 2, (p[1] - 0.5) * 2, -0.04),
    );
    ctx.strokeStyle = "#bfb7a8";
    ctx.fillStyle = "#a89a7944";
    ctx.fill();
    ctx.stroke();
  }
  ctx.font = "13px monospace";
  ctx.fillStyle = "#bcbdb8";
  const low = Number($("frequency-min").value),
    high = Number($("frequency-max").value);
  for (const z of [0, 0.25, 0.5, 0.75, 1]) {
    const p = project(1.1, 0, z);
    ctx.fillText(
      `${Math.round(low * (high / low) ** z)} Hz`,
      p[0] + 7,
      p[1] + 4,
    );
  }
  ctx.fillStyle = "#858783";
  ctx.fillText("+1 COMPARISON / SHARED STUDY", 18, 28);
  ctx.fillText("XYZ / CELL CENTROID", 18, 49);
  setText("voice-count", `${f.bands} + ${comparison?.valid ? 1 : 0} LAYERS`);
}
function transformFrame(frame, amount) {
  const w = frame.width,
    h = frame.height,
    input = frame.data,
    output = new Uint8ClampedArray(input.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.round(
          clamp(x + Math.sin((y / h) * 6.28) * amount * w * 0.12, 0, w - 1),
        ),
        sy = Math.round(
          clamp(y + Math.cos((x / w) * 6.28) * amount * h * 0.09, 0, h - 1),
        ),
        i = (y * w + x) * 4,
        j = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++)
        output[i + c] = clamp(input[j + c] * (1 - amount * 0.18), 0, 255);
      output[i + 3] = 255;
    }
  return output;
}
async function decodeImage(url) {
  if (
    typeof url !== "string" ||
    (!url.startsWith("data:image/") && !url.startsWith("blob:"))
  )
    throw Error("画像は data:image または blob 形式が必要です。");
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
function imagePixels(img, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cctx = c.getContext("2d", { willReadFrequently: true });
  cctx.drawImage(img, 0, 0, w, h);
  return cctx.getImageData(0, 0, w, h).data;
}
function renderComparisonPlaceholder() {
  contexts[2].clearRect(0, 0, 640, 400);
  contexts[2].fillStyle = "#9e96ad";
  contexts[2].font = "16px sans-serif";
  contexts[2].fillText(localize("比較像を接続すると、差分が音に加わります。"), 30, 194);
}
async function updateComparison(frame, real, sourceId, at, t) {
  const mode = $("comparison").value;
  if (!["transform", "endpoint"].includes(mode)) {
    renderComparisonPlaceholder();
    return;
  }
  if (generationBusy || t - lastGeneration < (mode === "endpoint" ? 1200 : 300))
    return;
  lastGeneration = t;
  generationBusy = true;
  const epoch = generationEpoch,
    settings = options();
  try {
    let data,
      origin,
      generatedAt = Date.now(),
      generatedFrom = sourceId,
      generatedId = crypto.randomUUID();
    if (mode === "transform") {
      data = transformFrame(frame, Number($("deviation").value));
      origin = "変形テスト · AI未使用";
    } else {
      const endpoint = $("endpoint").value;
      if (!endpoint) {
        setText("generation-note", "生成サービスの URL を設定してください");
        return;
      }
      const u = new URL(endpoint);
      if (
        u.protocol !== "https:" &&
        !["127.0.0.1", "localhost"].includes(u.hostname)
      )
        throw Error("生成サービスにはHTTPSを使用してください。");
      const c = document.createElement("canvas");
      c.width = frame.width;
      c.height = frame.height;
      c.getContext("2d").putImageData(frame, 0, 0);
      generationAbort = new AbortController();
      const timeout = setTimeout(() => generationAbort?.abort(), 4500);
      const result = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: c.toDataURL("image/jpeg", 0.85),
          sourceId,
          sourceAt: at,
          prompt: nextPrompt(real, comparison?.label ?? "hold"),
          strength: Number($("deviation").value),
        }),
        signal: generationAbort.signal,
      });
      clearTimeout(timeout);
      if (!result.ok) throw Error(`生成サービス: ${result.status}`);
      const response = await result.json();
      if (response.provider !== "StreamDiffusion")
        throw Error("生成元に StreamDiffusion の識別がありません。");
      generatedAt = response.generatedAt;
      generatedFrom = response.sourceId;
      generatedId = response.generatedId;
      data = imagePixels(
        await decodeImage(response.image),
        frame.width,
        frame.height,
      );
      origin = "StreamDiffusion · 外部接続";
    }
    if (epoch !== generationEpoch) return;
    const gf = analyze(data, frame.width, frame.height, settings),
      distance = compareFeatures(real, gf),
      checked = validator.validate({
        sourceId,
        generatedFrom,
        generatedId,
        sourceAt: at,
        generatedAt,
        distance,
        target: Number($("target").value),
      });
    comparison = {
      ...checked,
      features: gf,
      pairedReal: summarize(real),
      distance,
      origin,
      sourceId,
      generatedId,
      sourceAt: at,
      generatedAt,
    };
    showFrame(contexts[2], data, frame.width, frame.height);
    contexts[2].strokeStyle = "#bda8ff";
    contexts[2].lineWidth = 1.2;
    for (let i = 0; i < gf.bands; i += Math.max(1, Math.floor(gf.bands / 9))) {
      path(contexts[2], gf.layers[i].cell.polygon, (p) => [
        p[0] * 640,
        p[1] * 400,
      ]);
      contexts[2].stroke();
    }
    setText("generation-note", origin);
    setText("comparison-state", `${checked.reason} · ${checked.label.toUpperCase()} · 遅延 ${Date.now() - at}ms`);
    setText("difference", `Δ ${distance.toFixed(3)}`);
  } catch (e) {
    if (epoch === generationEpoch) {
      comparison = null;
      validator.reset();
      setText("comparison-state", "比較を保留 · 実像の解析は継続");
      setText("generation-note", e.message);
      setText("difference", "Δ —");
    }
  } finally {
    generationBusy = false;
  }
}
function nextPrompt(f, label) {
  const history = records.slice(-12),
    mean = history.length
      ? history.reduce((a, r) => a + r.analysis.darkness, 0) / history.length
      : f.darkness;
  return `Observe an Asama volcanic stone shadow. Preserve the originating contour. ${label === "depart" ? "Gently increase tonal and contour variation." : label === "converge" ? "Bring the contour closer to the observed shadow." : "Hold the current relationship."} Darkness ${f.darkness.toFixed(3)}, recent mean ${mean.toFixed(3)}, area ${f.area.toFixed(3)}, penumbra ${f.penumbraWidth.toFixed(2)} analysis pixels. No human identity, no robot commands.`;
}
function smoothSources(values, dt) {
  const keep = Math.pow(Number($("smoothing").value), dt / 100),
    map = new Map(previousSources.map((s) => [s.id, s]));
  for (const s of values) {
    const prev = map.get(s.id);
    if (prev)
      for (const k of ["x", "y", "z", "spread", "reverb"])
        s[k] = prev[k] * keep + s[k] * (1 - keep);
  }
  previousSources = values.map((s) => ({ ...s }));
  return values;
}
function renderTimeline() {
  const items = records.slice(-60).reverse().map(record => {
    const item = document.createElement("div");
    item.className = "trace-item";
    const time = document.createElement("time");
    time.textContent = new Date(record.at).toLocaleTimeString(getLanguage() === "en" ? "en-GB" : "ja-JP");
    item.append(time, document.createTextNode(record.label.toUpperCase()));
    const p = document.createElement("p");
    const chapter = record.study?.chapter || record.settings?.chapterId;
    const wave = record.settings?.waveform;
    // Retain the identity of old observations without restoring retired options.
    const recordedChapter = Object.hasOwn(CHAPTER_LABELS, chapter)
      ? chapterLabel(chapter)
      : chapter === "pulse" ? t("点滅（旧章）", "Pulse (legacy chapter)") : chapter;
    const recordedWave = wave === "square" ? t("矩形波（旧設定）", "Square wave (legacy)")
      : wave === "sawtooth" ? t("ノコギリ波（旧設定）", "Sawtooth wave (legacy)") : waveLabel(wave);
    const study = chapter ? `[${recordedChapter}${wave ? ` / ${recordedWave}` : ""}] ` : "";
    p.textContent = `${study}${t("暗度", "Darkness")} ${record.analysis.darkness.toFixed(3)} · ${t("面積", "Area")} ${(record.analysis.area * 100).toFixed(1)}%${record.comparison ? ` · Δ ${record.comparison.distance.toFixed(3)}` : ""}`;
    item.append(p);
    return item;
  });
  $("timeline").replaceChildren(...items);
}
function recordState(at, id) {
  if (!features) return;
  const label = comparison?.valid ? comparison.label : "hold",
    line =
      label === "depart"
        ? "由来を保ちながら、比較像の変化を少し広げる。"
        : label === "converge"
          ? "比較像と実像の距離を少し縮める。"
          : "現在の関係を保ち、影の変化を観測する。";
  const record = {
    id: crypto.randomUUID(),
    at: new Date(at).toISOString(),
    source,
    sourceId: id,
    analysis: summarize(features),
    study: { chapter:chapterId, fixed:!!frozenStudy, sampleId:currentSourceId },
    settings: {
      ...options(),
      background: background ? "captured" : "none",
      backgroundId,
      physicalWidthMm: Number($("physical-width").value),
    },
    comparison: comparison
      ? {
          distance: comparison.distance,
          valid: comparison.valid,
          label: comparison.label,
          origin: comparison.origin,
          sourceId: comparison.sourceId,
          generatedId: comparison.generatedId,
          sourceAt: comparison.sourceAt,
          generatedAt: comparison.generatedAt,
          analysis: summarize(comparison.features),
          pairedReal: comparison.pairedReal,
        }
      : null,
    label,
    trace: line,
    nextPrompt: nextPrompt(features, label),
  };
  records.push(record);
  if (records.length > 10000) records.shift();
  setText("trace-label", label.toUpperCase());
  setText("trace-current", line);
  renderTimeline();
  if (db) {
    const tx = db.transaction("states", "readwrite");
    tx.objectStore("states").put(record);
    if (records.length === 10000) {
      const cutoff = records[0].at;
      tx
        .objectStore("states")
        .index("at")
        .openCursor(IDBKeyRange.upperBound(cutoff, true)).onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          c.delete();
          c.continue();
        }
      };
    }
  }
}
function tick(t) {
  requestAnimationFrame(tick);
  if (!running || document.hidden || t - lastFrame < 85) return;
  const dt = t - lastFrame;
  lastFrame = t;
  try {
    if (
      !frozenStudy && source !== "demo" &&
      !imageSource &&
      video.currentTime === lastSourceTime
    )
      return;
    lastSourceTime = video.currentTime;
    const start = performance.now(),
      w = Number($("resolution").value),
      h = Math.round(w * 0.625),
      frame = frozenStudy ? null : drawSource(t, w, h);
    if (!frame && !frozenStudy) return;
    const at = Date.now(),
      id = frozenStudy?.id || `${source}-${++frameNumber}-${at}`;
    currentSourceId=id;
    features = frozenStudy?.features || analyze(frame.data, w, h, options());
    if(frame) showFrame(contexts[0], frame.data, w, h);
    if(frozenStudy) comparison=frozenStudy.comparison;
    const roi = Number($("roi").value) / 100;
    if (roi < 1) {
      contexts[0].strokeStyle = "#d1d1cb";
      contexts[0].setLineDash([5, 4]);
      contexts[0].strokeRect(
        (1 - roi) * 320,
        (1 - roi) * 200,
        640 * roi,
        400 * roi,
      );
      contexts[0].setLineDash([]);
    }
    renderAnalysis(features);
    setText("stage-readout", () => `${features.bands} TONE LAYERS · ${waveLabel(soundSettings().waveform)} · ${soundSettings().organization.toUpperCase()}`);
    if (!frozenStudy && comparison && Date.now() - comparison.sourceAt > 5000) {
      comparison.valid = false;
      comparison.label = "hold";
      setText("comparison-state", "比較が古いため保留");
    }
    sources = smoothSources(applyChapter(toSources(features, options(), comparison), features, soundSettings()), dt);
    audio.update(sources, speakers);
    renderSpatial(features);
    if(!frozenStudy) updateComparison(frame, features, id, at, t);
    if (t - lastLog > 5000) {
      lastLog = t;
      recordState(at, id);
    }
    if (socket?.readyState === WebSocket.OPEN && t - lastBridge > 100) {
      lastBridge = t;
      socket.send(
        JSON.stringify({
          type: "state",
          version: 1,
          at,
          sourceId: id,
          sources: sources.map(({ polygon, ...s }) => s),
          speakers,
          volume: audio.volume,
          mode: "shadow-audio-only",
        }),
      );
    }
    const elapsed = performance.now() - start;
    setText("performance", `${w}×${h} · ${elapsed.toFixed(0)} ms · ${Math.min(12, 1000 / dt).toFixed(1)} fps`);
  } catch (e) {
    running = false;
    muteBridge();
    audio.stop();
    notice(`解析を停止しました: ${e.message}`, true);
    setText("state", "停止");
  }
}
function download(name, data, type = "application/json") {
  const u = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function renderSpeakers() {
  const table = document.createElement("table"),
    head = table.createTHead().insertRow();
  for (const s of [
    "Ch",
    "配置",
    "X m",
    "Y m",
    "Z m",
    "Gain dB",
    "Delay ms",
    "極性",
  ]) {
    const th = document.createElement("th");
    th.dataset.runtimeLabel = s;
    th.textContent = localize(s);
    head.append(th);
  }
  for (const sp of speakers) {
    const tr = table.insertRow();
    tr.insertCell().textContent = String(sp.id);
    const group = tr.insertCell();
    group.dataset.runtimeLabel = sp.group;
    group.textContent = localize(sp.group);
    for (const k of ["x", "y", "z", "gainDb", "delayMs", "polarity"]) {
      const input = document.createElement("input");
      input.type = "number";
      input.value = sp[k];
      input.step = k === "polarity" ? "2" : ".01";
      input.min =
        k === "polarity"
          ? "-1"
          : k === "delayMs" || k === "z"
            ? "0"
            : k === "gainDb"
              ? "-60"
              : "-20";
      input.max =
        k === "polarity"
          ? "1"
          : k === "delayMs"
            ? "1000"
            : k === "gainDb"
              ? "12"
              : "20";
      input.setAttribute("aria-label", `Ch${sp.id} ${k}`);
      input.onchange = () => {
        const v = Number(input.value);
        if (
          !Number.isFinite(v) ||
          v < Number(input.min) ||
          v > Number(input.max) ||
          (k === "polarity" && Math.abs(v) !== 1)
        ) {
          input.value = sp[k];
          notice("校正値が範囲外です。", true);
          return;
        }
        sp[k] = v;
        sp.measured = false;
        setText("calibration-note", "編集した校正値。会場での測定・確認は未完了です。");
      };
      tr.insertCell().append(input);
    }
  }
  $("speaker-table").replaceChildren(table);
}
function validateCalibration(data) {
  if (!Array.isArray(data.speakers) || data.speakers.length !== 18)
    throw Error("18chの校正データが必要です。");
  return data.speakers.map((s, i) => {
    if (
      s.id !== i + 1 ||
      !["x", "y", "z", "gainDb", "delayMs", "polarity"].every((k) =>
        Number.isFinite(s[k]),
      )
    )
      throw Error("校正値の形式が無効です。");
    if (
      Math.abs(s.x) > 20 ||
      Math.abs(s.y) > 20 ||
      s.z < 0 ||
      s.z > 20 ||
      s.gainDb < -60 ||
      s.gainDb > 12 ||
      s.delayMs < 0 ||
      s.delayMs > 1000 ||
      Math.abs(s.polarity) !== 1
    )
      throw Error("校正値が範囲外です。");
    if (
      s.eq &&
      (!Array.isArray(s.eq) ||
        s.eq.length > 4 ||
        s.eq.some(
          (e) =>
            !Number.isFinite(e.frequency) ||
            e.frequency < 20 ||
            e.frequency > 20000 ||
            !Number.isFinite(e.q) ||
            e.q < 0.1 ||
            e.q > 20 ||
            !Number.isFinite(e.gainDb) ||
            Math.abs(e.gainDb) > 12,
        ))
    )
      throw Error("EQは最大4バンド、20–20000Hz、Q 0.1–20、±12dBです。");
    return {
      ...speakers[i],
      ...s,
      group: speakers[i].group,
      measured: s.measured === true,
    };
  });
}
$("camera-start").onclick = connectCamera;
$("camera").onchange = () => {
  if (source === "camera") connectCamera();
};
$("source").onchange = (e) => setSource(e.target.value);
navigator.mediaDevices?.addEventListener("devicechange", () =>
  listCameras().catch(() => {}),
);
listCameras().catch(() => {});
$("file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) {
    $("source").value = source;
    return;
  }
  try {
    await stopCamera();
    if (fileURL) URL.revokeObjectURL(fileURL);
    fileURL = URL.createObjectURL(f);
    imageSource = null;
    if (f.type.startsWith("image/")) imageSource = await decodeImage(fileURL);
    else if (f.type.startsWith("video/")) {
      video.src = fileURL;
      video.loop = true;
      await video.play();
    } else throw Error("画像または動画を選択してください。");
    source = "file";
    $("source").value = "file";
    running = true;
    resetAnalysis();
    setText("state", "ファイル入力");
    setText("input-label", "LOCAL FILE");
    setText("source-detail", f.name, false);
    notice("読み込んだファイルをこの端末で解析しています。");
  } catch (e) {
    notice(e.message, true);
  }
};
$("file").oncancel = () => {
  $("source").value = source;
};
$("comparison").onchange = resetComparison;
for (const id of [
  "threshold",
  "gamma",
  "smoothing",
  "spread",
  "reverb",
  "volume",
])
  $(id).oninput = () => {
    const value = Number($(id).value);
    setText(id + "-value", id === "volume" ? `${Math.round(value * 100)}%` : value.toFixed(2));
    if (id === "volume") audio.volume = value;
    if (["threshold", "gamma"].includes(id)) resetComparison();
  };
for (const id of ["bands", "resolution", "roi", "mirror"])
  $(id).onchange = resetAnalysis;
for (const id of ["frequency-min", "frequency-max"])
  $(id).onchange = () => {
    const {frequencyMin:low,frequencyMax:high} = soundSettings();
    $("frequency-min").value = low;
    $("frequency-max").value = high;
    updateSoundUI(); saveSound();
  };
$("capture-bg").onclick = () => {
  if (!features) return;
  const frame = drawSource(performance.now(), features.width, features.height);
  if (!frame) return;
  background = new Float32Array(features.width * features.height);
  let mean = 0;
  for (let i = 0; i < background.length; i++) {
    background[i] =
      (0.2126 * frame.data[i * 4] +
        0.7152 * frame.data[i * 4 + 1] +
        0.0722 * frame.data[i * 4 + 2]) /
      255;
    mean += background[i];
  }
  if (mean / background.length < 0.15) {
    background = null;
    notice("基準が暗すぎます。影のない明るい面で取得してください。", true);
    return;
  }
  backgroundId = crypto.randomUUID();
  resetComparison();
  setText("capture-bg", "基準を再取得");
  notice("明るい基準を取得しました。影を入れて観測してください。");
};
$("reset").onclick = () => {
  for (const [k, v] of Object.entries({
    threshold: 0.12,
    gamma: 1,
    smoothing: 0.7,
    spread: 1,
    reverb: 0.5,
    roi: 100,
    "physical-width": 0,
    "frequency-min": 110,
    "frequency-max": 3520,
    bands: 30,
    resolution: 320,
    target: 0.12,
    deviation: 0.25,
  })) {
    $(k).value = v;
    if ($(k + "-value")) setText(k + "-value", Number(v).toFixed(2));
  }
  $("mirror").checked = false;
  selectChapter("sustain",true);
  resetAnalysis();
  notice("解析と音響の設定を初期値に戻しました。");
};
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      view = b.dataset.view;
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.toggle("active", x === b));
    }),
);
const audioMode = document.createElement("select");
audioMode.id = "audio-mode";
audioMode.add(new Option("", "stereo"));
audioMode.add(new Option("", "discrete"));
function updateAudioModeLabels() {
  audioMode.setAttribute("aria-label", localize("音声出力モード"));
  audioMode.options[0].textContent = localize("ステレオ試聴");
  audioMode.options[1].textContent = localize("17.1ch 直接出力");
}
updateAudioModeLabels();
$("audio-status").after(audioMode);
function syncAudioControls() {
  const state = audio.state;
  $("audio-start").disabled = state === "starting";
  if (state === "starting") {
    setText("audio-start", "音の準備中…");
    setText("audio-status", "音を準備しています…");
  } else if (state === "running") {
    setText("audio-start", "音をミュート");
    setText("audio-status", audio.mode === "discrete" ? "17.1ch · ブラウザ直接出力" : "STEREO MONITOR · 再生中");
  } else if (state === "suspended" || state === "interrupted") {
    setText("audio-start", "音を再開");
    setText("audio-status", "音声が一時停止中 · 再開してください");
  } else if (state === "error") {
    setText("audio-start", "音を再試行");
    setText("audio-status", "音声エラー · 再試行できます");
    notice(`音を開始できません: ${audio.error}`, true);
  } else {
    setText("audio-start", "ブラウザで試聴");
    setText("audio-status", "音響停止");
  }
}
audio.onstatechange = syncAudioControls;
$("audio-start").onclick = async () => {
  try {
    if (audio.state === "starting") return;
    if (audio.state === "running") {
      await audio.stop();
      return;
    }
    if (!frozenStudy && source === "file" && !imageSource && video.readyState < 2) {
      notice("動画を選び直して再開してください。", true);
      return;
    }
    const needsCamera = !frozenStudy && source === "camera" && !stream;
    running = true;
    // Unlock audio in the tap itself, before waiting for camera permission or downloads.
    const started = audio.context && audio.node && !audio.error
      ? audio.resume() : audio.start(audioMode.value);
    await Promise.all([started, needsCamera ? connectCamera() : Promise.resolve()]);
    if (needsCamera && !stream) { await audio.stop(); return; }
    audio.update(sources, speakers);
    syncAudioControls();
    if (audio.state === "running") notice(
      audio.mode === "discrete"
        ? "18chへ出力中。ブラウザの距離重み付けレンダラーです。会場用Spat5のレンダリングとは異なります。"
        : "影の階調ごとの音が鳴っています。停止ボタンでカメラと音を停止できます。",
    );
  } catch (e) {
    if (e.message !== "音の開始を取り消しました。") notice(`音を開始できません: ${e.message}`, true);
  }
};
$("stop").onclick = async () => {
  running = false;
  resetComparison();
  await stopCamera();
  await audio.stop();
  socket?.close();
  setText("audio-start", "ブラウザで試聴");
  setText("audio-status", "停止中");
  setText("state", "停止");
  notice(
    "カメラ・解析・音・外部送信を停止しました。入力を選択すると再開します。",
  );
};
let maxFeedbackAt = 0;
function clearMaxStatus(message) {
  setText("max-status", message);
  for (const [id, label] of [["max-rx","受信"],["max-dsp","DSP"],["max-pre","音源"],["max-out","出力"]]) setText(id, label + " —");
}
function connectMax() {
  notice("従来のMaxパッチは12.1ch・sin波専用です。Coreの波形と4章はブラウザで試聴してください。接続仕様に現在の対応範囲を記載しています。",true); return;

  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) { socket.close(); return; }
  try {
    const url = new URL($("bridge-url").value);
    if (!["ws:", "wss:"].includes(url.protocol)) throw Error("ws:// または wss:// を指定してください。");
    const current = new WebSocket(url); socket = current;
    setText("bridge-state", "接続中"); clearMaxStatus("接続中");
    current.onopen = () => { if(socket!==current)return; setText("bridge-state", "接続済み · Max応答待ち"); setText("max-connect", "Max接続を解除"); };
    current.onmessage = (e) => {
      if(socket!==current)return;
      try {
        const d = JSON.parse(e.data);
        if (d.type === "ack") setText("bridge-state", `送信中 · ${d.sources}音源`);
        if (d.type === "error") clearMaxStatus(`送信エラー: ${d.message}`);
        if (d.type !== "max-status") return;
        if(!d.connected) { clearMaxStatus("Maxから応答なし · パッチを開いてください"); return; }
        maxFeedbackAt=Date.now();
        const db = v => v > .000001 ? (20*Math.log10(v)).toFixed(1)+" dBFS" : "無音";
        setText("max-status", `${d.matched && d.rxAlive ? "Max受信を確認" : "Max応答あり · このUIの入力待ち"} · ${d.mode === "stereo" ? "ステレオ" : "12.1ch"} · master ${d.masterDb} dB`);
        setText("max-rx", `受信 ${d.matched&&d.rxAlive ? d.active+"音源" : "待機"}`);
        setText("max-dsp", `DSP ${d.dsp ? "ON / "+d.sampleRate+" Hz" : "OFF → Maxの③"}`);
        setText("max-pre", "音源 " + db(d.prePeak));
        setText("max-out", "出力 " + db(d.outPeak));
      } catch {}
    };
    current.onclose = () => { if(socket!==current)return; setText("bridge-state", "未接続"); setText("max-connect", "Maxへ接続");maxFeedbackAt=0;clearMaxStatus("Max未接続"); };
    current.onerror = () => { if(socket!==current)return; clearMaxStatus("接続できません · Maxの①で起動し、このMacの接続用UIを開いてください"); };
  } catch(e) { notice(e.message,true); }
}
$("bridge-connect").onclick = connectMax;
$("max-connect").onclick = connectMax;
setInterval(()=>{if(maxFeedbackAt && Date.now()-maxFeedbackAt>2000) {maxFeedbackAt=0;clearMaxStatus("Max応答が途切れました");}},500);
if(new URLSearchParams(location.search).get("max")==="1" && ["127.0.0.1","localhost"].includes(location.hostname)) connectMax();
$("download-state").onclick = () =>
  download(
    "core-sound-state.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        version: 1,
        study: {chapter:chapterId, fixed:!!frozenStudy, sampleId:currentSourceId, settings:soundSettings()},
        sources,
        speakers,
        analysis: features ? summarize(features) : null,
      },
      null,
      2,
    ),
  );
$("export").onclick = () =>
  download(
    "shadow-traces.jsonl",
    records.map((x) => JSON.stringify(x)).join("\n"),
    "application/x-ndjson",
  );
$("clear-log").onclick = () => {
  records = [];
  $("timeline").replaceChildren();
  if (db) db.transaction("states", "readwrite").objectStore("states").clear();
  notice("この端末の観測記録を消去しました。");
};
$("calibration-export").onclick = () =>
  download(
    "speaker-calibration.json",
    JSON.stringify(
      { version: 1, renderer: "Spat5 via bridge", speakers },
      null,
      2,
    ),
  );
$("calibration-import").onchange = async (e) => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    const validated = validateCalibration(JSON.parse(await f.text()));
    speakers.splice(0, 18, ...validated);
    renderSpeakers();
    setText("calibration-note", validated.every((x) => x.measured)
      ? "読み込んだ測定値を使用。測定の妥当性は会場で確認してください。"
      : "校正値を読み込みました。未測定チャンネルが含まれます。");
  } catch (e) {
    notice(e.message, true);
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.update([], speakers);
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "mute" }));
  }
});
window.addEventListener("pagehide", () => {
  stopCamera();
  audio.stop();
  socket?.close();
});
try {
  const request = indexedDB.open("desymmetrical-core-traces", 1);
  request.onupgradeneeded = () => {
    const s = request.result.createObjectStore("states", { keyPath: "id" });
    s.createIndex("at", "at");
  };
  request.onsuccess = () => {
    db = request.result;
    const q = db
      .transaction("states")
      .objectStore("states")
      .index("at")
      .getAll();
    q.onsuccess = () => {
      records = q.result.slice(-10000);
      renderTimeline();
      if (records.length)
        notice(
          `この端末の過去の観測 ${records.length}件を読み込みました。テスト信号で再開しています。`,
        );
    };
  };
  request.onerror = () =>
    notice(
      "記録の保存領域を利用できません。この画面を開いている間の記録は書き出せます。",
    );
} catch {}
selectChapter(chapterId);
renderSpeakers();
onLanguageChange(() => {
  // Restore dynamic states after the static document strings have changed.
  // No input is replaced, no chapter is selected and no audio node is restarted.
  for (const [id, { value, translate }] of dynamicText) setText(id, value, translate);
  updateSoundUI();
  updateAudioModeLabels();
  for (const option of $("camera").options) {
    if (option.dataset.cameraLabel) option.textContent = localize(option.dataset.cameraLabel);
  }
  for (const cell of $("speaker-table").querySelectorAll("[data-runtime-label]")) {
    cell.textContent = localize(cell.dataset.runtimeLabel);
  }
  renderTimeline();
  if ($("comparison").value === "none") renderComparisonPlaceholder();
});
requestAnimationFrame(tick);
function animateField(t){requestAnimationFrame(animateField);if(document.hidden || t-lastVisual<33)return;lastVisual=t;renderSignalField($("signal-field"),{features,sources,chapter:soundSettings().organization,waveform:$("waveform").value,time:running?t/1000:0,frozen:!!frozenStudy});}
requestAnimationFrame(animateField);
initSpatialIntegration(() => ({
  source, running, fixed: !!frozenStudy, sampleId: frozenStudy?.id || currentSourceId,
  features: features ? summarize(features) : null,
}));
export function getStatus() {
  return {
    source,
    running,
    bands: Number($("bands").value),
    audio: audio.state,
    audioError: audio.error || null,
    analysis: features ? summarize(features) : null,
    comparison: comparison
      ? {
          valid: comparison.valid,
          label: comparison.label,
          distance: comparison.distance,
        }
      : null,
    recordCount: records.length,
    study: {chapter:chapterId, fixed:!!frozenStudy, sampleId:currentSourceId, settings:soundSettings()},
    sourceCount:sources.length, speakers:speakers.length,
  };
}
if (document.modelContext?.registerTool) {
  const controller = new AbortController();
  const tools = [
    {
      name: "read_shadow_analysis",
      description: "Read current shadow analysis, input and audio status.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => getStatus(),
    },
    {
      name: "configure_shadow_bands",
      description:
        "Set the same 16, 30 or 64 tone-band setting visible in the UI.",
      inputSchema: {
        type: "object",
        properties: { bands: { type: "integer", enum: [16, 30, 64] } },
        required: ["bands"],
        additionalProperties: false,
      },
      execute: (input) => {
        if (![16, 30, 64].includes(input?.bands))
          throw Error("bands must be 16, 30 or 64");
        $("bands").value = input.bands;
        resetAnalysis();
        return { bands: input.bands };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        document.modelContext.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {}
  }
  window.addEventListener("pagehide", () => controller.abort(), { once: true });
}
