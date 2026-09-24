import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../src/model';
import {applyMappings} from '../src/mappings';
import {validateAnalysisFeed,applyAnalysisFeed,type AnalysisFeed} from '../src/analysis-feed';

const fixture=():AnalysisFeed=>({
 source:'camera',running:true,fixed:false,sampleId:'camera-7-1000',
 features:{area:.3,darkness:.75,centroid:[.25,.75],penumbraWidth:16,width:320,height:200,histogram:[10,20,30,40]},
});

test('analysis feed preserves source provenance and frozen sample identity',()=>{
 for(const source of ['demo','camera','file'] as const){
  const data={...fixture(),source,fixed:true,sampleId:'same-frame'};
  assert.deepEqual(validateAnalysisFeed(data),data);
 }
 const stopped={...fixture(),running:false};
 assert.deepEqual(validateAnalysisFeed(stopped),stopped);
});

test('analysis feed rejects malformed or unbounded messages',()=>{
 const f=fixture();
 const invalid:unknown[]=[null,[],{}, {type:'core-analysis',payload:f},
  {...f,source:'robot'}, {...f,source:{toString:()=> 'camera'}}, {...f,running:1}, {...f,fixed:'true'},
  {...f,sampleId:''},{...f,sampleId:'x'.repeat(257)},
  ...[{area:NaN},{area:1.1},{darkness:-.1},{darkness:Infinity},
   {centroid:[0]},{centroid:[0,0,0]},{centroid:Array(2)},{centroid:[NaN,.5]},{centroid:[-.1,.5]},
   {width:0},{width:Infinity},{width:320.5},{width:100000},{width:16384,height:16384},
   {height:-1},{penumbraWidth:-1},{penumbraWidth:Infinity},{penumbraWidth:500},
   {histogram:[1,-1]},{histogram:[.5]},{histogram:[NaN]},
   {histogram:[64001]},{histogram:[64000,1]},{histogram:Array(257).fill(0)},
  ].map(change=>({...f,features:{...f.features,...change}})),
 ];
 for(const value of invalid)assert.equal(validateAnalysisFeed(value),null);
});

test('validated data has detached centroid and histogram arrays',()=>{
 const input=fixture(),parsed=validateAnalysisFeed(input)!;
 input.features.centroid[0]=0;input.features.histogram[0]=99;
 assert.equal(parsed.features.centroid[0],.25);
 assert.equal(parsed.features.histogram[0],10);
});

test('adapter changes only normalized shadow fields',()=>{
 const scene=defaults(),before=structuredClone(scene),data=validateAnalysisFeed(fixture())!;
 applyAnalysisFeed(scene,data);
 assert.equal(scene.shadow.mode,'manual');
 assert.deepEqual(scene.shadow.centroid,[-.5,-.5,.75]);
 assert.equal(scene.shadow.area,.3);assert.equal(scene.shadow.density,.75);
 assert.equal(scene.shadow.penumbra,.05);
 assert.deepEqual({...scene,shadow:before.shadow},before);
 assert.deepEqual(data,fixture());
});

test('entropy is finite, zero for empty or one occupied bin, and one for uniform bins',()=>{
 for(const [histogram,expected] of [[[],0],[[0,0],0],[[100],0],[[0,100,0,0],0],[[10,10,10,10],1]] as [number[],number][]){
  const data=fixture();data.features.histogram=histogram;
  const parsed=validateAnalysisFeed(data)!;assert.ok(parsed);
  const scene=defaults();applyAnalysisFeed(scene,parsed);
  assert.ok(Number.isFinite(scene.shadow.entropy));
  assert.equal(scene.shadow.entropy,expected);
 }
});

test('penumbra normalization is bounded even for a tall analysis image',()=>{
 const data=fixture();data.features.width=100;data.features.height=400;data.features.penumbraWidth=200;
 const parsed=validateAnalysisFeed(data)!;assert.ok(parsed);
 const scene=defaults();applyAnalysisFeed(scene,parsed);
 assert.equal(scene.shadow.penumbra,1);
});

test('observed sources stay on or above the floor under the default mapping',()=>{
 for(const darkness of [0,.1903898897060366,.5,1]){
  const data=fixture();data.features.darkness=darkness;
  const parsed=validateAnalysisFeed(data)!;assert.ok(parsed);
  const scene=defaults();applyAnalysisFeed(scene,parsed);applyMappings(scene);
  assert.ok(scene.sources.every(source=>source.position[2]>=0&&source.position[2]<=1));
 }
});
