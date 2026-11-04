import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialRegionOwnership,meshRegionOwnerships} from '../src/smart_regions.js';
import {weightsForDistances,validateEnvelopeDraft} from '../src/envelope_math.js';
const bones=[
 {name:'pelvis',head:[0,.92,0],tail:[0,1.04,0]},
 {name:'spine',head:[0,1.04,0],tail:[0,1.24,0]},
 {name:'chest',head:[0,1.24,0],tail:[0,1.43,0]},
 {name:'neck',head:[0,1.43,0],tail:[0,1.65,0]},
 {name:'head',head:[0,1.65,0],tail:[0,1.93,0]},
];
for(const [sign,side] of [[1,'L'],[-1,'R']]){
 const p=(x,y)=>[x*sign,y,0];
 for(const [part,a,b] of [
  ['shoulder',p(0,1.43),p(.32,1.42)],['upper_arm',p(.32,1.42),p(.65,1.23)],
  ['forearm',p(.65,1.23),p(.84,1.08)],['hand',p(.84,1.08),p(.95,1.05)],
  ['thigh',p(.17,.91),p(.19,.55)],['shin',p(.19,.55),p(.18,.14)],
  ['foot',p(.18,.14),p(.24,.06)]])bones.push({name:part+'.'+side,head:a,tail:b});
}
const names=bones.map(b=>b.name);
const cfg={envelopes:Object.fromEntries(names.map(name=>[name,{radius:.4,mode:'smooth',strength:1}]))};
test('oversized envelopes cannot cross SSR regions',()=>{
 for(const [point,zone,forbidden] of [
 [[.56,1.28,0],'arm.L','upper_arm.R'],[[-.71,1.16,0],'arm.R','upper_arm.L'],
 [[.19,.5,0],'leg.L','forearm.L'],[[0,1.18,0],'torso','shin.R']]){
  const owner=spatialRegionOwnership(point,bones,2);
  assert.equal(owner.zone,zone);
  const weights=weightsForDistances(names,Float32Array.from(names.map(()=>.02)),cfg,2,4,owner).weights;
  assert.ok(!weights.some(([name])=>name===forbidden));
  assert.ok(Math.abs(weights.reduce((sum,[,value])=>sum+value,0)-1)<1e-6);
 }
});
test('compact detached island can follow one arm bone',()=>{
 const body=[[0,1.1,0],[0,1.08,0],[.02,1.1,0],[0,1.1,.03],[.01,1.08,.025],[.03,1.07,0]];
 const part=[[.60,1.24,-.005],[.61,1.24,.01],[.60,1.245,.005],[.61,1.238,-.008]];
 const masks=meshRegionOwnerships([...body,...part],[[0,1,2],[2,3,4],[3,4,5],[6,7,8],[7,8,9]],bones,2);
 assert.equal(masks[6].zone,'arm.L-rigid');
 assert.equal(masks[6].weights.length,1);
});
test('old config defaults to SSR and can be compared against head-only',()=>{
 const base={format:'whiskeypose-skin-envelopes',version:1,envelopes:cfg.envelopes};
 assert.equal(validateEnvelopeDraft(base,bones).regionMode,'smart');
 assert.equal(validateEnvelopeDraft({...base,regionMode:'head-only'},bones).regionMode,'head-only');
 assert.throws(()=>validateEnvelopeDraft({...base,regionMode:'nonsense'},bones),/Smart Regions/);
});
