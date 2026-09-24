import type {SceneState} from './model';

export interface AnalysisFeed {
 source:'demo'|'camera'|'file';
 running:boolean;
 fixed:boolean;
 sampleId:string;
 features:{
  area:number;
  darkness:number;
  centroid:[number,number];
  penumbraWidth:number;
  width:number;
  height:number;
  histogram:number[];
 };
}

const record=(value:unknown):value is Record<string,unknown>=>
 !!value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const unit=(value:unknown):value is number=>finite(value)&&value>=0&&value<=1;
const clampUnit=(value:number)=>Math.max(0,Math.min(1,value));

// Accept the message payload only. The embedding UI checks the message origin,
// source window, opt-in state and recording mode before calling this adapter.
export function validateAnalysisFeed(value:unknown):AnalysisFeed|null {
 if(!record(value)||typeof value.source!=='string'||!['demo','camera','file'].includes(value.source)
  ||typeof value.running!=='boolean'||typeof value.fixed!=='boolean'
  ||typeof value.sampleId!=='string'||!value.sampleId.trim()||value.sampleId.length>256
  ||!record(value.features))return null;
 const f=value.features;
 if(!unit(f.area)||!unit(f.darkness)||!Array.isArray(f.centroid)||f.centroid.length!==2
  ||!unit(f.centroid[0])||!unit(f.centroid[1])||!finite(f.width)||!Number.isInteger(f.width)||f.width<1||f.width>16384
  ||!finite(f.height)||!Number.isInteger(f.height)||f.height<1||f.height>16384
  ||f.width*f.height>16_777_216||!finite(f.penumbraWidth)||f.penumbraWidth<0
  ||f.penumbraWidth>Math.hypot(f.width,f.height)
  ||!Array.isArray(f.histogram)||f.histogram.length>256)return null;
 const pixels=f.width*f.height;
 let total=0;
 for(const count of f.histogram){
  if(!finite(count)||!Number.isInteger(count)||count<0||count>pixels)return null;
  total+=count;
  if(total>pixels)return null;
 }
 return {
  source:value.source as AnalysisFeed['source'],running:value.running,fixed:value.fixed,sampleId:value.sampleId,
  features:{area:f.area,darkness:f.darkness,centroid:[f.centroid[0],f.centroid[1]],
   penumbraWidth:f.penumbraWidth,width:f.width,height:f.height,histogram:[...f.histogram]},
 };
}

// These are normalized visual-study mappings, not additional optical or
// acoustic measurements. Image Y points down, so the scene Y is inverted.
// Darkness supplies nonnegative normalized Z/density so the default mapping
// keeps observed sources above the floor; penumbra uses the analysis width.
// The caller may apply its scene mappings afterwards. No sources, speakers,
// audio parameters, motion, persistence or external connections are changed here.
export function applyAnalysisFeed(scene:SceneState,payload:AnalysisFeed):void {
 const f=payload.features;
 const total=f.histogram.reduce((sum,count)=>sum+count,0);
 let entropy=0;
 if(total>0&&f.histogram.length>1){
  for(const count of f.histogram){
   if(count===0)continue;
   const p=count/total;
   entropy-=p*Math.log2(p);
  }
  entropy/=Math.log2(f.histogram.length);
 }
 Object.assign(scene.shadow,{
  mode:'manual',
  centroid:[f.centroid[0]*2-1,1-f.centroid[1]*2,f.darkness],
  area:clampUnit(f.area),density:clampUnit(f.darkness),
  penumbra:clampUnit(f.penumbraWidth/f.width),entropy:clampUnit(entropy),
 });
}
