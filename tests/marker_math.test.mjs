import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKER_DEFS,MARKER_KEYS,markerPair,reflectX,proposeMarkers,exportMarkerDraft,parseMarkerDraft,rigMarkerPayload} from '../src/marker_math.js';
import {buildSkeletonTemplate} from '../src/skeleton_solver.js';
const bounds={min:[-1,0,-.5],max:[1,3,.5]};
const confirmations=()=>Object.fromEntries(MARKER_KEYS.map(k=>[k,true]));

test('16 markers: both shoulders, neck, chest and feet',()=>{
 assert.equal(MARKER_DEFS.length,16);
 for(const key of ['neck','chest','shoulder.L','shoulder.R','heel.L','heel.R','toe.L','toe.R'])assert.ok(MARKER_KEYS.includes(key));
 for(const key of ['shoulder.L','elbow.L','wrist.L','knee.L','heel.L','toe.L'])assert.equal(markerPair(key),key.replace('.L','.R'));
 assert.equal(markerPair('neck'),null);
 assert.deepEqual(reflectX([5,2,9],2),[-1,2,9]);
});
test('suggestions are a fresh complete 16-point set each reset',()=>{
 const a=proposeMarkers(bounds),b=proposeMarkers(bounds);
 assert.deepEqual(Object.keys(a).sort(),[...MARKER_KEYS].sort());
 assert.deepEqual(a,b);
 a['shoulder.L'][0]=999;
 assert.notEqual(a['shoulder.L'][0],b['shoulder.L'][0]);
});
test('v3 marker drafts preserve all 16 confirmed coordinates',()=>{
 const original=proposeMarkers(bounds);
 const draft=exportMarkerDraft(original,confirmations(),'X.fbx',false);
 assert.equal(draft.version,3);
 const parsed=parseMarkerDraft(JSON.parse(JSON.stringify(draft)));
 assert.deepEqual(parsed.positions,original);
 assert.equal(parsed.confirmation['shoulder.L'],true);
 assert.deepEqual(parsed.missing,[]);
 assert.equal(parsed.symmetry,false);
});
test('older v1 and v2 drafts load with new markers unconfirmed',()=>{
 const all=proposeMarkers(bounds);
 const versions=[
  [1,['chin','groin','elbow.L','elbow.R','wrist.L','wrist.R','knee.L','knee.R']],
  [2,['chin','chest','groin','elbow.L','elbow.R','wrist.L','wrist.R','knee.L','knee.R','heel.L','heel.R','toe.L','toe.R']],
 ];
 for(const [version,keys] of versions){
  const markers=Object.fromEntries(keys.map(k=>[k,{position:all[k],confirmed:true}]));
  const parsed=parseMarkerDraft({format:'whiskeypose-markers',version,space:'world-y-up',markers});
  assert.deepEqual(parsed.missing.sort(),MARKER_KEYS.filter(k=>!keys.includes(k)).sort());
  assert.equal(parsed.confirmation['elbow.R'],true);
 }
});
test('rig payload requires confirmation and produces 16 normalized points v2',()=>{
 const p=proposeMarkers(bounds);
 assert.throws(()=>rigMarkerPayload(p,{},bounds),/Confirm all 16/);
 const packet=rigMarkerPayload(p,confirmations(),bounds);
 assert.equal(packet.version,2);
 assert.equal(Object.keys(packet.markers).length,16);
 assert.ok(packet.markers.neck[1]>packet.markers.chest[1]);
 assert.ok(packet.markers['toe.L'][2]>packet.markers['heel.L'][2]);
 assert.throws(()=>rigMarkerPayload({...p,chest:[100,10,100]},confirmations(),bounds),/outside/);
});
test('skeleton preview computes 19 named connected bones from the approved marker payload',()=>{
 const p=proposeMarkers(bounds),packet=rigMarkerPayload(p,confirmations(),bounds);
 const bones=buildSkeletonTemplate(bounds,packet),byName=Object.fromEntries(bones.map(b=>[b.name,b]));
 assert.equal(bones.length,19);
 for(let i=0;i<3;i++)assert.ok(Math.abs(byName['upper_arm.L'].head[i]-p['shoulder.L'][i])<1e-9);
 for(let i=0;i<3;i++)assert.ok(Math.abs(byName['upper_arm.L'].tail[i]-p['elbow.L'][i])<1e-9);
 for(let i=0;i<3;i++)assert.ok(Math.abs(byName.neck.head[i]-p.neck[i])<1e-9);
 for(let i=0;i<3;i++)assert.ok(Math.abs(byName.neck.tail[i]-p.chin[i])<1e-9);
 for(let i=0;i<3;i++)assert.ok(Math.abs(byName['forearm.R'].tail[i]-p['wrist.R'][i])<1e-9);
 assert.equal(byName['forearm.R'].parent,'upper_arm.R');
 const shifted=structuredClone(p); shifted['shoulder.L'][1]-=.2;
 const after=buildSkeletonTemplate(bounds,rigMarkerPayload(shifted,confirmations(),bounds));
 assert.notDeepEqual(after.find(b=>b.name==='upper_arm.L').head,byName['upper_arm.L'].head);
});
test('skeleton rejects anatomy height inversion and overlapping joint positions',()=>{
 const points=proposeMarkers(bounds);points.neck=[...points.chest];
 const packet=rigMarkerPayload(points,confirmations(),bounds);
 assert.throws(()=>buildSkeletonTemplate(bounds,packet),/order|overlap/);
});
test('invalid v3 marker files rejected',()=>{
 const data=exportMarkerDraft(proposeMarkers(bounds),{},'A.fbx',true);
 delete data.markers['shoulder.L'];
 assert.throws(()=>parseMarkerDraft(data),/shoulder.L/);
});
