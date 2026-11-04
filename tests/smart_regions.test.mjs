import test from 'node:test';
import assert from 'node:assert/strict';
import {headNeckOwnership,isDetachedHeadPiece,headOwnedComponents} from '../src/smart_regions.js';
import {weightsForDistances} from '../src/envelope_math.js';
const bones=[
 {name:'chest',head:[0,1.2,0],tail:[0,1.4,0]},
 {name:'neck',head:[0,1.4,0],tail:[0,1.65,0]},
 {name:'head',head:[0,1.65,0],tail:[0,2,0]},
 {name:'shoulder.L',head:[0,1.4,0],tail:[.45,1.32,0]},
 {name:'shoulder.R',head:[0,1.4,0],tail:[-.45,1.32,0]},
];
const cfg={envelopes:Object.fromEntries(bones.map(b=>[b.name,{radius:.4,mode:'smooth',strength:1}]))};
test('skull ownership is head-only independently of envelope radius',()=>{
 const plan=headNeckOwnership([0,1.84,0],bones,2);
 assert.deepEqual(plan.weights,[['head',1]]);
 assert.deepEqual(weightsForDistances(bones.map(x=>x.name),Float32Array.from([0,0,0,0,0]),cfg,2,4,plan).weights,[['head',1]]);
});
test('shoulders and pectoral exclude Head/Neck for oversized envelopes',()=>{
 for(const xyz of [[.43,1.32,0],[.3,1.25,0],[0,1.12,0],[-.42,1.32,0]]){
  const plan=headNeckOwnership(xyz,bones,2);
  assert.deepEqual(plan.blocked,['head','neck']);
  const result=weightsForDistances(bones.map(x=>x.name),Float32Array.from([.4,.001,.001,.02,.05]),cfg,2,4,plan);
  assert.equal(result.weights.some(([name])=>name==='head'||name==='neck'),false);
 }
});
test('head-neck and neck-chest transitions are normalized',()=>{
 for(const y of [1.645,1.45]){
  const o=headNeckOwnership([0,y,0],bones,2);
  assert.ok(o.weights);assert.ok(Math.abs(o.weights.reduce((s,[,v])=>s+v,0)-1)<1e-12);
 }
});
test('disconnected hair is recognized without selecting any vertices',()=>{
 const hair=[[-.1,1.72,0],[.1,1.85,0],[.02,1.92,-.03],[.05,1.76,.02],[0,1.3,0]];
 const shoulder=[[.38,1.32,0],[.45,1.31,0],[.40,1.25,0]];
 assert.equal(isDetachedHeadPiece(hair,bones,2),true);
 assert.equal(isDetachedHeadPiece(shoulder,bones,2),false);
 const flags=headOwnedComponents([...hair,...shoulder],[[0,1,2],[0,2,3],[3,4,0],[5,6,7]],bones,2);
 assert.deepEqual([...flags],[1,1,1,1,1,0,0,0]);
});
