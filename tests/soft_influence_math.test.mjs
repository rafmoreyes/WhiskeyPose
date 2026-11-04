import test from 'node:test';
import assert from 'node:assert/strict';
import {editInfluence,makeAdjacency,surfaceFalloff} from '../src/soft_influence_math.js';
test('add SIB weight redistributes others, normalized, max 4 bones',()=>{
 const index=new Uint16Array([1,2,3,4]),weight=new Float32Array([.4,.3,.2,.1]);
 assert.equal(editInfluence(index,weight,0,5,.45,2),true);
 assert.equal([...index].includes(5),true);
 assert.ok(weight[index.indexOf(5)]>.44);
 assert.ok(Math.abs([...weight].reduce((a,b)=>a+b)-1)<1e-6);
});
test('shift reduce transfers influence to a neighboring bone',()=>{
 const index=new Uint16Array([1,0,0,0]),weight=new Float32Array([1,0,0,0]);
 assert.equal(editInfluence(index,weight,0,1,-.6,2),true);
 assert.ok(Math.abs(weight[0]-.6)<1e-6||Math.abs(weight[1]-.6)<1e-6);
 assert.ok([...index].includes(2));
});
test('geodesic painting never jumps to an unconnected nearby surface',()=>{
 const points=[[0,0,0],[.1,0,0],[0,.1,0],[0,0,.001],[.1,0,.001],[0,.1,.001]];
 const neighbors=makeAdjacency(points,[[0,1,2],[3,4,5]],.00001);
 const hits=surfaceFalloff(neighbors,i=>points[i],[0,1,2],[0,0,0],.2);
 assert.ok(hits.length===3);
 assert.ok(hits.every(([i])=>i<3));
});
test('duplicate vertices across UV seams are connected',()=>{
 const p=[[0,0,0],[1,0,0],[0,1,0],[0,0,0],[0,-1,0],[1,-1,0]];
 const neighbors=makeAdjacency(p,[[0,1,2],[3,4,5]],1e-6);
 assert.ok(neighbors[0].includes(3));
});

test('at 100% effect, center erase fully removes selected bone influence',()=>{
  const indexes=new Uint16Array([4,0,0,0]);
  const weights=new Float32Array([1,0,0,0]);
  const changed=editInfluence(indexes,weights,0,4,-1,5);
  assert.equal(changed,true);
  assert.equal(indexes[0],5);
  assert.equal(weights[0],1);
  assert.equal([...weights].reduce((a,b)=>a+b,0),1);
});
