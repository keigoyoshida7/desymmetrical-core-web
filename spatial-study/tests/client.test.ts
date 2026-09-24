import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,relative} from '../src/model';
import {OscClient} from '../src/osc/client';
import {paths} from '../src/osc/adapter';
test('disconnected client is nonfatal, retry is bounded, and incoming native edits suppress echo',()=>{
 const old={WebSocket:globalThis.WebSocket,window:globalThis.window,setInterval:globalThis.setInterval};
 const intervals:(()=>void)[]=[],timeouts:(()=>void)[]=[];let created=0;
 class Socket {
  static OPEN=1;readyState=0;sent:any[]=[];onopen?:()=>void;onclose?:()=>void;onerror?:()=>void;onmessage?:(e:{data:string})=>void;
  constructor(public url:string){created++;}send(v:string){this.sent.push(JSON.parse(v));}close(){this.readyState=3;}
 }
 try{
  (globalThis as any).WebSocket=Socket;(globalThis as any).window={setTimeout:(fn:()=>void)=>{timeouts.push(fn);return timeouts.length;}};(globalThis as any).setInterval=(fn:()=>void)=>{intervals.push(fn);return intervals.length;};
  const state=new Store(),client=new OscClient(state,()=>{});client.connect();(client.socket as any).onerror();(client.socket as any).onclose();assert.equal(client.connected,false);assert.equal(client.error,'');state.change(s=>s.robot.joints[1]=45);state.change(s=>s.speakersLocked=false);intervals[0]();assert.equal(state.state.robot.joints[1],45);
  timeouts.shift()!();(client.socket as any).onclose();timeouts.shift()!();(client.socket as any).onclose();assert.equal(created,3);assert.equal(timeouts.length,0);
  client.connect();const socket=client.socket as unknown as Socket;socket.readyState=1;socket.onopen!();assert.equal(client.connected,true);const before=socket.sent.length;socket.onmessage!({data:JSON.stringify({type:'osc',messages:[{address:'/source/1/xyz',args:[.4,.8,.2]}]})});intervals[0]();assert.equal(socket.sent.length,before);assert.equal(state.state.mappings.centroid.enabled,false);
  // CH17 remains attached while paused, and the native renderer receives a corrected aggregate.
  const arm=[...state.state.speakers[16].position],wrong={address:'/speaker/17/xyz',args:[9,9,9]};
  const beforeArm=socket.sent.length;socket.onmessage!({data:JSON.stringify({type:'osc',messages:[wrong]})});intervals[0]();assert.deepEqual(state.state.speakers[16].position,arm);assert.equal(socket.sent.length,beforeArm+1);
  const correction=socket.sent.at(-1).messages.find((m:any)=>m.address===paths.speakers);assert.equal(correction.args.length,51);assert.deepEqual(correction.args.slice(48),relative(arm as [number,number,number],state.state.listener));
  const afterCorrection=socket.sent.length;socket.onmessage!({data:JSON.stringify({type:'osc',messages:[correction]})});intervals[0]();assert.equal(socket.sent.length,afterCorrection,'corrected snapshots must not loop');
  socket.onmessage!({data:JSON.stringify({type:'osc',messages:[wrong]})});intervals[0]();assert.equal(socket.sent.length,afterCorrection+1,'a repeated native CH17 edit is corrected again');
  const incoming={address:paths.speakers,args:[...correction.args]};incoming.args[0]+=.25;incoming.args[48]=8;
  const beforeAggregate=socket.sent.length;socket.onmessage!({data:JSON.stringify({type:'osc',messages:[incoming]})});intervals[0]();assert.deepEqual(state.state.speakers[16].position,arm);assert.equal(socket.sent.length,beforeAggregate+1);assert.equal(socket.sent.at(-1).messages.find((m:any)=>m.address===paths.speakers).args[0],incoming.args[0],'wall speaker edits remain accepted');
  socket.onmessage!({data:JSON.stringify({type:'osc',messages:[{address:paths.capacity,args:[4]},{address:paths.master,args:[1,.6,.6]},{address:paths.mode,args:['virtualspeakers']}]})});assert.equal(client.maxSources,4);assert.match(client.masterState,/0.60/);assert.equal(client.ackedMode,'virtualspeakers');client.disconnect();assert.equal(client.connected,false);
  socket.onmessage!({data:JSON.stringify({type:'osc',messages:[{address:paths.selected,args:[1]}]})});assert.equal(client.pendingSelection,null);
 }finally{Object.assign(globalThis,old);}
});
