import {Matrix4,Quaternion,Vector3} from 'three';
import {clamp,fromThree,toThree,type SceneState,type Vec3} from './model';
export const lengths=[.16,.43,.39,.16,.12,.09];
export const axes=[new Vector3(0,1,0),new Vector3(1,0,0),new Vector3(1,0,0),new Vector3(0,0,1),new Vector3(1,0,0),new Vector3(0,0,1)];
export const basePosition=(s:SceneState):Vec3=>s.robot.base;
// Three.js coordinates. The ceiling shoulder descends along the yaw axis;
// the remaining links bend outward/downward from its lower hinge.
export const linkOffset=(mount:SceneState['robot']['mount'],i:number):Vec3=>i===0&&mount==='ceiling'?[0,-lengths[i],0]:[0,0,-lengths[i]];
export function forward(s:SceneState,joints=s.robot.joints){
 const matrix=new Matrix4().makeTranslation(...toThree(basePosition(s)));const points=[new Vector3().setFromMatrixPosition(matrix)];const matrices:Matrix4[]=[];
 joints.forEach((j,i)=>{matrix.multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(axes[i],j*Math.PI/180)));matrices.push(matrix.clone());matrix.multiply(new Matrix4().makeTranslation(...linkOffset(s.robot.mount,i)));points.push(new Vector3().setFromMatrixPosition(matrix));});
 return {matrices,points,tip:fromThree(points.at(-1)!.toArray() as Vec3)};
}
export function solveTarget(s:SceneState,dt:number){
 const original=[...s.robot.joints],j=[...original],target=new Vector3(...toThree(s.robot.target));
 for(let iter=0;iter<7;iter++)for(const i of [4,2,1,0]){
  const fk=forward(s,j),pivot=fk.points[i],worldAxis=axes[i].clone().transformDirection(fk.matrices[i]);
  const end=fk.points.at(-1)!.clone().sub(pivot),goal=target.clone().sub(pivot);
  end.addScaledVector(worldAxis,-end.dot(worldAxis));goal.addScaledVector(worldAxis,-goal.dot(worldAxis));
  if(end.lengthSq()<1e-8||goal.lengthSq()<1e-8)continue;end.normalize();goal.normalize();
  const angle=Math.atan2(worldAxis.dot(end.clone().cross(goal)),clamp(end.dot(goal),-1,1))*180/Math.PI;
  j[i]=clamp(j[i]+clamp(angle,-12,12),-165,165);
 }
 s.robot.joints=j.map((v,i)=>original[i]+clamp(v-original[i],-35*dt,35*dt));
}
