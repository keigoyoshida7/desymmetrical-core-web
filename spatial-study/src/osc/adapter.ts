import {absolute,clamp,relative,FULL_RANGE_COUNT,synchronizeArmSpeaker,type SceneState,type Vec3} from '../model';
export interface OscMessage {address:string;args:(number|string)[];echo?:boolean;}
// Installed Spat 5.3.9 help/XML paths. Custom installation state is separate.
export const paths={source:(id:number,p:string)=>`/source/${id}/${p}`,speaker:(id:number)=>`/speaker/${id}/xyz`,speakers:'/speakers/xyz',count:'/dotarea/source/count',listener:'/dotarea/listener/xyz',yaw:'/dotarea/listener/yaw',mode:'/dotarea/monitoring/mode',request:'/dotarea/state/request',status:'/dotarea/status',light:'/dotarea/light/xyz',intensity:'/dotarea/light/intensity',target:'/dotarea/light/target/xyz',joint:(i:number)=>`/dotarea/robot/j${i+1}`,shadow:(p:string)=>`/dotarea/shadow/${p}`,sub:'/dotarea/subwoofer/xyz',motion:(key:string)=>`/dotarea/motion/${key}`,master:'/dotarea/master/state',selected:'/dotarea/source/selected',capacity:'/dotarea/capabilities/sources'};
export function sceneMessages(s:SceneState):OscMessage[]{
 synchronizeArmSpeaker(s);
 const out:OscMessage[]=[];const add=(address:string,...args:(number|string)[])=>out.push({address,args});
 add(paths.motion('play'),s.motion.playing?1:0);add(paths.motion('speed'),s.motion.speed);add(paths.motion('preset'),s.motion.mode);
 add(paths.count,s.sources.length);add(paths.listener,...s.listener.position);add(paths.yaw,s.listener.yaw);add(paths.mode,s.monitoring);
 for(const src of s.sources){add(paths.source(src.id,'xyz'),...relative(src.position,s.listener));add(paths.source(src.id,'spread'),src.spread);add(paths.source(src.id,'prer'),src.room);add(paths.source(src.id,'env'),src.env);}
 // Aggregate avoids partial speaker layouts reaching the virtual renderer.
 add(paths.speakers,...s.speakers.slice(0,FULL_RANGE_COUNT).flatMap(p=>relative(p.position,s.listener)));
 add(paths.sub,...s.speakers[FULL_RANGE_COUNT].position);
 s.robot.joints.forEach((v,i)=>add(paths.joint(i),v));add(paths.light,...s.light.position);add(paths.target,...s.robot.target);add(paths.intensity,s.light.intensity);
 add(paths.shadow('centroid'),...s.shadow.centroid);for(const k of ['area','penumbra','density','entropy'] as const)add(paths.shadow(k),s.shadow[k]);
 return out;
}
export class SpatOscAdapter{
 armCorrectionPending=false;
 cache=new Map<string,string>();
 diff(s:SceneState,force=false){const msgs=sceneMessages(s),out=msgs.filter(m=>force||this.cache.get(m.address)!==JSON.stringify(m.args.map(v=>typeof v==='number'?+v.toFixed(4):v)));for(const m of msgs)this.cache.set(m.address,JSON.stringify(m.args.map(v=>typeof v==='number'?+v.toFixed(4):v)));return out;}
 receive(s:SceneState,m:OscMessage):boolean{
  this.armCorrectionPending=false;
  // While the browser transport runs, robot/transport feedback is a snapshot,
  // not a request to take control. Delayed snapshots can outlive bridge echo tags.
  if(s.motion.playing&&(m.address===paths.target||/^\/dotarea\/robot\/j[1-6]$/.test(m.address)||m.address===paths.motion('play')))return false;
  if(m.echo||(m.address!==paths.motion('stop')&&this.cache.get(m.address)===JSON.stringify(m.args.map(v=>typeof v==='number'?+v.toFixed(4):v))))return false;
  const accepted=this.apply(s,m);if(accepted)this.cache.set(m.address,JSON.stringify(m.args.map(v=>typeof v==='number'?+v.toFixed(4):v)));
  if(this.armCorrectionPending){this.cache.delete(paths.speakers);this.cache.delete(paths.speaker(FULL_RANGE_COUNT));}
  return accepted;
 }
 private checkArmCorrection(s:SceneState,incoming:Vec3){
  // CH17 belongs to the end effector. Native speaker editing must not detach it.
  synchronizeArmSpeaker(s);
  this.armCorrectionPending=incoming.some((v,i)=>Math.abs(v-s.speakers[FULL_RANGE_COUNT-1].position[i])>.0001);
 }
 private apply(s:SceneState,m:OscMessage):boolean{
  const nums=m.args.map(Number),finite=nums.length>0&&m.args.every(v=>typeof v==='number'&&Number.isFinite(v)),p=m.address;
  const xyz=()=>nums.slice(0,3) as Vec3;
  const src=/^\/source\/([1-8])\/(xyz|spread|dist|prer|env)$/.exec(p);
  if(src){const v=s.sources.find(v=>v.id===+src[1]);if(!v||!finite||nums.length!==(src[2]==='xyz'?3:1))return false;
   if(src[2]==='xyz'&&nums.length===3){v.position=absolute(xyz(),s.listener);s.mappings.centroid.enabled=false;s.mappings.rotation.enabled=false;s.mappings.density.enabled=false;s.mappings.lightDistance.enabled=false;}
   else if(src[2]==='spread'){v.spread=clamp(nums[0],0,100);s.mappings.area.enabled=false;}
   else if(src[2]==='prer'){v.room=clamp(nums[0],0,85);s.mappings.penumbra.enabled=false;}
   else if(src[2]==='env'){v.env=clamp(nums[0],0,85);s.mappings.entropy.enabled=false;}
   else if(src[2]==='dist'){const pos=relative(v.position,s.listener),d=Math.hypot(...pos)||1;v.position=absolute(pos.map(x=>x*clamp(nums[0],.35,8)/d) as Vec3,s.listener);s.mappings.density.enabled=false;s.mappings.lightDistance.enabled=false;}
   else return false;return true;
  }
  if(p===paths.speakers&&nums.length===FULL_RANGE_COUNT*3&&finite){
   s.speakers.slice(0,FULL_RANGE_COUNT-1).forEach((sp,i)=>sp.position=absolute(nums.slice(i*3,i*3+3) as Vec3,s.listener));
   this.checkArmCorrection(s,absolute(nums.slice((FULL_RANGE_COUNT-1)*3) as Vec3,s.listener));return true;
  }
  const sp=/^\/speaker\/(\d+)\/xyz$/.exec(p);if(sp&&finite&&nums.length===3&&+sp[1]>=1&&+sp[1]<=FULL_RANGE_COUNT){
   if(+sp[1]===FULL_RANGE_COUNT)this.checkArmCorrection(s,absolute(xyz(),s.listener));
   else s.speakers[+sp[1]-1].position=absolute(xyz(),s.listener);return true;
  }
  if(p===paths.listener&&finite&&nums.length===3){s.listener.position=xyz();return true;}
  if(p===paths.yaw&&finite&&nums.length===1){s.listener.yaw=clamp(nums[0],-180,180);return true;}
  if(p===paths.mode&&['direct','virtualspeakers'].includes(String(m.args[0]))){s.monitoring=m.args[0] as SceneState['monitoring'];return true;}
  if(p===paths.count&&finite&&nums.length===1){const n=clamp(Math.round(nums[0]),1,8);while(s.sources.length<n)s.sources.push({id:s.sources.length+1,position:[0,0,1],spread:0,room:35,env:25});s.sources.length=n;return true;}
  const j=/^\/dotarea\/robot\/j([1-6])$/.exec(p);if(j&&finite&&nums.length===1){s.robot.joints[+j[1]-1]=clamp(nums[0],-165,165);s.robot.control='joints';s.motion.playing=false;return true;}
  if(p===paths.intensity&&finite&&nums.length===1){s.light.intensity=clamp(nums[0],0,1);return true;}
  if(p===paths.target&&finite&&nums.length===3){s.robot.target=xyz().map(v=>clamp(v,-5,5)) as Vec3;s.robot.control='target';s.motion.playing=false;return true;}
  if(p===paths.shadow('centroid')&&finite&&nums.length===3){s.shadow.centroid=xyz().map(v=>clamp(v,-1,1)) as Vec3;s.shadow.mode='manual';return true;}
  for(const key of ['area','penumbra','density','entropy'] as const)if(p===paths.shadow(key)&&finite&&nums.length===1){s.shadow[key]=clamp(nums[0],0,1);s.shadow.mode='manual';return true;}
  if(p===paths.sub&&finite&&nums.length===3){s.speakers[FULL_RANGE_COUNT].position=xyz();return true;}
  if(p===paths.motion('speed')&&finite&&nums.length===1){s.motion.speed=clamp(nums[0],.1,2);return true;}
  if(p===paths.motion('play')&&finite&&nums.length===1){s.motion.playing=Boolean(nums[0]);s.robot.control=s.motion.playing?'target':'joints';return true;}
  if(p===paths.motion('stop')&&nums[0]===1){s.motion.playing=false;s.motion.phase=0;s.robot.control='joints';return true;}
  return false;
 }
}
