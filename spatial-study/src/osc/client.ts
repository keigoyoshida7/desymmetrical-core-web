import {SpatOscAdapter,paths,type OscMessage} from './adapter';
import type {Store} from '../model';
import {applyMappings} from '../mappings';
import {connectionDefaults} from '../config';
export interface BridgeConfig {maxHost:string;maxReceivePort:number;maxSendPort:number;}
export class OscClient {
 socket?:WebSocket;adapter=new SpatOscAdapter();connected=false;maxSeen=0;ackedMode='unconfirmed';masterState='unconfirmed';error='';url=connectionDefaults.wsUrl;private attempts=0;
 sent=0;received=0;rate=0;lastOut='—';lastIn='—';log:string[]=[];config:BridgeConfig={...connectionDefaults};
 private timer=0;private retry=0;private dirty=true;private stopped=false;
 maxSources=8;selectedSource=0;pendingSelection:number|null=null;
 constructor(private store:Store,private notify:()=>void){
  store.subscribe((_,origin)=>{if(origin!=='osc'&&origin!=='system')this.dirty=true;});
  setInterval(()=>{if(this.dirty&&this.connected){this.send(this.adapter.diff(store.state));this.dirty=false;}},50);
  let prior=0;setInterval(()=>{this.rate=this.sent+this.received-prior;prior=this.sent+this.received;this.notify();},1000);
  setInterval(()=>{if(this.connected)this.send([{address:paths.request,args:[]}]);},3000);
 }
 connect(url=this.url,automatic=false){this.attempts=automatic?this.attempts+1:0;this.stopped=false;clearTimeout(this.retry);this.socket?.close();this.url=url;this.error='';const ws=new WebSocket(url);this.socket=ws;
  ws.onopen=()=>{if(this.socket!==ws)return;this.connected=true;this.error='';this.sync();this.dirty=false;this.send([{address:paths.request,args:[]}]);this.notify();};
  ws.onclose=()=>{if(this.socket!==ws)return;this.connected=false;this.maxSeen=0;this.notify();if(!this.stopped&&this.attempts<2)this.retry=window.setTimeout(()=>this.connect(this.url,true),this.attempts===0?5000:15000);};
  ws.onerror=()=>{this.error='';this.notify();};
  ws.onmessage=e=>{try{const data=JSON.parse(e.data);if(data.type==='status'){this.config=data.config;this.notify();}
   if(data.type==='error'){this.error=data.message;this.notify();}
   if(data.type==='osc'){for(const m of data.messages as OscMessage[]){this.received++;this.maxSeen=Date.now();this.lastIn=m.address+' '+m.args.join(' ');this.append('← '+this.lastIn);
     if(m.address===paths.mode)this.ackedMode=String(m.args[0]);
     if(m.address===paths.master)this.masterState='sound '+m.args[0]+' / gain '+Number(m.args[1]||0).toFixed(2);
     if(m.address===paths.capacity)this.maxSources=Math.max(1,Math.min(8,Number(m.args[0])||4));
     // Selection is local UI state. Routine Max snapshots must never steal focus.
     if(this.adapter.receive(this.store.state,m)){
      // Recompute derived controls only for actual installation edits, never echoed snapshots.
      if(m.address.startsWith('/dotarea/shadow/')||m.address===paths.intensity){applyMappings(this.store.state);this.dirty=true;}
      if(m.address===paths.listener||m.address===paths.yaw||this.adapter.armCorrectionPending)this.dirty=true;
      this.store.change(()=>{},'osc');
     }
   }this.notify();}
  }catch{this.error='Invalid bridge response';this.notify();}};
 }
 disconnect(){this.stopped=true;clearTimeout(this.retry);this.socket?.close();this.connected=false;}
 selectSource(id:number){if(this.selectedSource===id)return;this.selectedSource=id;this.send([{address:paths.selected,args:[id]}]);}
 motionStop(){this.send([{address:paths.motion('stop'),args:[1]}]);}
 motionPreset(name:string){this.send([{address:paths.motion('preset'),args:[name]}]);}
 configure(config:BridgeConfig){if(this.socket?.readyState!==WebSocket.OPEN)throw Error('Connect the OSC bridge first');this.socket.send(JSON.stringify({type:'configure',config}));}
 sync(){if(!this.connected){this.dirty=true;return;}this.adapter.cache.clear();this.send(this.adapter.diff(this.store.state,true));}
 send(messages:OscMessage[]){if(!messages.length||this.socket?.readyState!==WebSocket.OPEN)return;this.socket.send(JSON.stringify({type:'osc',messages}));this.sent+=messages.length;this.lastOut=messages.at(-1)!.address+' '+messages.at(-1)!.args.join(' ');this.append('→ '+this.lastOut);}
 private append(t:string){this.log.push(new Date().toLocaleTimeString()+' '+t);if(this.log.length>120)this.log.shift();clearTimeout(this.timer);this.timer=window.setTimeout(this.notify,80);}
 clear(){this.log=[];this.lastIn=this.lastOut='—';this.notify();}
}
