import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKER_DEFS,MARKER_KEYS,markerPair,reflectX,proposeMarkers,exportMarkerDraft,parseMarkerDraft} from '../src/marker_math.js';
const box={min:[-1,0,-.5],max:[1,3,.5]};

test('eight markers, symmetric pair mappings',()=>{
 assert.equal(MARKER_DEFS.length,8);
 assert.deepEqual(MARKER_KEYS,['chin','groin','elbow.L','elbow.R','wrist.L','wrist.R','knee.L','knee.R']);
 assert.equal(markerPair('elbow.L'),'elbow.R');
 assert.equal(markerPair('wrist.R'),'wrist.L');
 assert.equal(markerPair('groin'),null);
});
test('mirrors anatomical positions around an arbitrary center X',()=>{
 assert.deepEqual(reflectX([5,2,9],2),[-1,2,9]);
});
test('proposes points on a symmetrical humanoid in valid world coordinates',()=>{
 const p=proposeMarkers(box);
 assert.deepEqual(Object.keys(p).sort(),[...MARKER_KEYS].sort());
 assert.equal(p['elbow.L'][0],-p['elbow.R'][0]);
 for(const position of Object.values(p))assert.equal(position.length,3);
});
test('saves and reloads marker drafts with confirmation and symmetry',()=>{
 const original=proposeMarkers(box);
 const confirmations=Object.fromEntries(MARKER_KEYS.map(k=>[k,k==='chin']));
 const output=exportMarkerDraft(original,confirmations,'A.fbx',false);
 const parsed=parseMarkerDraft(JSON.parse(JSON.stringify(output)));
 assert.deepEqual(parsed.positions,original);
 assert.equal(parsed.confirmation.chin,true);
 assert.equal(parsed.confirmation.groin,false);
 assert.equal(parsed.symmetry,false);
 assert.equal(parsed.model,'A.fbx');
});
test('rejects missing markers and malformed JSON coordinates',()=>{
 const value=exportMarkerDraft(proposeMarkers(box),{},'A.fbx',true);
 delete value.markers.chin;
 assert.throws(()=>parseMarkerDraft(value),/chin/);
 value.markers.chin={position:[0,Infinity,0]};
 assert.throws(()=>parseMarkerDraft(value),/chin/);
});
