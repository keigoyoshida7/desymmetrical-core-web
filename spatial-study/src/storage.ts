import {mix,mix3,synchronizeArmSpeaker,validateScene,type SceneState} from './model';
export interface SavedPreset {name:string;scene:SceneState;}
export interface Frame {t:number;scene:SceneState;}
export const PRESET_KEY='desymmetrical.core-web.spatial-presets.v2';
const key=PRESET_KEY;
export function loadPresets():SavedPreset[]{try{return parsePresets(JSON.parse(localStorage.getItem(key)||'[]'));}catch{return [];}}
export function parsePresets(v:unknown):SavedPreset[]{if(!Array.isArray(v)||v.length>40)throw Error('Expected at most 40 presets.');return v.map(x=>{if(!x||typeof x!=='object'||typeof x.name!=='string'||!x.name.trim()||x.name.length>80)throw Error('Invalid preset name');return {name:x.name,scene:validateScene(x.scene)};});}
export function savePresets(v:SavedPreset[]){const clean=parsePresets(v);localStorage.setItem(key,JSON.stringify(clean));}
export function download(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function readJSON(file:File){if(file.size>25_000_000)throw Error('JSON file exceeds 25 MB');return JSON.parse(await file.text());}
export function parseRecording(v:unknown):Frame[]{if(!v||typeof v!=='object'||(v as {version:number}).version!==2||(v as {edition?:string}).edition!=='core')throw Error('Expected a De-symmetrical Core recording (version 2)');const f=(v as {frames:Frame[]}).frames;if(!Array.isArray(f)||f.length<2||f.length>3000)throw Error('Expected 2–3000 frames');let previous=-1;return f.map(x=>{if(!x||typeof x!=='object'||!Number.isFinite(x.t)||x.t<0||x.t<=previous)throw Error('Recording timestamps must strictly increase');previous=x.t;return {t:x.t,scene:validateScene(x.scene)};});}
export function interpolateFrames(frames:Frame[],t:number):SceneState{
 let i=0;while(i<frames.length-2&&frames[i+1].t<t)i++;const a=frames[i],b=frames[i+1],f=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)));
 const s=structuredClone(f===1?b.scene:a.scene);s.motion.playing=false;s.robot.control='joints';
 s.robot.base=mix3(a.scene.robot.base,b.scene.robot.base,f);s.acrylic.position=mix3(a.scene.acrylic.position,b.scene.acrylic.position,f);s.acrylic.yaw=mix(a.scene.acrylic.yaw,b.scene.acrylic.yaw,f);s.stone.position=mix3(a.scene.stone.position,b.scene.stone.position,f);s.stone.yaw=mix(a.scene.stone.yaw,b.scene.stone.yaw,f);
 s.robot.joints=a.scene.robot.joints.map((v,k)=>mix(v,b.scene.robot.joints[k],f));s.robot.target=mix3(a.scene.robot.target,b.scene.robot.target,f);
 s.light.position=mix3(a.scene.light.position,b.scene.light.position,f);s.light.intensity=mix(a.scene.light.intensity,b.scene.light.intensity,f);
 s.listener.position=mix3(a.scene.listener.position,b.scene.listener.position,f);s.listener.yaw=mix(a.scene.listener.yaw,b.scene.listener.yaw,f);
 s.sources.forEach(src=>{const u=a.scene.sources.find(v=>v.id===src.id),v=b.scene.sources.find(v=>v.id===src.id);if(u&&v){src.position=mix3(u.position,v.position,f);src.spread=mix(u.spread,v.spread,f);src.room=mix(u.room,v.room,f);src.env=mix(u.env,v.env,f);}});
 s.speakers.forEach((sp,k)=>sp.position=mix3(a.scene.speakers[k].position,b.scene.speakers[k].position,f));synchronizeArmSpeaker(s);return s;
}
export class Recorder {
 frames:Frame[]=[];mode:'idle'|'record'|'play'='idle';time=0;private sample=-1;
 record(){this.frames=[];this.mode='record';this.time=0;this.sample=-1;}
 play(){if(this.frames.length<2)throw Error('Record or import at least two frames first.');this.mode='play';this.time=0;}
 stop(){this.mode='idle';}
 tick(dt:number,s:SceneState):SceneState|undefined{if(this.mode==='idle')return;this.time+=dt;
  if(this.mode==='record'){if(this.time-this.sample>=.1){this.frames.push({t:this.time,scene:structuredClone(s)});this.sample=this.time;}if(this.frames.length>=3000)this.stop();}
  else{const result=interpolateFrames(this.frames,this.time);if(this.time>=this.frames.at(-1)!.t)this.stop();return result;}
 }
}
