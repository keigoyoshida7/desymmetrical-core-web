import {cartesian,clamp,distance,relative,absolute,spherical,type SceneState} from './model';
const remap=(s:SceneState,key:keyof SceneState['mappings'],v:number)=>{const m=s.mappings[key];return m.min+clamp(v,0,1)*(m.max-m.min);};
export function applyMappings(s:SceneState){
 const p=s.light.position,c=s.stone.position,a=Math.atan2(p[0]-c[0],p[1]-c[1]),d=distance(p,c);
 if(s.shadow.mode==='derived')Object.assign(s.shadow,{centroid:[c[0]-Math.sin(a)*.6,c[1]-Math.cos(a)*.45,c[2]+.39],area:clamp(.2+.25/(d+.2),0,1),penumbra:clamp(.15+.25*p[2],0,1),density:.2+.7*s.light.intensity,entropy:.2+.3*(.5+.5*Math.sin(3*a))});
 const f=s.shadow;
 for(const [i,source] of s.sources.entries()){
  if(s.mappings.centroid.enabled){const m=s.mappings.centroid;source.position=f.centroid.map(v=>m.min+(clamp(v,-1,1)+1)*.5*(m.max-m.min)) as [number,number,number];source.position[0]+=(i-(s.sources.length-1)/2)*.08;}
  if(s.mappings.area.enabled)source.spread=clamp(remap(s,'area',f.area),0,100);
  if(s.mappings.penumbra.enabled)source.room=clamp(remap(s,'penumbra',f.penumbra),0,85);
  if(s.mappings.entropy.enabled)source.env=clamp(remap(s,'entropy',f.entropy),0,85);
  const polar=spherical(relative(source.position,s.listener));
  if(s.mappings.density.enabled)polar.distance=clamp(remap(s,'density',f.density),.35,8);
  if(s.mappings.lightDistance.enabled)polar.distance=clamp(remap(s,'lightDistance',d/3),.35,8);
  // Bias uses the current shadow direction, avoiding cumulative rotations.
  if(s.mappings.rotation.enabled)polar.azimuth=a*180/Math.PI+180+remap(s,'rotation',(a+Math.PI)/(2*Math.PI));
  if(s.mappings.density.enabled||s.mappings.lightDistance.enabled||s.mappings.rotation.enabled)source.position=absolute(cartesian(polar.azimuth,polar.elevation,polar.distance),s.listener);
 }
}
