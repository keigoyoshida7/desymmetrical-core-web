export type Vec3 = [number, number, number]; // metres: X right, Y front, Z up
export type Origin = 'ui' | 'motion' | 'osc' | 'playback' | 'system';
export type MotionMode = 'MANUAL'|'CIRCLE'|'ELLIPSE'|'ORBIT'|'FIGURE 8'|'SLOW SCAN'|'PENDULUM'|'RANDOM SMOOTH'|'RANDOM POINTS'|'KEYFRAMES';
export interface Source {id:number;position:Vec3;spread:number;room:number;env:number;}
export interface Speaker {id:string;position:Vec3;role:'wall'|'arm'|'sub';wall:'front'|'rear'|'right'|'left'|'arm'|'floor';}
export interface SpeakerSetup {wallInset:number;spacing:number;lowerHeight:number;upperHeight:number;driverDiameter:number;driverDepth:number;baffleWidth:number;baffleHeight:number;baffleDepth:number;armOffset:Vec3;subWidth:number;subHeight:number;subDepth:number;}
export interface Acrylic {position:Vec3;yaw:number;bottomFrontWidth:number;bottomRearWidth:number;depth:number;height:number;slope:number;thickness:number;}
export interface Mapping {enabled:boolean;min:number;max:number;}
export interface SceneState {
 version:2; edition:'core'; room:{width:number;depth:number;height:number;wallHeight:number;entranceWidth:number;corridorDepth:number};
 speakerSetup:SpeakerSetup; acrylic:Acrylic; stone:{position:Vec3;yaw:number;width:number;depth:number;height:number};
 robot:{joints:number[];control:'joints'|'target';target:Vec3;base:Vec3;mount:'ceiling'|'side'};
 light:{position:Vec3;intensity:number};
 listener:{position:Vec3;yaw:number}; speakers:Speaker[];sources:Source[];
 shadow:{mode:'derived'|'manual';centroid:Vec3;area:number;penumbra:number;density:number;entropy:number};
 mappings:Record<'centroid'|'area'|'penumbra'|'density'|'entropy'|'rotation'|'lightDistance',Mapping>;
 monitoring:'direct'|'virtualspeakers'; speakersLocked:boolean;
 motion:{mode:MotionMode;playing:boolean;phase:number;speed:number;amplitude:number;center:Vec3;radius:number;height:number;duration:number;easing:'linear'|'sine'|'smooth';smoothing:number;direction:1|-1;loop:'loop'|'once'|'pingpong';keyframes:Vec3[]};
}
export const FULL_RANGE_COUNT=17;
export const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export const distance=(a:Vec3,b:Vec3=[0,0,0])=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export const mix3=(a:Vec3,b:Vec3,t:number):Vec3=>a.map((v,i)=>mix(v,b[i],t)) as Vec3;
// PDF v7 specifies driver diameter; cabinet sizes, mounting depth and placement are editable planning assumptions.
export function defaultSpeakerSetup():SpeakerSetup{return {wallInset:.16,spacing:3.5,lowerHeight:1.2,upperHeight:4.2,driverDiameter:.1161,driverDepth:.055,baffleWidth:.16,baffleHeight:.16,baffleDepth:.075,armOffset:[.10,0,-.04],subWidth:.35,subHeight:.41,subDepth:.205};}
export function speakerLayout(room:SceneState['room'],setup:SpeakerSetup=defaultSpeakerSetup()):Speaker[]{
 const x=room.width/2-setup.wallInset,y=room.depth/2-setup.wallInset;
 const dx=Math.min(setup.spacing/2,x-.1),dy=Math.min(setup.spacing/2,y-.1);
 const lower=Math.min(setup.lowerHeight,room.wallHeight-.2),upper=Math.min(setup.upperHeight,room.wallHeight-.1);
 const speakers:Speaker[]=[];
 for(const wall of ['rear','front','right','left'] as const)for(const z of [lower,upper])for(const side of [-1,1]){
  const position:Vec3=wall==='rear'?[side*dx,-y,z]:wall==='front'?[side*dx,y,z]:wall==='right'?[x,side*dy,z]:[-x,side*dy,z];
  speakers.push({id:'CH'+(speakers.length+1),position,role:'wall',wall});
 }
 speakers.push({id:'CH17',position:[.10,0,.96],role:'arm',wall:'arm'});
 speakers.push({id:'SUB1',position:[-x+.2,-y+.2,setup.subHeight/2],role:'sub',wall:'floor'});
 return speakers;
}
// Local plan vertices are clockwise viewed from above, with the long/front edge at +Y.
// The slope is interpreted from horizontal. Exact acrylic dimensions are not supplied by the PDF.
export function acrylicPlan(a:Acrylic):{bottom:Vec3[];top:Vec3[]}{
 const front=a.bottomFrontWidth/2,rear=a.bottomRearWidth/2,halfDepth=a.depth/2;
 const inset=a.height/Math.tan(a.slope*Math.PI/180),sideSlope=(front-rear)/a.depth;
 const sideInset=inset*Math.sqrt(1+sideSlope*sideSlope);
 const topFront=front-sideSlope*inset-sideInset,topRear=rear+sideSlope*inset-sideInset,topDepth=halfDepth-inset;
 return {bottom:[[-front,halfDepth,0],[front,halfDepth,0],[rear,-halfDepth,0],[-rear,-halfDepth,0]],top:[[-topFront,topDepth,a.height],[topFront,topDepth,a.height],[topRear,-topDepth,a.height],[-topRear,-topDepth,a.height]]};
}
export function validAcrylic(a:Acrylic){const p=acrylicPlan(a);return p.top[1][0]>.025&&p.top[2][0]>.025&&p.top[0][1]>.025;}
// Local +Y is the sculpture front; +90° around Three's up axis points it toward the -X entrance.
export const ENTRANCE_YAW=90;
export function faceEntrance(s:SceneState){s.acrylic.yaw=ENTRANCE_YAW;s.stone.yaw=ENTRANCE_YAW;}
// The support runs vertically from the room ceiling to this attachment point.
// Keep the chosen height and pose when re-centring a customised installation.
export function centerSupportOverAcrylic(s:SceneState){s.robot.base=[s.acrylic.position[0],s.acrylic.position[1],s.robot.base[2]];s.robot.mount='ceiling';}
export function synchronizeArmSpeaker(s:SceneState){const arm=s.speakers.find(x=>x.role==='arm');if(arm)arm.position=s.light.position.map((v,i)=>v+s.speakerSetup.armOffset[i]) as Vec3;}
export function defaults():SceneState{
 const room={width:7,depth:7,height:7,wallHeight:5.4,entranceWidth:1.6,corridorDepth:2};const speakerSetup=defaultSpeakerSetup();
 const s:SceneState={version:2,edition:'core',room,speakerSetup,
 acrylic:{position:[0,0,0],yaw:ENTRANCE_YAW,bottomFrontWidth:2.7,bottomRearWidth:1.4,depth:1.4,height:.35,slope:32.5,thickness:.008},
 stone:{position:[0,0,.319/2],yaw:ENTRANCE_YAW,width:.512,depth:.354,height:.319},
 robot:{joints:[90,-35,-65,0,10,0],control:'joints',target:[0,0,.8],base:[0,0,1.85],mount:'ceiling'},
 light:{position:[0,0,1],intensity:.7},listener:{position:[0,2,1.6],yaw:180},speakers:speakerLayout(room,speakerSetup),
 sources:Array.from({length:4},(_,i)=>({id:i+1,position:[-.375+i*.25,.3,.7] as Vec3,spread:20,room:35,env:25})),
 shadow:{mode:'derived',centroid:[0,0,.5],area:.35,penumbra:.3,density:.65,entropy:.3},
 mappings:{centroid:{enabled:true,min:-1,max:1},area:{enabled:true,min:0,max:100},penumbra:{enabled:true,min:15,max:75},density:{enabled:false,min:.5,max:4},entropy:{enabled:false,min:10,max:75},rotation:{enabled:false,min:0,max:360},lightDistance:{enabled:false,min:.5,max:4}},
 monitoring:'direct',speakersLocked:true,motion:{mode:'ORBIT',playing:false,phase:0,speed:1,amplitude:.5,center:[0,0,0],radius:.55,height:.9,duration:60,easing:'linear',smoothing:.3,direction:1,loop:'loop',keyframes:[[-.4,-.25,.8],[.4,.25,1.1],[0,.1,.6]]}};
 synchronizeArmSpeaker(s);return s;
}
export class Store {
 state:SceneState=defaults(); private listeners=new Set<(s:SceneState,origin:Origin)=>void>();
 subscribe(fn:(s:SceneState,o:Origin)=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 change(fn:(s:SceneState)=>void,origin:Origin='ui'){fn(this.state);synchronizeArmSpeaker(this.state);this.listeners.forEach(fn=>fn(this.state,origin));}
 replace(s:SceneState,origin:Origin='ui'){this.state=structuredClone(s);synchronizeArmSpeaker(this.state);this.listeners.forEach(fn=>fn(this.state,origin));}
}
export const toThree=([x,y,z]:Vec3):Vec3=>[x,z,-y];
export const fromThree=([x,y,z]:Vec3):Vec3=>[x,-z,y];
export function relative(p:Vec3,l:SceneState['listener']):Vec3{
 const a=l.yaw*Math.PI/180,x=p[0]-l.position[0],y=p[1]-l.position[1];
 return [Math.cos(a)*x-Math.sin(a)*y,Math.sin(a)*x+Math.cos(a)*y,p[2]-l.position[2]];
}
export function absolute(p:Vec3,l:SceneState['listener']):Vec3{
 const a=l.yaw*Math.PI/180;return [Math.cos(a)*p[0]+Math.sin(a)*p[1]+l.position[0],-Math.sin(a)*p[0]+Math.cos(a)*p[1]+l.position[1],p[2]+l.position[2]];
}
export function spherical(p:Vec3){const d=distance(p);return {azimuth:Math.atan2(p[0],p[1])*180/Math.PI,elevation:Math.atan2(p[2],Math.hypot(p[0],p[1]))*180/Math.PI,distance:d};}
export function cartesian(azimuth:number,elevation:number,d:number):Vec3{const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;return [Math.sin(a)*Math.cos(e)*d,Math.cos(a)*Math.cos(e)*d,Math.sin(e)*d];}
export function validateScene(input:unknown):SceneState {
 if(!input||typeof input!=='object')throw Error('Expected a scene object.');
 const header=input as {version?:number;edition?:string};
 if(header.version!==2||header.edition!=='core')throw Error('This file is not a De-symmetrical Core scene (version 2). Adaptation scenes use a different installation layout.');
 const template=defaults();
 function shape(v:unknown,t:unknown,path:string){
  if(typeof t==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000)throw Error(path+': invalid number');}
  else if(typeof t==='boolean'||typeof t==='string'){if(typeof v!==typeof t)throw Error(path+': invalid type');}
  else if(Array.isArray(t)){if(!Array.isArray(v)||v.length>256)throw Error(path+': invalid array');if(t.length)for(const item of v)shape(item,t[0],path+'[]');}
  else {if(!v||typeof v!=='object')throw Error(path+': invalid object');for(const [k,value] of Object.entries(t as object))shape((v as Record<string,unknown>)[k],value,path+'.'+k);}
 }
 const s=structuredClone(input) as SceneState;
 // Earlier Core v2 presets/recordings had an unrotated stone and no stone yaw field.
 // Preserve that original orientation rather than applying the new default on import.
 if(s.stone&&typeof s.stone==='object'&&!Object.hasOwn(s.stone,'yaw'))s.stone.yaw=0;
 // Earlier Core files extended the first arm link horizontally. Keep their geometry and custom base.
 if(s.robot&&typeof s.robot==='object'&&!Object.hasOwn(s.robot,'mount'))s.robot.mount='side';
 shape(s,template,'scene');
 const ok=(v:boolean,message:string)=>{if(!v)throw Error(message);};
 ok(s.sources.length>=1&&s.sources.length<=8,'Use 1–8 sources');
 ok(s.sources.every((x,i)=>x.id===i+1),'Source IDs must be sequential 1…N');
 ok(s.speakers.length===18&&s.speakers.every((v,i)=>v.id===template.speakers[i].id&&v.role===template.speakers[i].role&&v.wall===template.speakers[i].wall),'Expected Core CH1…CH17 and SUB1 in channel order');
 const v3=(v:Vec3)=>v.length===3&&v.every(n=>Math.abs(n)<=25);
 ok([...s.sources,...s.speakers,s.listener,s.light,s.stone,s.acrylic].every(x=>v3(x.position))&&v3(s.robot.target)&&v3(s.robot.base)&&v3(s.motion.center)&&v3(s.shadow.centroid)&&v3(s.speakerSetup.armOffset),'Invalid XYZ coordinates');
 ok(s.robot.joints.length===6&&s.robot.joints.every(x=>Math.abs(x)<=180),'Expected six joints within ±180°');
 ok(['ceiling','side'].includes(s.robot.mount),'Invalid robot mounting');
 ok(['joints','target'].includes(s.robot.control)&&['derived','manual'].includes(s.shadow.mode),'Invalid control mode');
 ok(['direct','virtualspeakers'].includes(s.monitoring),'Invalid monitoring mode');
 ok(['MANUAL','CIRCLE','ELLIPSE','ORBIT','FIGURE 8','SLOW SCAN','PENDULUM','RANDOM SMOOTH','RANDOM POINTS','KEYFRAMES'].includes(s.motion.mode),'Invalid movement mode');
 ok(['loop','once','pingpong'].includes(s.motion.loop)&&['linear','sine','smooth'].includes(s.motion.easing)&&[1,-1].includes(s.motion.direction),'Invalid playback option');
 ok(s.motion.duration>=5&&s.motion.duration<=600&&s.motion.speed>=0.1&&s.motion.speed<=2&&s.motion.phase>=0&&s.motion.phase<=1,'Invalid duration, speed or phase');
 ok(s.motion.keyframes.length>=2&&s.motion.keyframes.length<=64&&s.motion.keyframes.every(v3),'Use 2–64 XYZ keyframes');
 const r=s.room;
 ok(r.width>=3&&r.width<=20&&r.depth>=3&&r.depth<=20&&r.height>=2&&r.height<=12&&r.wallHeight>=2&&r.wallHeight<=r.height&&r.entranceWidth>=.6&&r.entranceWidth<=r.depth&&r.corridorDepth>=0&&r.corridorDepth<=10,'Invalid room dimensions');
 const a=s.acrylic;
 ok(a.bottomFrontWidth>=.2&&a.bottomFrontWidth<=10&&a.bottomRearWidth>=.2&&a.bottomRearWidth<=10&&a.depth>=.2&&a.depth<=10&&a.height>=.02&&a.height<=5&&a.slope>=5&&a.slope<=85&&Math.abs(a.yaw)<=180&&a.thickness>=.001&&a.thickness<=.05&&validAcrylic(a),'Acrylic top collapses: reduce height, increase slope or enlarge the footprint');
 ok(['width','depth','height'].every(k=>s.stone[k as 'width']>=.05&&s.stone[k as 'width']<=5),'Invalid stone dimensions');
 ok(Math.abs(s.stone.yaw)<=180,'Invalid stone yaw');
 const p=s.speakerSetup;
 ok(p.wallInset>=.05&&p.wallInset<=Math.min(r.width,r.depth)/2-.2&&p.spacing>=.2&&p.spacing<=Math.min(r.width,r.depth)-2*p.wallInset&&p.lowerHeight>=.2&&p.upperHeight>p.lowerHeight&&p.upperHeight<=r.wallHeight,'Invalid wall speaker layout');
 ok(p.driverDiameter>=.05&&p.driverDiameter<=.5&&p.driverDepth>=.01&&p.driverDepth<=.5&&p.baffleWidth>=p.driverDiameter&&p.baffleWidth<=1&&p.baffleHeight>=p.driverDiameter&&p.baffleHeight<=1&&p.baffleDepth>=.01&&p.baffleDepth<=1&&[p.subWidth,p.subHeight,p.subDepth].every(v=>v>=.1&&v<=2)&&p.armOffset.every(v=>Math.abs(v)<=1),'Invalid speaker shape dimensions');
 ok(s.sources.every(x=>x.spread>=0&&x.spread<=100&&x.room>=0&&x.room<=85&&x.env>=0&&x.env<=85),'Spat parameter outside prototype bounds');
 ok(s.light.intensity>=0&&s.light.intensity<=1,'Invalid light intensity');
 ok(['area','penumbra','density','entropy'].every(k=>{const v=s.shadow[k as 'area'];return v>=0&&v<=1;}),'Shadow features must be 0–1');
 ok(s.motion.smoothing>=0&&s.motion.smoothing<=2&&s.motion.radius>=.05&&s.motion.radius<=2&&s.motion.amplitude>=0&&s.motion.amplitude<=2&&s.motion.height>=.2&&s.motion.height<=2.4,'Invalid motion extent');
 for(const m of Object.values(s.mappings))ok(Math.abs(m.min)<=360&&Math.abs(m.max)<=360,'Mapping range too large');
 s.motion.playing=false;synchronizeArmSpeaker(s);return s;
}
