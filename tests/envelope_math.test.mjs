import test from 'node:test';
import assert from 'node:assert/strict';
import {fitEnvelopes,validateEnvelopeDraft,envelopeWeights} from '../src/envelope_math.js';
const names=['pelvis','spine','chest','neck','head'];
for(const side of ['L','R'])for(const part of ['shoulder','upper_arm','forearm','hand','thigh','shin','foot'])names.push(`${part}.${side}`);
const bones=names.map((name,i)=>({name,head:[i*.4,1,0],tail:[i*.4,2,0]}));
const bounds={min:[-1,0,-1],max:[9,4,1]};

test('auto-fits a validated 19-bone capsule set',()=>{
 const data=fitEnvelopes(bones,bounds,[]);
 assert.equal(Object.keys(data.envelopes).length,19);
 assert.equal(validateEnvelopeDraft(data,bones).envelopes['thigh.L'].mode,'smooth');
 assert.ok(data.envelopes['thigh.L'].radius>0);
});
test('increasing radius makes a previously unclaimed point covered',()=>{
 const data=fitEnvelopes(bones,bounds,[]);
 for (const entry of Object.values(data.envelopes)) entry.radius=.005;
 const point=[.4,1.5,.30];
 const before=envelopeWeights(point,bones,data,4);
 assert.equal(before.fallback,true);
 data.envelopes.spine.radius=.10;
 const after=envelopeWeights(point,bones,data,4);
 assert.equal(after.fallback,false);
 assert.equal(after.weights[0][0],'spine');
});
test('rigid envelopes assign full ownership even when smooth volumes overlap',()=>{
 const data=fitEnvelopes(bones,bounds,[]);
 data.envelopes.pelvis.radius=.20;
 data.envelopes.spine.radius=.20;
 data.envelopes.spine.mode='rigid';
 const result=envelopeWeights([.3,1.5,0],bones,data,4);
 assert.deepEqual(result.weights,[['spine',1]]);
});
test('all weights normalized with up to four influences',()=>{
 const data=fitEnvelopes(bones,bounds,[]);
 for(const e of Object.values(data.envelopes))e.radius=.25;
 const result=envelopeWeights([.8,1.5,0],bones,data,4);
 assert.ok(result.weights.length<=4);
 assert.ok(Math.abs(result.weights.reduce((s,w)=>s+w[1],0)-1)<1e-9);
});
test('rejects missing or unsafe envelope parameters',()=>{
 const data=fitEnvelopes(bones,bounds,[]);
 delete data.envelopes.head;
 assert.throws(()=>validateEnvelopeDraft(data,bones),/Invalid envelope/);
 data.envelopes.head={radius:Infinity,mode:'smooth'};
 assert.throws(()=>validateEnvelopeDraft(data,bones),/Invalid skin envelope/);
});
