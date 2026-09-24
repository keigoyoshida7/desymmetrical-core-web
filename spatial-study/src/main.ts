import './style.css';
import {initSpatialLocale,setSpatialLanguage} from './locale';
import {validateAnalysisFeed,applyAnalysisFeed} from './analysis-feed';
import {connectionDefaults} from './config';
import {Store,defaults,validateScene,speakerLayout,acrylicPlan,faceEntrance,centerSupportOverAcrylic,synchronizeArmSpeaker,spherical,cartesian,relative,absolute,distance,clamp,type Vec3,type SceneState} from './model';
import {InstallationScene} from './scene';
import {forward,solveTarget} from './robot';
import {advanceMotion,motionPosition,motionPresets,setMotionPreset} from './motion';
import {applyMappings} from './mappings';
import {OscClient} from './osc/client';
import {Recorder,download,loadPresets,savePresets,parsePresets,parseRecording,readJSON} from './storage';

const store=new Store(),recorder=new Recorder();let presets=loadPresets();let lastUI=0;
const app=document.querySelector<HTMLDivElement>('#app')!;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function field(name:string,path:string,min=-5,max=5,step=.01,range=false){return `<label class="field"><span>${name}</span><input aria-label="${esc(name)}" data-path="${path}" type="${range?'range':'number'}" min="${min}" max="${max}" step="${step}">${range?`<output data-value="${path}"></output>`:''}</label>`;}
function vector(name:string,path:string){return `<div class="vector"><span>${name}</span>${['X','Y','Z'].map((x,i)=>`<label>${x}<input aria-label="${name} ${x}" data-path="${path}.${i}" type="number" min="-25" max="25" step="0.01"></label>`).join('')}</div>`;}
function select(name:string,path:string,options:string[]){return `<label class="field"><span>${name}</span><select aria-label="${name}" data-path="${path}">${options.map(x=>`<option>${x}</option>`).join('')}</select></label>`;}
function check(name:string,path:string){return `<label class="check"><input type="checkbox" data-path="${path}">${name}</label>`;}
function section(title:string,content:string,open=false){return `<details ${open?'open':''}><summary>${title}</summary><div class="section-body">${content}</div></details>`;}
function resetWallSpeakers(s:SceneState){const layout=speakerLayout(s.room,s.speakerSetup);s.speakers=s.speakers.map((sp,i)=>sp.role==='wall'?layout[i]:sp);}
const motionOptions=['MANUAL','CIRCLE','ELLIPSE','ORBIT','FIGURE 8','SLOW SCAN','PENDULUM','RANDOM SMOOTH','RANDOM POINTS','KEYFRAMES'];
app.innerHTML=`
<header><div class="brand"><div><h1>De-symmetrical Core / Spatial study</h1><p>ARTIST: KEIGO YOSHIDA · ORIGINAL SPATIAL AUDIO PROTOTYPE: <a href="https://github.com/gllmp" target="_blank" rel="noopener noreferrer">GUILLAUME PICCARRETA ↗</a></p></div></div><div class="header-right"><button data-action="info" class="info-button">INFO</button><span id="connection" class="status">OSC — DISCONNECTED</span><button data-action="sync">Send scene to Max ↗</button></div></header>
<div class="analysis-link"><label class="check"><input id="follow-analysis" type="checkbox">Use analysis from above</label><span id="analysis-feed-status" class="hint">Scene simulation</span><p class="hint">Optional visual mapping of the current shadow features. Scene edits do not change the sound playing above. Motion and recording pause while this section is off-screen.</p></div>
<div class="workspace"><aside class="left"><div class="panel-title">INSTALLATION <span>01</span></div>
${section('Exhibition space',`<p class="hint">Spatial planning model · 7 m enclosure and 5.4 m blackout walls are provisional. Confirm with venue.</p>${field('Room width m','room.width',4,20,.1)}${field('Room depth m','room.depth',4,20,.1)}${field('Enclosure height m','room.height',3,12,.1)}${field('Blackout wall height m','room.wallHeight',2,12,.1)}${field('Entrance opening m','room.entranceWidth',.6,4,.1)}${field('Light-lock corridor m','room.corridorDepth',.5,4,.1)}<p class="hint">Room edits preserve individual speaker positions. Reset the layout after changing room dimensions.</p><button data-action="reset-layout">Reset 16 wall speakers to room</button>`,true)}
${section('Acrylic · trapezoidal form',`<p class="hint">Trapezoidal base and top · 32.5° slope in the reference study. Sizes below are editable working assumptions; fabrication dimensions are unconfirmed.</p>${field('Front base width m','acrylic.bottomFrontWidth',.3,6,.01)}${field('Rear base width m','acrylic.bottomRearWidth',.3,6,.01)}${field('Acrylic depth m','acrylic.depth',.3,6,.01)}${field('Acrylic height m','acrylic.height',.05,2,.01)}${field('Slope ° from floor','acrylic.slope',10,80,.1)}${field('Acrylic thickness m','acrylic.thickness',.001,.05,.001)}${field('Acrylic yaw °','acrylic.yaw',-180,180,1)}${vector('Acrylic position','acrylic.position')}<p class="hint">The long front edge and stone face the left entrance at 90°.</p><button data-action="face-entrance">Face acrylic & stone toward entrance</button><div class="readout" id="acrylic-readout"></div><button data-action="focus-acrylic">Inspect acrylic form</button>`,true)}
${section('Stone & suspended arm',`<p class="hint">Asama stone proxy · all sizes and support coordinates below are assumptions. Arm joints are a generic visual model.</p>${field('Stone width m','stone.width',.05,2,.001)}${field('Stone depth m','stone.depth',.05,2,.001)}${field('Stone height m','stone.height',.05,2,.001)}${field('Stone yaw °','stone.yaw',-180,180,1)}${vector('Stone centre','stone.position')}${select('Arm mounting','robot.mount',['ceiling','side'])}${vector('Robot suspension base','robot.base')}<button data-action="center-support">Centre support over acrylic</button><p class="hint">Ceiling support descends vertically to the arm above the acrylic. Re-centre X/Y after moving the acrylic; Z sets the arm attachment height.</p>`)}${section('Robot & light',`<p class="hint warning">Visual model only · not a robot safety controller.</p>${select('Control','robot.control',['joints','target'])}<div class="joints">${Array.from({length:6},(_,i)=>field('J'+(i+1),'robot.joints.'+i,-165,165,1,true)).join('')}</div>${field('Light intensity','light.intensity',0,1,.01,true)}<div class="readout" id="light-readout"></div>${vector('Target','robot.target')}<div class="triple"><label>AZ °<input aria-label="Light azimuth" data-polar="azimuth" type="number" min="-180" max="180" step="1"></label><label>EL °<input aria-label="Light elevation" data-polar="elevation" type="number" min="-90" max="90" step="1"></label><label>DIST m<input aria-label="Light distance" data-polar="distance" type="number" min=".1" max="2" step=".01"></label></div><p class="hint">Polar controls move the target; the attached light follows the joints.</p>`,true)}
${section('Motion study',`<select id="motion-preset" aria-label="Motion preset"><option value="" disabled selected>Choose a motion study…</option>${motionPresets.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('')}</select><div class="transport"><button data-action="play" class="primary">▶ Play</button><button data-action="pause">Ⅱ Pause</button><button data-action="stop">■ Stop</button></div>${select('Path','motion.mode',motionOptions)}${field('Phase','motion.phase',0,1,.001,true)}${field('Speed ×','motion.speed',.1,2,.05,true)}<div class="two">${field('Duration s','motion.duration',5,600,1)}${field('Radius m','motion.radius',.05,2,.01)}${field('Amplitude','motion.amplitude',0,2,.01)}${field('Height m','motion.height',.2,2.4,.01)}</div>${vector('Centre','motion.center')}${select('Loop','motion.loop',['loop','once','pingpong'])}${select('Easing','motion.easing',['linear','sine','smooth'])}${field('Smoothing s','motion.smoothing',0,2,.05)}${select('Direction','motion.direction',['1','-1'])}<label class="stack">Keyframes · world XYZ<textarea id="keyframes" aria-label="Keyframe coordinates" rows="3"></textarea></label><div class="two"><button data-action="key-add">+ Current target</button><button data-action="key-apply">Apply points</button></div>`,true)}

</aside>
<main><div class="viewport-toolbar"><div class="view-buttons">${['PERSPECTIVE','TOP','FRONT','SIDE','LISTENER'].map((v,i)=>`<button data-view="${v}" ${i===0?'class="active"':''}>${v==='PERSPECTIVE'?'3D':v}</button>`).join('')}</div><button data-action="focus">Focus selection</button></div><div id="viewport"><div class="scene-caption"><h2>CORE / SPATIAL STUDY</h2><p>16 wall speakers + 1 arm speaker + sub · dimensions in metres</p></div><div id="scene-loading">Preparing WebGL…</div><div class="scene-legend"><span class="mint">● Sound source</span><span class="gold">● Light / target</span><span class="purple">● Listener</span></div></div>
<div class="monitoring"><div><span class="eyebrow">HEADPHONE MONITORING / DSP IN MAX</span><div class="mode-buttons"><button data-mode="direct" class="active">A · Direct binaural</button><button data-mode="virtualspeakers">B · Virtual speakers</button></div></div><div id="mode-diagram" class="mode-diagram"></div><span id="mode-ack" class="hint">Max not confirmed</span></div></main>
<aside class="right"><div class="panel-title">SPATIAL SCENE <span>02</span></div>
${section('Scene labels',`<label class="stack" for="name-size">Name size · px</label><div class="name-size-controls"><input id="name-size" aria-label="Scene name size" type="range" min="0.1" max="18" step="0.1" value="6"><input id="name-size-number" aria-label="Scene name size in pixels" type="number" min="0.1" max="18" step="0.1" value="6"></div><p class="hint">Channel and object names · 0.1–18 px.<br>Saved on this browser. Dimension text stays unchanged.</p>`,true)}
${section('Selected object',`<div id="selection"></div>`,true)}
${section('Sound sources',`<div id="source-list" class="object-list"></div><div class="two"><button data-action="source-add">+ Add source</button><button data-action="source-remove">− Remove selected</button></div><p class="hint">1–8 visual sources; the main Max engine has 4 voices. Dragging releases position mappings.</p>`,true)}
${section('Loudspeakers & listener',`${check('Lock speakers','speakersLocked')}<div id="speaker-list" class="object-list"></div><button data-action="select-listener">Edit listener / reference</button><p class="hint">CH1–4 rear · CH5–8 front · CH9–12 right · CH13–16 left · CH17 on arm.<br>SUB1 is a visual placeholder; A/B uses 17 directional feeds.</p>`)}
${section('Speaker construction',`<p class="hint">Eminence ALPHA4-8 · Ø116.1 mm. Custom baffle and cabinet sizes remain unconfirmed. Arrangement parameters rebuild the 16 wall positions.</p>${field('Driver diameter m','speakerSetup.driverDiameter',.05,.3,.0001)}${field('Driver depth m','speakerSetup.driverDepth',.01,.3,.001)}${field('Baffle width m','speakerSetup.baffleWidth',.12,.6,.01)}${field('Baffle height m','speakerSetup.baffleHeight',.12,.6,.01)}${field('Baffle depth m','speakerSetup.baffleDepth',.01,.5,.01)}${field('Wall inset m','speakerSetup.wallInset',.02,.8,.01)}${field('Horizontal pair spacing m','speakerSetup.spacing',.3,10,.1)}${field('Lower tier height m','speakerSetup.lowerHeight',.2,6,.1)}${field('Upper tier height m','speakerSetup.upperHeight',.3,10,.1)}${vector('CH17 offset (world XYZ)','speakerSetup.armOffset')}<p class="hint">CH17 follows the robot end effector. Its offset is adjustable; no speaker hardware is controlled.</p>${field('Sub width m','speakerSetup.subWidth',.1,1,.001)}${field('Sub depth m','speakerSetup.subDepth',.1,1,.001)}${field('Sub height m','speakerSetup.subHeight',.1,1,.001)}`)}
${section('Shadow / Spat mapping',`<p class="eyebrow">CURRENT PROPOSAL</p>${['centroid','area','penumbra'].map(k=>mappingRow(k)).join('')}<p class="eyebrow experimental">EXPERIMENTAL</p>${['density','entropy','rotation','lightDistance'].map(k=>mappingRow(k)).join('')}<p class="hint">Enabled mappings own their target. OFF releases it at its current value. Distance from light overrides density if both are enabled.</p>`,true)}
${section('Shadow features',`<p class="hint warning">Scene-derived or manual features. Enable “Use analysis from above” to follow the current Core Web analysis.</p>${select('Features','shadow.mode',['derived','manual'])}${vector('Centroid','shadow.centroid')}${['area','penumbra','density','entropy'].map(k=>field(k[0].toUpperCase()+k.slice(1),'shadow.'+k,0,1,.01,true)).join('')}`)}
${section('Experiments / presets',`<input id="preset-name" aria-label="Preset name" placeholder="Name this experiment" maxlength="80"><div class="two"><button data-action="preset-save">Save preset</button><button data-action="scene-reset">Reset scene</button></div><select id="preset-library" aria-label="Saved preset"></select><div class="two"><button data-action="preset-load">Load</button><button data-action="preset-delete">Delete</button></div><div class="two"><button data-action="presets-export">Export JSON</button><button data-action="presets-import">Import JSON</button></div><input type="file" id="presets-file" accept=".json" hidden>`)}
${section('OSC connection',`<label class="stack">WebSocket URL<input id="ws-url" value="${connectionDefaults.wsUrl}"></label><div class="two"><button data-action="connect">Connect</button><button data-action="disconnect">Disconnect</button></div><label class="stack">Max host<input id="max-host" value="${connectionDefaults.maxHost}"></label><div class="two"><label class="stack">Max receive UDP<input id="max-receive" type="number" value="${connectionDefaults.maxReceivePort}"></label><label class="stack">Max send UDP<input id="max-send" type="number" value="${connectionDefaults.maxSendPort}"></label></div><button data-action="osc-config">Apply bridge ports</button><p class="hint">Also change the matching ports in the Max companion. WebSocket online does not mean Max is online.</p>`)}
</aside></div>
<footer><div class="timeline"><span class="eyebrow">AUTOMATION</span><button data-action="record">● Record</button><button data-action="replay">▶ Playback</button><button data-action="record-stop">■ Stop</button><span id="record-status">No recording</span><button data-action="record-export">Export</button><button data-action="record-import">Import</button><input type="file" id="record-file" accept=".json" hidden></div><details class="osc-panel"><summary>OSC monitor <span id="rate">0 msg/s</span></summary><button data-action="osc-clear">Clear</button><div class="two"><div id="last-out"></div><div id="last-in"></div></div><pre id="osc-log"></pre></details></footer><div id="toast" role="status"></div><dialog id="info-modal" aria-labelledby="info-title"><div class="info-top"><h2 id="info-title">ABOUT THIS PROTOTYPE</h2><button data-action="info-close" aria-label="Close information">×</button></div><p><strong>De-symmetrical Core</strong><br>Artist: Keigo Yoshida<br>Original spatial audio prototype: <a href="https://github.com/gllmp" target="_blank" rel="noopener noreferrer">Guillaume Piccarreta</a><br>Based on <a href="https://github.com/gllmp/desymmetrical-adaptation" target="_blank" rel="noopener noreferrer">gllmp/desymmetrical-adaptation</a><br>Core adaptation: Keigo Yoshida · <a href="https://github.com/keigoyoshida7/desymmetrical-core" target="_blank" rel="noopener noreferrer">Source code</a></p><div class="info-grid"><section><h3>NAVIGATION</h3><p>Drag to orbit · scroll to zoom. Use the view buttons for perspective, top, front and side. Select objects in the scene or interface; drag their axes to edit.</p><h3>INSTALLATION</h3><p>Volcanic stone, acrylic shell, robot arm, directional light preview, listener/reference point and 16 wall speakers, one arm-mounted speaker and a subwoofer placeholder.</p><h3>ROBOT / LIGHT</h3><p>Adjust joints manually or choose a movement preset. Control speed and play / pause / stop. Move the light target around the stone and adjust intensity.</p><p>This is a visual prototype, not a robot safety controller.</p></section><section><h3>SPATIAL AUDIO</h3><p>Use the Core version of the Max patch from this repository. The local version communicates with IRCAM Spat 5 in Max: source position, distance, spread and room/reverberation.</p><h3>SHADOW MAPPING</h3><p>Centroid → position<br>Area → spread<br>Penumbra → reverberation</p><p>Experimental relationships, not final mappings. The optional feed uses analyzed shadow values from the interface above.</p><h3>HEADPHONE MONITORING</h3><p><strong>DIRECT BINAURAL</strong><br>Spat renders sources directly for headphones.</p><p><strong>VIRTUAL SPEAKERS</strong><br>Spat renders seventeen directional loudspeaker feeds; spat5.virtualspeakers~ simulates those speakers binaurally.</p></section></div><h3>SPECIFICATION / ASSUMPTIONS</h3><p>Imported from the earlier Core spatial study: provisional 7 × 7 × 7 m enclosure, 5.4 m blackout walls, 16 wall speakers + 1 arm speaker + 1 sub, and trapezoidal acrylic with a 32.5° slope. Dimensions and generic robot geometry remain editable planning assumptions. This scene has 1–8 visual sources and does not replace the 30 + 1 layers or the browser audio above.</p><h3>OSC / WEB PREVIEW</h3><p>With the local bridge and Max connected, interaction controls Spat in real time. Without OSC, the visual scene and all its controls remain usable in DEMO MODE. This spatial editor does not produce audio; use the listening controls above. For reliable audio control, run the downloaded project locally and open its localhost URL. Public HTTPS pages may block local bridge access.</p></dialog>`;

initSpatialLocale(app);
setSpatialLanguage(new URLSearchParams(location.search).get('lang') === 'ja' ? 'ja' : 'en');

function mappingRow(k:string){const labels:Record<string,string>={centroid:'Centroid → XYZ',area:'Area → spread',penumbra:'Penumbra → room presence',density:'Density → distance',entropy:'Entropy → envelopment',rotation:'Light azimuth → rotation',lightDistance:'Light distance → source distance'};return `<div class="mapping">${check(labels[k],'mappings.'+k+'.enabled')}<div class="mapping-range"><span>OUT</span><input aria-label="${labels[k]} minimum" data-path="mappings.${k}.min" type="number" min="-360" max="360" step=".1"><span>→</span><input aria-label="${labels[k]} maximum" data-path="mappings.${k}.max" type="number" min="-360" max="360" step=".1"></div><div class="hint" data-mapping-readout="${k}"></div></div>`;}
document.querySelector('.viewport-toolbar')?.insertAdjacentHTML('afterbegin','<button id="edit-mode" data-action="edit-mode" aria-pressed="false">EDIT OFF</button>');
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let scene:InstallationScene;
try{scene=new InstallationScene($('viewport'),store,selectionUI);$('scene-loading').remove();}catch(e){$('scene-loading').textContent='WebGL unavailable: '+(e as Error).message;throw e;}
const nameSizeKey='desymmetrical.core-web.spatial-name-size.v1';let nameSize=6;
function updateNameSize(value:number){nameSize=Math.round(clamp(value,.1,18)*10)/10;scene.setNameSize(nameSize);for(const id of ['name-size','name-size-number'])($(id) as HTMLInputElement).value=String(nameSize);}
try{const saved=localStorage.getItem(nameSizeKey);if(saved!==null&&saved.trim()!==''&&Number.isFinite(Number(saved)))nameSize=Number(saved);}catch{/* The control works even when browser storage is unavailable. */}
updateNameSize(nameSize);
for(const id of ['name-size','name-size-number']){
 const input=$(id) as HTMLInputElement;
 input.addEventListener('input',()=>{const value=input.valueAsNumber;if(!input.validity.valid||!Number.isFinite(value))return;updateNameSize(value);try{localStorage.setItem(nameSizeKey,String(nameSize));}catch{/* Keep the current session setting. */}});
 input.addEventListener('change',()=>updateNameSize(nameSize));
}
const osc=new OscClient(store,connectionUI);
function get(path:string):unknown{return path.split('.').reduce((o,k)=>(o as Record<string,unknown>|undefined)?.[k],store.state as unknown);}
function put(path:string,v:unknown){const keys=path.split('.');const s=structuredClone(store.state);{let o=s as unknown as Record<string,unknown>;for(const k of keys.slice(0,-1))o=o[k] as Record<string,unknown>;o[keys.at(-1)!]=v;
 if(path.startsWith('robot.joints')){s.robot.control='joints';s.motion.playing=false;}
 if(path.startsWith('robot.target')){s.robot.control='target';s.motion.playing=false;}
 if(path.startsWith('shadow.')&&path!=='shadow.mode')s.shadow.mode='manual';
 if(path.startsWith('shadow')||path.startsWith('mappings')||path==='light.intensity')applyMappings(s);
 if(path.startsWith('sources.')&&path.endsWith('spread'))s.mappings.area.enabled=false;
 if(path.startsWith('sources.')&&path.endsWith('room'))s.mappings.penumbra.enabled=false;
 if(path.startsWith('sources.')&&path.endsWith('env'))s.mappings.entropy.enabled=false;
 if(path.startsWith('sources.')&&path.includes('position')){for(const k of ['centroid','density','rotation','lightDistance'] as const)s.mappings[k].enabled=false;}
 if(path==='motion.phase'||path==='motion.mode'){s.robot.target=motionPosition(s.motion);s.robot.control='target';}
 if(['speakerSetup.wallInset','speakerSetup.spacing','speakerSetup.lowerHeight','speakerSetup.upperHeight'].includes(path))resetWallSpeakers(s);
 }validateScene(s);store.change(current=>Object.assign(current,s));if(path.startsWith('motion'))previewPath();}
app.addEventListener('input',e=>{const el=e.target as HTMLInputElement;if(!el.dataset.path)return;const v=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?(el.dataset.path==='motion.direction'?Number(el.value):el.value):Number(el.value);if(typeof v==='number'&&(!Number.isFinite(v)||el.value===''))return;if(typeof v==='number'&&(v<Number(el.min)||v>Number(el.max))&&el.tagName!=='SELECT')return;try{put(el.dataset.path,v);}catch(err){toast((err as Error).message,true);}});
app.addEventListener('change',async e=>{const el=e.target as HTMLInputElement;try{
 if(el.dataset.polar){const p=spherical(store.state.robot.target.map((v,i)=>v-store.state.stone.position[i]) as Vec3);const n=Number(el.value);if(!Number.isFinite(n)||el.value==='')throw Error('Enter a finite light coordinate');p[el.dataset.polar as keyof typeof p]=clamp(n,Number(el.min),Number(el.max));const v=cartesian(p.azimuth,p.elevation,p.distance).map((v,i)=>v+store.state.stone.position[i]) as Vec3;store.change(s=>{s.robot.control='target';s.robot.target=v;s.motion.playing=false;});}
 if(el.dataset.sourcePolar){const src=store.state.sources.find(v=>String(v.id)===scene.selected.id)!;const p=spherical(relative(src.position,store.state.listener)),k=el.dataset.sourcePolar as keyof typeof p,n=Number(el.value);if(!Number.isFinite(n)||el.value==='')throw Error('Enter a finite source coordinate');p[k]=clamp(n,k==='distance'?.35:k==='elevation'?-90:-180,k==='distance'?8:k==='elevation'?90:180);store.change(s=>{src.position=absolute(cartesian(p.azimuth,p.elevation,p.distance),s.listener);for(const k of ['centroid','density','rotation','lightDistance']as const)s.mappings[k].enabled=false;});}
 if(el.id==='motion-preset'){store.change(s=>setMotionPreset(s,+el.value));osc.motionPreset(motionPresets[+el.value].name);previewPath();}
 if(el.id==='presets-file'&&el.files?.[0]){presets=parsePresets(await readJSON(el.files[0]));savePresets(presets);presetUI();toast('Preset library imported.');el.value='';}
 if(el.id==='record-file'&&el.files?.[0]){recorder.stop();recorder.frames=parseRecording(await readJSON(el.files[0]));toast('Automation imported.');el.value='';}
}catch(err){toast((err as Error).message,true);}});
app.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('button');if(!b)return;try{
 if(b.dataset.view){scene.view(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',(x as HTMLElement).dataset.view===b.dataset.view));}
 if(b.dataset.mode)store.change(s=>s.monitoring=b.dataset.mode as SceneState['monitoring']);
 if(b.dataset.source)scene.setSelection({kind:'source',id:b.dataset.source});
 if(b.dataset.speaker)scene.setSelection({kind:'speaker',id:b.dataset.speaker});
 const a=b.dataset.action;
 if(a==='edit-mode'){const enabled=!scene.editMode;scene.setEditMode(enabled);b.textContent=enabled?'EDIT ON':'EDIT OFF';b.setAttribute('aria-pressed',String(enabled));b.classList.toggle('active',enabled);}
 if(a==='info')($('info-modal') as HTMLDialogElement).showModal();
 if(a==='info-close')($('info-modal') as HTMLDialogElement).close();
 if(a==='play')store.change(s=>{if(s.motion.mode==='MANUAL')s.motion.mode='ORBIT';s.motion.playing=true;s.robot.control='target';});
 if(a==='pause')store.change(s=>{s.motion.playing=false;s.robot.control='joints';});
 if(a==='stop'){store.change(s=>{s.motion.playing=false;s.motion.phase=0;s.robot.target=motionPosition(s.motion);});osc.motionStop();}
 if(a==='focus')scene.focus();
 if(a==='face-entrance'){store.change(faceEntrance);toast('Acrylic front and stone aligned toward the entrance.');}
 if(a==='center-support'){store.change(centerSupportOverAcrylic);toast('Vertical ceiling support centred over the acrylic.');}
 if(a==='focus-acrylic'){scene.setSelection({kind:'shell',id:'shell'});scene.focus();}
 if(a==='key-add'){store.change(s=>{if(s.motion.keyframes.length>=64)throw Error('Maximum 64 points');s.motion.keyframes.push([...s.robot.target]);});previewPath();}
 if(a==='key-apply'){const points=JSON.parse(($('keyframes') as HTMLTextAreaElement).value);if(!Array.isArray(points)||points.length<2||points.length>64||!points.every(v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=5)))throw Error('Use 2–64 arrays of three metre coordinates.');store.change(s=>{s.motion.keyframes=points;s.motion.mode='KEYFRAMES';s.motion.phase=0;s.robot.control='target';});previewPath();}
 if(a==='source-add'){store.change(s=>{const max=osc.connected&&Date.now()-osc.maxSeen<7000?osc.maxSources:8;if(s.sources.length>=max)throw Error('This Max engine supports '+max+' sources');s.sources.push({id:s.sources.length+1,position:[-.3,.2,1],spread:20,room:35,env:25});});listsUI();scene.setSelection({kind:'source',id:String(store.state.sources.length)});}
 if(a==='source-remove'){if(scene.selected.kind!=='source')throw Error('Select a sound source first');store.change(s=>{if(s.sources.length<=1)throw Error('Keep at least one source');s.sources=s.sources.filter(x=>String(x.id)!==scene.selected.id).map((x,i)=>({...x,id:i+1}));});listsUI();scene.setSelection({kind:'source',id:'1'});}
 if(a==='select-listener')scene.setSelection({kind:'listener',id:'listener'});
 if(a==='reset-layout'){store.change(s=>resetWallSpeakers(s));toast('Core wall layout recalculated.');}
 if(a==='scene-reset'){recorder.stop();store.replace(defaults());listsUI();selectionUI();previewPath();}
 if(a==='preset-save'){const name=($('preset-name') as HTMLInputElement).value.trim();if(!name)throw Error('Name this experiment first');const p={name,scene:structuredClone(store.state)};const i=presets.findIndex(x=>x.name===name);if(i>=0)presets[i]=p;else presets.push(p);savePresets(presets);presetUI();toast('Experiment saved locally.');}
 const index=Number(($('preset-library') as HTMLSelectElement).value);
 if(a==='preset-load'){if(!presets[index])throw Error('Choose a saved preset');recorder.stop();store.replace(presets[index].scene);store.change(s=>s.motion.playing=false);listsUI();selectionUI();previewPath();}
 if(a==='preset-delete'){if(presets[index])presets.splice(index,1);savePresets(presets);presetUI();}
 if(a==='presets-export')download('desymmetrical-core-presets.json',presets);
 if(a==='presets-import')$('presets-file').click();
 if(a==='record'){recorder.record();toast('Recording scene parameters at 10 Hz.');}
 if(a==='replay'){store.change(s=>s.motion.playing=false);recorder.play();}
 if(a==='record-stop')recorder.stop();
 if(a==='record-export'){if(recorder.frames.length<2)throw Error('Record at least two frames first');download('desymmetrical-core-automation.json',{version:2,edition:'core',frames:recorder.frames});}
 if(a==='record-import')$('record-file').click();
 if(a==='connect')osc.connect(($('ws-url') as HTMLInputElement).value);
 if(a==='disconnect')osc.disconnect();
 if(a==='sync'){osc.sync();toast(osc.connected?'Scene sent. Check Max acknowledgement.':'Bridge offline. Connect a local bridge in OSC connection.');}
 if(a==='osc-clear')osc.clear();
 if(a==='osc-config')osc.configure({maxHost:($('max-host') as HTMLInputElement).value,maxReceivePort:Number(($('max-receive') as HTMLInputElement).value),maxSendPort:Number(($('max-send') as HTMLInputElement).value)});
 refreshUI();
}catch(err){toast((err as Error).message,true);}});
function selectionUI(){if(!scene)return;const sel=scene.selected,s=store.state;if(sel.kind==='source'&&!s.sources.some(src=>String(src.id)===sel.id)){scene.setSelection({kind:'source',id:String(s.sources[0].id)});return;}let html=`<h3>${esc(sel.kind==='source'?'SOURCE '+sel.id:sel.id.toUpperCase())}</h3>`;
 if(sel.kind==='source'){const i=s.sources.findIndex(x=>String(x.id)===sel.id);if(i<0)return;html+=vector('Source position','sources.'+i+'.position')+`<div class="triple">${['azimuth','elevation','distance'].map(k=>`<label>${k==='distance'?'DIST m':k.slice(0,2).toUpperCase()+' °'}<input aria-label="Source ${k}" data-source-polar="${k}" type="number" step=".1"></label>`).join('')}</div>`+field('Spread %','sources.'+i+'.spread',0,100,1,true)+field('Room presence','sources.'+i+'.room',0,85,1,true)+field('Envelopment','sources.'+i+'.env',0,85,1,true);}
 else if(sel.kind==='speaker'){const i=s.speakers.findIndex(x=>x.id===sel.id);html+=s.speakersLocked||s.speakers[i].role==='arm'?'<p class="hint">Unlock speakers to edit or drag.</p>':vector(sel.id,'speakers.'+i+'.position');html+='<p class="hint">'+(s.speakers[i].role==='arm'?'CH17 follows the end effector. Edit its offset under Speaker construction.':s.speakers[i].role==='sub'?'Subwoofer placeholder. Bass management is not implemented.':'Round ALPHA4-8 driver in a provisional custom baffle. Coordinates in metres.')+'</p>';}
 else if(sel.kind==='listener')html+=vector('Listener','listener.position')+field('Yaw ° CW','listener.yaw',-180,180,1);
 else if(sel.kind==='target')html+=vector('Light target','robot.target');
 else if(sel.kind==='light')html+='<p class="hint">Light attached to the robot end effector. The visual spotlight aims at the stone.</p>'+field('Light intensity','light.intensity',0,1,.01,true)+vector('Target','robot.target');
 else if(sel.kind==='stone')html+='<p class="hint">Procedural Asama stone proxy. Edit size, position and orientation under Stone & suspended arm. Values are provisional; this is not a scan.</p>';
 else if(sel.kind==='shell')html+='<p class="hint">Trapezoidal base and top with 32.5° slope. Edit dimensions in Acrylic. Sizes are assumptions; the surface is not an optical simulation.</p>';
 else html+='<p class="hint">Six serial joints; light attached to the end effector. Joint controls are in the left panel.</p>';
 $('selection').innerHTML=html;if(sel.kind==='source')osc.selectSource(Number(sel.id));refreshUI();}
function listsUI(){$('source-list').innerHTML=store.state.sources.map(x=>`<button data-source="${x.id}">S${x.id}</button>`).join('');$('speaker-list').innerHTML=store.state.speakers.map(x=>`<button data-speaker="${x.id}">${x.id}</button>`).join('');}
function presetUI(){$('preset-library').innerHTML=presets.length?presets.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join(''):'<option>No saved experiments</option>';}
function connectionUI(){if(!osc)return;osc.pendingSelection=null;const live=Date.now()-osc.maxSeen<7000;$('connection').textContent=osc.connected&&live?'OSC — CONNECTED':'OSC — DISCONNECTED';$('connection').classList.toggle('online',osc.connected&&live);$('rate').textContent=osc.rate+' msg/s';$('last-out').textContent='OUT '+osc.lastOut;$('last-in').textContent='IN '+osc.lastIn;$('osc-log').textContent=osc.log.join('\n');$('mode-ack').textContent=live?'Max: '+osc.ackedMode+' · master '+osc.masterState:'WEB PREVIEW · all scene controls available · audio requires local Max + Spat';if(osc.error&&osc.connected)$('mode-ack').textContent=osc.error;}
function refreshUI(){const s=store.state;for(const el of app.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-path]')){if(document.activeElement===el)continue;const v=get(el.dataset.path!);if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=Boolean(v);else el.value=typeof v==='number'?String(+v.toFixed(3)):String(v);}
 for(const el of app.querySelectorAll<HTMLOutputElement>('[data-value]'))el.textContent=Number(get(el.dataset.value!)).toFixed(2);
 const pol=spherical(s.robot.target.map((v,i)=>v-s.stone.position[i]) as Vec3);for(const el of app.querySelectorAll<HTMLInputElement>('[data-polar]'))if(document.activeElement!==el)el.value=pol[el.dataset.polar as keyof typeof pol].toFixed(2);
 const src=s.sources.find(x=>String(x.id)===scene?.selected.id);if(scene?.selected.kind==='source'&&src){const polar=spherical(relative(src.position,s.listener));for(const el of app.querySelectorAll<HTMLInputElement>('[data-source-polar]'))if(document.activeElement!==el)el.value=polar[el.dataset.sourcePolar as keyof typeof polar].toFixed(2);}
 const first=s.sources[0],polSrc=spherical(relative(first.position,s.listener)),lightPolar=spherical(s.light.position.map((v,i)=>v-s.stone.position[i]) as Vec3);
 const readouts:Record<string,string>={centroid:s.shadow.centroid.map(v=>v.toFixed(2)).join(' / ')+' → '+first.position.map(v=>v.toFixed(2)).join(' / ')+' m',area:s.shadow.area.toFixed(2)+' → '+first.spread.toFixed(1)+' %',penumbra:s.shadow.penumbra.toFixed(2)+' → '+first.room.toFixed(1),density:s.shadow.density.toFixed(2)+' → '+polSrc.distance.toFixed(2)+' m',entropy:s.shadow.entropy.toFixed(2)+' → '+first.env.toFixed(1),rotation:lightPolar.azimuth.toFixed(1)+'° → S1 '+polSrc.azimuth.toFixed(1)+'°',lightDistance:lightPolar.distance.toFixed(2)+' m → '+polSrc.distance.toFixed(2)+' m'};
 for(const el of app.querySelectorAll<HTMLElement>('[data-mapping-readout]'))el.textContent=readouts[el.dataset.mappingReadout!];
 const err=distance(s.light.position,s.robot.target);$('light-readout').textContent='LIGHT XYZ  '+s.light.position.map(v=>v.toFixed(2)).join(' / ')+(s.robot.control==='target'?'\nTARGET ERROR  '+(err*1000).toFixed(0)+' mm'+(err>.12?' · target may be out of reach':''):'');
 document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',(x as HTMLElement).dataset.mode===s.monitoring));$('mode-diagram').innerHTML=s.monitoring==='direct'?'SOURCES <b>→</b> SPAT / HRTFs <b>→</b> HEADPHONES':'SPAT <b>→</b> 17 SPEAKER FEEDS <b>→</b> HRIR <b>→</b> L / R';
 const plan=acrylicPlan(s.acrylic),xs=plan.top.map(v=>v[0]),ys=plan.top.map(v=>v[1]);$('acrylic-readout').textContent='TOP ENVELOPE  '+(Math.max(...xs)-Math.min(...xs)).toFixed(3)+' × '+(Math.max(...ys)-Math.min(...ys)).toFixed(3)+' m\nWorking dimensions · confirm fabrication';
 $('record-status').textContent=`${recorder.mode.toUpperCase()} · ${recorder.frames.length} frames · ${recorder.time.toFixed(1)} s`;
}
let toastTimer=0;function toast(message:string,error=false){$('toast').textContent=message;$('toast').className='show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').className='',5000);}
function previewPath(){const m=structuredClone(store.state.motion);scene.setPath(Array.from({length:121},(_,i)=>{m.phase=i/120;return motionPosition(m);}));($('keyframes') as HTMLTextAreaElement).value=JSON.stringify(store.state.motion.keyframes);}
let priorLocks=store.state.speakersLocked,priorSources=store.state.sources.length;
store.subscribe((s)=>{if(s.speakersLocked!==priorLocks){priorLocks=s.speakersLocked;selectionUI();}if(s.sources.length!==priorSources){priorSources=s.sources.length;listsUI();selectionUI();}});
store.state.light.position=forward(store.state).tip;synchronizeArmSpeaker(store.state);applyMappings(store.state);scene.update(store.state);listsUI();presetUI();selectionUI();previewPath();refreshUI();
let spatialVisible = window.parent === window;
let previousShadow = structuredClone(store.state.shadow);
const followAnalysis = $('follow-analysis') as HTMLInputElement;
function updateFollowControls() {
 for (const input of app.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-path^="shadow."]')) input.disabled = followAnalysis.checked;
}
followAnalysis.addEventListener('change', () => {
 if(followAnalysis.checked) {
  previousShadow=structuredClone(store.state.shadow);
  $('analysis-feed-status').textContent='Waiting for analysis…';
 } else {
  store.change(s=>{s.shadow=structuredClone(previousShadow);applyMappings(s);},'system');
  $('analysis-feed-status').textContent='Scene simulation';
 }
 updateFollowControls();
});
window.addEventListener('message', event => {
 if(event.source!==window.parent||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;
 const message=event.data;
 if(message.type==='core-spatial-language' && ['ja','en'].includes(message.language)) setSpatialLanguage(message.language);
 if(message.type==='core-spatial-visibility' && typeof message.visible==='boolean') spatialVisible=message.visible;
 if(message.type==='core-analysis'&&followAnalysis.checked) {
  if(recorder.mode==='play'){$('analysis-feed-status').textContent='Recorded scene playback';return;}
  const feed=validateAnalysisFeed(message.payload);
  if(!feed){$('analysis-feed-status').textContent='Waiting for analysis…';return;}
  if(!feed.running&&!feed.fixed){$('analysis-feed-status').textContent='Input stopped';return;}
  store.change(s=>{applyAnalysisFeed(s,feed);applyMappings(s);},'system');
  const labels={demo:'Test signal · linked',camera:'Camera analysis · linked',file:'File analysis · linked'};
  $('analysis-feed-status').textContent=labels[feed.source]+(feed.fixed?' · frozen':'');
  updateFollowControls();
 }
});
let priorHeight=0;
function reportHeight(){
 if(window.parent===window)return;
 const height=Math.ceil(app.getBoundingClientRect().height);
 if(height!==priorHeight){priorHeight=height;window.parent.postMessage({type:'core-spatial-resize',height},location.origin);}
}
new ResizeObserver(reportHeight).observe(app);
window.addEventListener('pagehide',()=>osc.disconnect());
if(window.parent!==window)window.parent.postMessage({type:'core-spatial-ready'},location.origin);
reportHeight();
let previous=performance.now();function animate(now:number){const dt=Math.min((now-previous)/1000,.1);previous=now;
 if(document.hidden||!spatialVisible){requestAnimationFrame(animate);return;}
 const replay=recorder.tick(dt,store.state);
 if(replay)store.replace(replay,'playback');
 else {const old=store.state.light.position;advanceMotion(store.state,dt);if(store.state.robot.control==='target')solveTarget(store.state,dt);const tip=forward(store.state).tip;
  if(distance(old,tip)>.00005||store.state.motion.playing){store.state.light.position=tip;applyMappings(store.state);store.change(()=>{},'motion');}
 }
 scene.render();if(now-lastUI>120){refreshUI();lastUI=now;}requestAnimationFrame(animate);}
requestAnimationFrame(animate);
