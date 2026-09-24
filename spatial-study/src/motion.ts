import {clamp,mix3,type SceneState,type Vec3} from './model';
export const motionPresets=[
 {name:'01 SLOW ORBIT',mode:'ORBIT',radius:.55,height:1,duration:80,amplitude:.12},
 {name:'02 LOW ELLIPSE',mode:'ELLIPSE',radius:.6,height:.65,duration:70,amplitude:.55},
 {name:'03 HIGH ELLIPSE',mode:'ELLIPSE',radius:.5,height:1.25,duration:90,amplitude:.65},
 {name:'04 FRONT BACK SCAN',mode:'SLOW SCAN',radius:.5,height:.9,duration:55,amplitude:.6},
 {name:'05 SLOW FIGURE 8',mode:'FIGURE 8',radius:.55,height:.85,duration:100,amplitude:.65},
 {name:'06 DISSYMMETRIC ORBIT',mode:'ORBIT',radius:.58,height:1,duration:85,amplitude:.55},
 {name:'07 RANDOM POINTS',mode:'RANDOM POINTS',radius:.7,height:1,duration:12,amplitude:.8},
] as const;
type Walk={from:Vec3;to:Vec3;progress:number;seed:number};const walks=new WeakMap<SceneState,Walk>();
function nextPoint(s:SceneState,seed:number):Vec3{const r=(n:number)=>{const x=Math.sin(seed+n*12.9898)*43758.5453;return x-Math.floor(x);};return [s.motion.center[0]+(r(1)*2-1)*s.motion.radius,s.motion.center[1]+(r(2)*2-1)*s.motion.radius,s.motion.center[2]+s.motion.height*.65+(r(3)*2-1)*Math.min(.35,s.motion.amplitude*.25)];}
export function setMotionPreset(s:SceneState,index:number){const p=motionPresets[index];Object.assign(s.motion,{mode:p.mode,radius:p.radius,height:p.height,duration:p.duration,amplitude:p.amplitude,phase:0,direction:1});walks.delete(s);s.robot.control='target';s.robot.target=motionPosition(s.motion);}
export function ease(t:number,kind:SceneState['motion']['easing']){return kind==='sine'?(1-Math.cos(Math.PI*t))/2:kind==='smooth'?t*t*(3-2*t):t;}
export function advanceMotion(s:SceneState,dt:number){const m=s.motion;if(!m.playing||m.mode==='MANUAL')return;
 if(m.mode==='RANDOM POINTS'){let w=walks.get(s);if(!w){const from=[...s.robot.target] as Vec3;w={from,to:nextPoint(s,1),progress:0,seed:1};walks.set(s,w);}w.progress+=Math.min(dt,.1)*m.speed/Math.max(1,m.duration);if(w.progress>=1){w.from=w.to;w.seed++;w.to=nextPoint(s,w.seed);w.progress=w.progress%1;}m.phase=w.progress;s.robot.target=mix3(w.from,w.to,ease(w.progress,m.easing));s.robot.control='target';return;}
 let p=m.phase+Math.min(dt,.1)*m.speed/m.duration*m.direction;
 if(m.loop==='once'&&(p>=1||p<=0)){p=clamp(p,0,1);m.playing=false;}
 if(m.loop==='loop')p=((p%1)+1)%1;
 if(m.loop==='pingpong'){
  // Unfold the returning leg before advancing, then fold a period of two.
  const cycle=((m.direction===1?m.phase:2-m.phase)+Math.min(dt,.1)*m.speed/m.duration)%2;
  p=cycle<=1?cycle:2-cycle;m.direction=cycle<1?1:-1;
 }
 m.phase=p;
 const target=motionPosition(m);s.robot.target=mix3(s.robot.target,target,m.smoothing<=0?1:1-Math.exp(-dt/m.smoothing));s.robot.control='target';
}
export function motionPosition(m:SceneState['motion']):Vec3{
 const p=ease(m.phase,m.easing),a=p*2*Math.PI,r=m.radius,A=m.amplitude;let x=0,y=0,z=m.height;
 switch(m.mode){
  case 'CIRCLE':x=r*Math.cos(a);y=r*Math.sin(a);break;
  case 'ELLIPSE':x=r*Math.cos(a);y=r*Math.max(.15,A)*Math.sin(a);break;
  case 'ORBIT':{const ripple=1+.18*A*Math.sin(3*a+.4);x=r*ripple*Math.cos(a);y=r*.7*ripple*Math.sin(a);z+=.16*A*Math.sin(2*a);break;}
  case 'FIGURE 8':x=r*Math.sin(a);y=r*A*Math.sin(2*a);break;
  case 'SLOW SCAN':x=.15*r*Math.sin(a*2);y=r*Math.sin(a);break;
  case 'PENDULUM':x=r*Math.sin(A*Math.PI/2*Math.sin(a));z-=.25*r*Math.cos(a);break;
  case 'RANDOM SMOOTH':x=r*(.65*Math.sin(a)+.25*Math.sin(3*a+.7));y=r*(.6*Math.sin(2*a+1)+.25*Math.sin(5*a));z+=.2*A*Math.sin(3*a+2);break;
  case 'RANDOM POINTS':return [m.center[0],m.center[1],m.center[2]+m.height];
  case 'KEYFRAMES':{const points=m.keyframes,scaled=p*(points.length-1),i=Math.min(points.length-2,Math.floor(scaled));return mix3(points[i],points[i+1],scaled-i);}
  case 'MANUAL':return [m.center[0],m.center[1],m.height];
 }
 return [m.center[0]+x,m.center[1]+y,m.center[2]+z];
}
