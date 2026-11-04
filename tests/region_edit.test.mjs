import test from 'node:test';
import assert from 'node:assert/strict';
import {anatomyKey,buildRegionTargets,REGION_BONES} from '../src/region_edit.js';
test('SSR fixed heads, transitional neck and rigid limb islands map into editable groups',()=>{
 assert.equal(anatomyKey('detached-head'),'head');
 assert.equal(anatomyKey('head-neck'),'neck');
 assert.equal(anatomyKey('leg.L-rigid'),'leg.L');
 assert.equal(anatomyKey('arm.R'),'arm.R');
 assert.equal(anatomyKey('torso'),'torso');
 assert.equal(REGION_BONES['leg.L'],'thigh.L');
});
test('region controls cover every classified vertex, even distant triangles',()=>{
 const owner=['leg.L','leg.L','leg.L-rigid','arm.R','torso','head-neck'];
 const ctx=[{meshName:'Body',ownership:owner.map(zone=>({zone})),adjacency:[[],[],[],[],[],[]]}];
 const targets=buildRegionTargets(ctx);
 const leg=targets.find(t=>t.id==='leg.L');
 assert.equal(leg.count,3);
 assert.deepEqual(leg.segments[0].indices,[0,1,2]);
 assert.equal(targets.find(t=>t.id==='neck').count,1);
});
test('disconnected skirt/wings can be selected independently within a leg region',()=>{
 const owner=Array.from({length:36},()=>({zone:'leg.L'}));
 const adjacency=Array.from({length:36},(_,i)=>{
  const a=i<18?0:18,b=a+18;
  return [i-1,i+1].filter(j=>j>=a&&j<b);
 });
 const targets=buildRegionTargets([{meshName:'Skirt',ownership:owner,adjacency}]);
 const pieces=targets.filter(t=>t.id.startsWith('piece:'));
 assert.equal(pieces.length,2);
 assert.equal(pieces[0].count,18);
 assert.equal(pieces[1].count,18);
});
