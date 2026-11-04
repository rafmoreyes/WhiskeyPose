import test from 'node:test';
import assert from 'node:assert/strict';
import {createPoseAwarePicker} from '../src/soft_pick.js';
function makeRig(){
  let recomputes=0;
  const bone={matrixWorld:{elements:[1,0,0,0]},updateWorldMatrix(){}};
  const material={side:0},index={version:0},weight={version:0};
  const mesh={
    isSkinnedMesh:true,visible:true,
    skeleton:{bones:[bone]},material,
    geometry:{getAttribute(name){return name==='skinIndex'?index:weight;}},
    updateWorldMatrix(){},
    computeBoundingSphere(){recomputes++;}
  };
  return {mesh,bone,material,index,weight,get recomputes(){return recomputes;}};
}
test('posed mesh bounding sphere refreshed on pose changes, not each mouse move',()=>{
 const rig=makeRig(),picker=createPoseAwarePicker(2);
 const caster={intersectObjects(){return [{object:rig.mesh,face:{a:0,b:1,c:2}}];}};
 assert.ok(picker.pick(caster,[rig.mesh]));
 assert.equal(rig.recomputes,1);
 picker.pick(caster,[rig.mesh]);
 assert.equal(rig.recomputes,1);
 rig.bone.matrixWorld.elements[0]=2;
 picker.pick(caster,[rig.mesh]);
 assert.equal(rig.recomputes,2);
 rig.weight.version++;
 picker.pick(caster,[rig.mesh]);
 assert.equal(rig.recomputes,3);
});
test('ray hits either face while restoring the original material',()=>{
 const rig=makeRig(),picker=createPoseAwarePicker(2);
 const caster={intersectObjects(objects){
   assert.deepEqual(objects,[rig.mesh]);
   assert.equal(rig.material.side,2);
   return [{object:rig.mesh,face:{a:0,b:1,c:2}}];
 }};
 const hit=picker.pick(caster,[rig.mesh]);
 assert.ok(hit);
 assert.equal(rig.material.side,0);
});
test('a backface-only raycast failure restores material and does not crash',()=>{
 const rig=makeRig(),picker=createPoseAwarePicker(2);
 const caster={intersectObjects(){throw Error('Synthetic raycast error');}};
 assert.throws(()=>picker.pick(caster,[rig.mesh]),/Synthetic/);
 assert.equal(rig.material.side,0);
});
test('raycast never tries to paint a detached non-skinned mesh',()=>{
 const rig=makeRig(),picker=createPoseAwarePicker(2);
 const caster={intersectObjects(objects){assert.deepEqual(objects,[rig.mesh]);return [];}};
 const other={isSkinnedMesh:false,visible:true,material:{side:0}};
 assert.equal(picker.pick(caster,[other,rig.mesh]),null);
});

test('a far-away posed garment tip becomes pickable after its bounding sphere moves',()=>{
 const rig=makeRig(),picker=createPoseAwarePicker(2);
 let bound=0;
 rig.mesh.computeBoundingSphere=()=>{bound=rig.bone.matrixWorld.elements[0];};
 const caster={intersectObjects(objects){
   return bound>=8 ? [{object:rig.mesh,face:{a:0,b:1,c:2}}]:[];
 }};
 assert.equal(picker.pick(caster,[rig.mesh]),null);
 rig.bone.matrixWorld.elements[0]=10; // tip moved beyond old cached bounds
 assert.ok(picker.pick(caster,[rig.mesh]));
});
test('multi-material front and back faces are selectable without persistent changes',()=>{
 const rig=makeRig(),picker=createPoseAwarePicker(2);
 const front={side:0},back={side:1};
 rig.mesh.material=[front,back];
 const caster={intersectObjects(){assert.equal(front.side,2);assert.equal(back.side,2);return [{object:rig.mesh,face:{}}];}};
 assert.ok(picker.pick(caster,[rig.mesh]));
 assert.equal(front.side,0);
 assert.equal(back.side,1);
});
