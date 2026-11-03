import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKER_DEFS,MARKER_KEYS,markerPair,reflectX,proposeMarkers,exportMarkerDraft,parseMarkerDraft,rigMarkerPayload} from '../src/marker_math.js';
const bounds={min:[-1,0,-.5],max:[1,3,.5]};
const confirmations=()=>Object.fromEntries(MARKER_KEYS.map(k=>[k,true]));
test('13 markers include chest and bilateral heel and toe',()=>{
 assert.equal(MARKER_DEFS.length,13);
 for(const key of ['chest','heel.L','heel.R','toe.L','toe.R'])assert.ok(MARKER_KEYS.includes(key));
 for(const key of ['elbow.L','wrist.L','knee.L','heel.L','toe.L'])assert.equal(markerPair(key),key.replace('.L','.R'));
 assert.equal(markerPair('chest'),null);
 assert.deepEqual(reflectX([5,2,9],2),[-1,2,9]);
});
test('reset suggestion positions form independent complete 13-marker set',()=>{
 const a=proposeMarkers(bounds),b=proposeMarkers(bounds);
 assert.deepEqual(Object.keys(a).sort(),[...MARKER_KEYS].sort());
 assert.deepEqual(a,b);
 a['knee.L'][0]=900;
 assert.notEqual(a['knee.L'][0],b['knee.L'][0]);
});
test('v2 marker draft serializes and all confirmation flags persist',()=>{
 const original=proposeMarkers(bounds);
 const draft=exportMarkerDraft(original,confirmations(),'X.fbx',false);
 assert.equal(draft.version,2);
 const parsed=parseMarkerDraft(JSON.parse(JSON.stringify(draft)));
 assert.deepEqual(parsed.positions,original);
 assert.equal(parsed.confirmation['toe.L'],true);
 assert.deepEqual(parsed.missing,[]);
 assert.equal(parsed.symmetry,false);
});
test('older v1 files still open with missing new points reported for suggestions',()=>{
 const all=proposeMarkers(bounds),oldKeys=['chin','groin','elbow.L','elbow.R','wrist.L','wrist.R','knee.L','knee.R'];
 const markers=Object.fromEntries(oldKeys.map(k=>[k,{position:all[k],confirmed:true}]));
 const parsed=parseMarkerDraft({format:'whiskeypose-markers',version:1,space:'world-y-up',markers});
 assert.deepEqual(parsed.missing.sort(),['chest','heel.L','heel.R','toe.L','toe.R'].sort());
 assert.equal(parsed.confirmation['elbow.R'],true);
});
test('rig payload normalizes all 13 current points and respects confirmation',()=>{
 const p=proposeMarkers(bounds); assert.throws(()=>rigMarkerPayload(p,{},bounds),/Confirm all 13/);
 const packet=rigMarkerPayload(p,confirmations(),bounds);
 assert.equal(packet.space,'normalized-three-bounds-y-up');
 assert.equal(Object.keys(packet.markers).length,13);
 assert.ok(packet.markers.chest[1]>packet.markers.groin[1]);
 assert.ok(packet.markers['toe.L'][2]>packet.markers['heel.L'][2]);
 assert.throws(()=>rigMarkerPayload({...p,chest:[100,10,100]},confirmations(),bounds),/outside/);
});
test('invalid v2 marker files rejected',()=>{
 const data=exportMarkerDraft(proposeMarkers(bounds),{},'A.fbx',true);
 delete data.markers['toe.L'];
 assert.throws(()=>parseMarkerDraft(data),/toe.L/);
});
