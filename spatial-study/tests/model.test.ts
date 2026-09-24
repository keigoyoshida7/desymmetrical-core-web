import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
import {defaults,relative,absolute,toThree,fromThree,cartesian,spherical,distance,validateScene,speakerLayout,acrylicPlan,faceEntrance,centerSupportOverAcrylic,synchronizeArmSpeaker,Store,type MotionMode,type Vec3} from '../src/model';
import {advanceMotion,motionPosition,motionPresets,setMotionPreset} from '../src/motion';
import {axes,lengths,linkOffset,forward,solveTarget} from '../src/robot';
import {applyMappings} from '../src/mappings';
import {SpatOscAdapter,sceneMessages} from '../src/osc/adapter';
import {parsePresets,parseRecording,interpolateFrames,Recorder,PRESET_KEY,savePresets,loadPresets} from '../src/storage';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('world / Three / listener transforms round-trip, including listener yaw',()=>{const s=defaults(),p:[number,number,number]=[1.2,-.4,.8];s.listener.yaw=57;assert.deepEqual(fromThree(toThree(p)),p);absolute(relative(p,s.listener),s.listener).forEach((v,i)=>near(v,p[i]));const q=spherical(p);cartesian(q.azimuth,q.elevation,q.distance).forEach((v,i)=>near(v,p[i]));});
test('Core layout has four wall quartets, arm CH17 and separate sub metadata',()=>{const s=defaults();assert.equal(s.speakers.length,18);assert.equal(s.speakers[17].id,'SUB1');assert.equal(s.speakers[16].role,'arm');assert.equal(new Set(s.speakers.map(x=>x.id)).size,18);assert.deepEqual([s.room.width,s.room.depth,s.room.height,s.room.wallHeight],[7,7,7,5.4]);assert.equal(s.speakerSetup.driverDiameter,.1161);for(const wall of ['rear','front','right','left'])assert.equal(s.speakers.filter(x=>x.wall===wall).length,4);const messages=sceneMessages(s);assert.equal(messages.find(x=>x.address==='/speakers/xyz')!.args.length,51);assert.deepEqual(messages.find(x=>x.address==='/dotarea/subwoofer/xyz')!.args,s.speakers[17].position);});
test('wall speaker planning settings resize the layout without losing channel order',()=>{const s=defaults();s.room.width=8;s.room.depth=9;s.speakerSetup.spacing=4;s.speakerSetup.lowerHeight=1.5;s.speakerSetup.upperHeight=4.8;const speakers=speakerLayout(s.room,s.speakerSetup);assert.deepEqual(speakers[0].position,[-2,-4.34,1.5]);assert.deepEqual(speakers[11].position,[3.84,2,4.8]);assert.deepEqual(speakers[15].position,[-3.84,2,4.8]);assert.deepEqual(speakers.map(x=>x.id),defaults().speakers.map(x=>x.id));});
test('acrylic has trapezoidal bottom and top with the specified slope on all four faces',()=>{const s=defaults(),a=s.acrylic,{bottom,top}=acrylicPlan(a);assert.notEqual(bottom[1][0]-bottom[0][0],bottom[2][0]-bottom[3][0]);assert.notEqual(top[1][0]-top[0][0],top[2][0]-top[3][0]);for(let i=0;i<4;i++){const j=(i+1)%4,dx=bottom[j][0]-bottom[i][0],dy=bottom[j][1]-bottom[i][1],horizontal=Math.abs(dx*(top[i][1]-bottom[i][1])-dy*(top[i][0]-bottom[i][0]))/Math.hypot(dx,dy);near(Math.atan2(a.height,horizontal)*180/Math.PI,32.5);}assert.throws(()=>validateScene({...s,acrylic:{...a,height:2}}),/Acrylic top collapses/);});
test('default acrylic long edge and stone front face the left entrance after Three rotation',()=>{
 const s=defaults(),bottom=acrylicPlan(s.acrylic).bottom;
 const rotated=(p:Vec3,yaw:number)=>fromThree(new Vector3(...toThree(p)).applyAxisAngle(new Vector3(0,1,0),yaw*Math.PI/180).toArray());
 const frontLength=distance(bottom[0],bottom[1]);
 for(let i=1;i<4;i++)assert.ok(frontLength>distance(bottom[i],bottom[(i+1)%4]));
 const world=bottom.map(p=>rotated(p,s.acrylic.yaw));
 near(world[0][0],-s.acrylic.depth/2);near(world[1][0],-s.acrylic.depth/2);
 assert.ok(world[0][0]<world[2][0]&&world[1][0]<world[3][0]);
 const stoneFront=rotated([0,s.stone.depth/2,0],s.stone.yaw);
 near(stoneFront[0],-s.stone.depth/2);near(stoneFront[1],0);near(stoneFront[2],0);
});
test('entrance alignment preserves sculpture positions and speaker layout',()=>{
 const s=defaults();s.acrylic.position=[.5,.3,.1];s.stone.position=[.2,.4,.6];s.acrylic.yaw=-15;s.stone.yaw=-45;
 const before=structuredClone(s);faceEntrance(s);
 assert.deepEqual(s,{...before,acrylic:{...before.acrylic,yaw:90},stone:{...before.stone,yaw:90}});
});
test('older Core v2 presets and recordings preserve stone orientation and interpolate new yaw',()=>{
 const legacy=JSON.parse(JSON.stringify(defaults()));delete legacy.stone.yaw;legacy.acrylic.yaw=-30;
 const loaded=parsePresets([{name:'Previous study',scene:legacy}])[0].scene;
 assert.equal(loaded.stone.yaw,0);assert.equal(loaded.acrylic.yaw,-30);assert.equal(Object.hasOwn(legacy.stone,'yaw'),false);
 const current=defaults();current.stone.yaw=120;
 assert.equal(parsePresets([{name:'New study',scene:current}])[0].scene.stone.yaw,120);
 const frames=parseRecording({version:2,edition:'core',frames:[{t:0,scene:legacy},{t:2,scene:current}]});
 near(interpolateFrames(frames,0).stone.yaw,0);near(interpolateFrames(frames,1).stone.yaw,60);near(interpolateFrames(frames,2).stone.yaw,120);
 for(const yaw of [undefined,NaN,'90',181,-181])assert.throws(()=>validateScene({...current,stone:{...current.stone,yaw}}),/stone.yaw|stone yaw/);
});
test('Core validation rejects impossible dimensions, malformed geometry and incompatible Adaptation scenes',()=>{const s=defaults();assert.throws(()=>validateScene({...s,version:1}),/not a De-symmetrical Core/);assert.throws(()=>validateScene({...s,edition:'adaptation'}),/different installation/);assert.throws(()=>validateScene({...s,room:{...s.room,wallHeight:8}}),/room dimensions/);assert.throws(()=>validateScene({...s,room:{...s.room,width:10,depth:4,entranceWidth:5}}),/room dimensions/);assert.throws(()=>validateScene({...s,speakerSetup:{...s.speakerSetup,lowerHeight:5}}),/speaker layout/);assert.throws(()=>validateScene({...s,speakerSetup:{...s.speakerSetup,baffleWidth:.01}}),/speaker shape/);assert.throws(()=>validateScene({...s,stone:{...s.stone,width:0}}),/stone dimensions/);const bad=structuredClone(s);bad.speakers[0].role='arm';assert.throws(()=>validateScene(bad),/channel order/);});
test('arm speaker tracks the light for UI changes, interpolation and OSC',()=>{const store=new Store();store.change(s=>{s.light.position=[1,2,3];s.speakerSetup.armOffset=[.1,.2,.3];});assert.deepEqual(store.state.speakers[16].position,[1.1,2.2,3.3]);store.state.light.position=[2,3,4];const messages=sceneMessages(store.state);assert.deepEqual(store.state.speakers[16].position,[2.1,3.2,4.3]);assert.deepEqual(messages.find(x=>x.address==='/speakers/xyz')!.args.slice(48),relative([2.1,3.2,4.3],store.state.listener));const next=structuredClone(store.state);next.light.position=[4,5,6];synchronizeArmSpeaker(next);const mid=interpolateFrames([{t:0,scene:store.state},{t:2,scene:next}],1);assert.deepEqual(mid.speakers[16].position,[3.1,4.2,5.3]);});
test('Core presets use isolated storage and imported playback stays paused',()=>{const data=new Map([['dotarea.webgl.presets.v1','[{"name":"legacy"}]']]);const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)},configurable:true});try{assert.deepEqual(loadPresets(),[]);const s=defaults();s.motion.playing=true;savePresets([{name:'Core test',scene:s}]);assert.ok(data.has(PRESET_KEY));const presets=loadPresets();assert.equal(presets[0].scene.motion.playing,false);assert.equal(presets[0].scene.speakers.length,18);assert.throws(()=>parsePresets([null]),/Invalid preset/);}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}});
test('six-joint forward hierarchy; bounded IK reduces reachable target error',()=>{const s=defaults();const start=forward(s).tip;s.robot.joints[0]+=30;assert.ok(distance(start,forward(s).tip)>.05);const desired=[...s.robot.joints];desired[1]+=10;desired[2]-=8;s.robot.target=forward(s,desired).tip;const before=distance(forward(s).tip,s.robot.target);for(let i=0;i<120;i++){const old=[...s.robot.joints];solveTarget(s,1/60);s.robot.joints.forEach((v,k)=>assert.ok(Math.abs(v-old[k])<=35/60+1e-9));}assert.ok(distance(forward(s).tip,s.robot.target)<before/2);assert.equal(forward(s).points.length,7);});
test('ceiling support is centred over acrylic and the default arm descends to peek over the stone',()=>{
 const s=defaults(),fk=forward(s),points=fk.points.map(p=>fromThree(p.toArray()));
 assert.equal(s.robot.mount,'ceiling');assert.deepEqual(s.robot.base.slice(0,2),s.acrylic.position.slice(0,2));
 near(points[1][0],s.robot.base[0]);near(points[1][1],s.robot.base[1]);near(points[1][2],s.robot.base[2]-lengths[0]);
 for(let i=1;i<points.length;i++){near(distance(points[i],points[i-1]),lengths[i-1]);assert.ok(points[i][2]<points[i-1][2]);}
 assert.ok(points.every(p=>p[2]>s.acrylic.position[2]+s.acrylic.height+.10));
 assert.ok(fk.tip[0]<-.2&&fk.tip[0]>-.4);near(fk.tip[1],0);assert.ok(fk.tip[2]>.6&&fk.tip[2]<.8);
});
test('recentring the support follows the moved acrylic while preserving chosen height and pose',()=>{
 const s=defaults();s.robot.mount='side';s.robot.base=[-.8,.4,2.1];s.robot.joints[1]=-50;s.acrylic.position=[.7,-.3,.02];const before=structuredClone(s);
 centerSupportOverAcrylic(s);assert.deepEqual(s,{...before,robot:{...before.robot,base:[.7,-.3,2.1],mount:'ceiling'}});
});
test('older Core arm presets preserve their horizontal shoulder and custom base; mounting is discrete in recordings',()=>{
 const legacy=JSON.parse(JSON.stringify(defaults()));delete legacy.robot.mount;legacy.robot.base=[.2,-1,1.3];legacy.robot.joints=[0,0,0,0,0,0];
 const loaded=parsePresets([{name:'Old support',scene:legacy}])[0].scene;assert.equal(loaded.robot.mount,'side');assert.deepEqual(loaded.robot.base,legacy.robot.base);assert.equal(Object.hasOwn(legacy.robot,'mount'),false);
 const tip=forward(loaded).tip;near(tip[0],.2);near(tip[1],-1+lengths.reduce((a,b)=>a+b,0));near(tip[2],1.3);
 const current=defaults(),frames=parseRecording({version:2,edition:'core',frames:[{t:0,scene:legacy},{t:2,scene:current}]});
 assert.equal(interpolateFrames(frames,0).robot.mount,'side');assert.equal(interpolateFrames(frames,1).robot.mount,'side');assert.equal(interpolateFrames(frames,2).robot.mount,'ceiling');
 interpolateFrames(frames,1).robot.base.forEach((value,i)=>near(value,[.1,-.5,1.575][i]));
 for(const mount of [undefined,null,'floor',2])assert.throws(()=>validateScene({...current,robot:{...current.robot,mount}}),/mount/);
});
test('rendered joint hierarchy and FK agree in both mount configurations',()=>{
 const s=defaults();s.robot.base=[.3,-.2,2];s.robot.joints=[23,-40,-60,12,17,-9];
 for(const mount of ['ceiling','side'] as const){s.robot.mount=mount;const root=new Group();root.position.set(...toThree(s.robot.base));let parent=root;
  s.robot.joints.forEach((value,i)=>{const joint=new Group(),end=new Group();joint.quaternion.setFromAxisAngle(axes[i],value*Math.PI/180);end.position.set(...linkOffset(mount,i));parent.add(joint);joint.add(end);parent=end;});
  const actual=fromThree(parent.getWorldPosition(new Vector3()).toArray());forward(s).tip.forEach((value,i)=>near(value,actual[i]));
 }
});
test('finite motion modes and calm presets',()=>{const s=defaults();for(const mode of ['MANUAL','CIRCLE','ELLIPSE','ORBIT','FIGURE 8','SLOW SCAN','PENDULUM','RANDOM SMOOTH','RANDOM POINTS','KEYFRAMES'] as MotionMode[]){s.motion.mode=mode;for(let i=0;i<=100;i++){s.motion.phase=i/100;const p=motionPosition(s.motion);assert.ok(p.every(Number.isFinite));assert.deepEqual(p,motionPosition(s.motion));}}motionPresets.forEach((_,i)=>{setMotionPreset(s,i);assert.ok(i===6?s.motion.duration>=5:s.motion.duration>=55);assert.equal(s.motion.playing,false);});});
test('motion transport handles loop, once, reverse and pingpong',()=>{const s=defaults();s.motion.playing=true;s.motion.phase=.999;s.motion.duration=5;advanceMotion(s,.1);assert.ok(s.motion.phase<.03);s.motion.loop='once';s.motion.phase=.999;advanceMotion(s,.1);assert.equal(s.motion.phase,1);assert.equal(s.motion.playing,false);s.motion.playing=true;s.motion.loop='pingpong';advanceMotion(s,.1);assert.equal(s.motion.direction,-1);s.motion.loop='once';s.motion.phase=.001;advanceMotion(s,.1);assert.equal(s.motion.phase,0);});
test('looping motion remains playing and wraps through at least two cycles',()=>{const s=defaults();s.motion.playing=true;s.motion.mode='ORBIT';s.motion.loop='loop';s.motion.duration=5;let wraps=0,previous=s.motion.phase;for(let i=0;i<110;i++){advanceMotion(s,.1);if(s.motion.phase<previous)wraps++;previous=s.motion.phase;}assert.ok(wraps>=2);assert.equal(s.motion.playing,true);});
test('pingpong remains playing while traversing forward, backward and forward',()=>{const s=defaults();s.motion.playing=true;s.motion.mode='ORBIT';s.motion.loop='pingpong';s.motion.duration=5;const phases:number[]=[];for(let i=0;i<160;i++){advanceMotion(s,.1);phases.push(s.motion.phase);}assert.equal(s.motion.playing,true);assert.ok(Math.max(...phases)>0.9);assert.ok(phases.some((v,i)=>i>0&&v<phases[i-1]-.001));assert.ok(phases.slice(80).some((v,i)=>i>0&&v>phases.slice(80)[i-1]+.001));});
test('random points advances smoothly through three successive targets',()=>{const s=defaults();s.motion.mode='RANDOM POINTS';s.motion.playing=true;s.motion.duration=5;s.motion.speed=2;const targets=new Set<string>();let previous=[...s.robot.target] as [number,number,number];for(let i=0;i<100;i++){advanceMotion(s,.1);const now=s.robot.target;assert.ok(now.every(Number.isFinite));assert.ok(Math.hypot(...now.map((v,k)=>v-previous[k]))<.3);targets.add(now.map(v=>v.toFixed(3)).join(','));previous=[...now] as [number,number,number];}assert.ok(targets.size>3);assert.equal(s.motion.playing,true);});
test('proposal mappings are reversible and alternatives do not accumulate rotations',()=>{const s=defaults();s.shadow.mode='manual';s.shadow.area=.64;s.shadow.penumbra=1;applyMappings(s);assert.equal(s.sources[0].spread,64);assert.equal(s.sources[0].room,75);s.mappings.area.enabled=false;s.shadow.area=0;applyMappings(s);assert.equal(s.sources[0].spread,64);s.mappings.rotation.enabled=true;s.mappings.density.enabled=true;applyMappings(s);const first=[...s.sources[0].position];applyMappings(s);s.sources[0].position.forEach((v,i)=>near(v,first[i]));});
test('OSC uses verified native coordinates, diffs, and ignores echoed snapshots',()=>{const s=defaults(),adapter=new SpatOscAdapter();const messages=adapter.diff(s);assert.ok(messages.length>30);assert.equal(adapter.diff(s).length,0);for(const m of messages)assert.equal(adapter.receive(s,m),false);assert.equal(s.mappings.centroid.enabled,true);assert.equal(adapter.receive(s,{address:'/source/1/xyz',args:[1,2,3]}),true);assert.deepEqual(s.sources[0].position,absolute([1,2,3],s.listener));assert.equal(s.mappings.centroid.enabled,false);adapter.receive(s,{address:'/source/1/spread',args:[81]});assert.equal(s.sources[0].spread,81);assert.equal(s.mappings.area.enabled,false);assert.equal(adapter.receive(s,{address:'/source/1/xyz',args:[NaN,0,0]}),false);});
test('preset and recording validation rejects malformed state and unsafe extents',()=>{const s=defaults();assert.equal(validateScene(s).sources.length,4);assert.equal(parsePresets([{name:'study',scene:s}]).length,1);assert.throws(()=>validateScene({...s,robot:{...s.robot,joints:[1]}}));assert.throws(()=>validateScene({...s,sources:[]}));assert.throws(()=>parseRecording({version:2,edition:'core',frames:[{t:1,scene:s},{t:1,scene:s}]}));const b=structuredClone(s);b.light.intensity=.1;const frames=parseRecording({version:2,edition:'core',frames:[{t:0,scene:s},{t:2,scene:b}]});near(interpolateFrames(frames,1).light.intensity,.4);});
test('automation captures timestamps, replays and stops',()=>{const r=new Recorder(),s=defaults();r.record();for(let i=0;i<20;i++)r.tick(.1,s);assert.ok(r.frames.length>=10);r.stop();r.play();let result;for(let i=0;i<30;i++)result=r.tick(.1,s)||result;assert.ok(result);assert.equal(r.mode,'idle');});
