import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Minimal matrix/buffer mocks exercise the Three.js integration contract without a
// GPU or network package install. Actual render/FBX validation remains artist-run.
class Matrix4{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Matrix4(this.x,this.y,this.z);}
  invert(){this.x=-this.x;this.y=-this.y;this.z=-this.z;return this;}
}
class Vector3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  fromBufferAttribute(buffer,i){this.x=buffer.array[i*buffer.itemSize];this.y=buffer.array[i*buffer.itemSize+1];this.z=buffer.array[i*buffer.itemSize+2];return this;}
  applyMatrix4(matrix){this.x+=matrix.x;this.y+=matrix.y;this.z+=matrix.z;return this;}
  setFromMatrixPosition(matrix){this.x=matrix.x;this.y=matrix.y;this.z=matrix.z;return this;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  toArray(){return [this.x,this.y,this.z];}
}
class Attribute{constructor(array,itemSize){this.array=array;this.itemSize=itemSize;this.count=array.length/itemSize;}}
class CopiedUint16Attribute extends Attribute {
  constructor(array,itemSize){super(new Uint16Array(array),itemSize);this.version=0;}
  set needsUpdate(flag){if(flag)this.version++;}
}
class CopiedFloat32Attribute extends Attribute {
  constructor(array,itemSize){super(new Float32Array(array),itemSize);this.version=0;}
  set needsUpdate(flag){if(flag)this.version++;}
}
class Geometry{
  constructor(positions){this.attributes={position:new Attribute(new Float32Array(positions.flat()),3)};}
  clone(){const copy=new Geometry([]);copy.attributes={...this.attributes};return copy;}
  getAttribute(name){return this.attributes[name];}
  setAttribute(name,attribute){this.attributes[name]=attribute;}
  deleteAttribute(name){delete this.attributes[name];}
}
class Material{dispose(){this.disposed=true;}}
globalThis.__WP_TEST_THREE={Vector3,Uint16BufferAttribute:CopiedUint16Attribute,Float32BufferAttribute:CopiedFloat32Attribute,
  MeshStandardMaterial:Material,DoubleSide:2};
const math=readFileSync(new URL('../src/envelope_math.js',import.meta.url),'utf8');
const mathUrl='data:text/javascript;base64,'+Buffer.from(math).toString('base64');
const regions=readFileSync(new URL('../src/smart_regions.js',import.meta.url),'utf8');
const regionsUrl='data:text/javascript;base64,'+Buffer.from(regions).toString('base64');
const softMath=readFileSync(new URL('../src/soft_influence_math.js',import.meta.url),'utf8');
const softMathUrl='data:text/javascript;base64,'+Buffer.from(softMath).toString('base64');
let source=readFileSync(new URL('../src/live_skin.js',import.meta.url),'utf8');
source=source.replace("import * as THREE from 'three';","const THREE = globalThis.__WP_TEST_THREE;").replace("from './envelope_math.js'",`from '${mathUrl}'`).replace("from './smart_regions.js'",`from '${regionsUrl}'`).replace("from './soft_influence_math.js'",`from '${softMathUrl}'`);
const live=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const names=['pelvis','spine','chest','neck','head'];
for(const side of ['L','R'])for(const part of ['shoulder','upper_arm','forearm','hand','thigh','shin','foot'])names.push(`${part}.${side}`);
const bones=names.map((name,index)=>({name,parent:null,matrixWorld:new Matrix4(index*.4,0,0)}));
const inverses=bones.map(b=>new Matrix4(-b.matrixWorld.x,0,0));
const skeleton={bones,boneInverses:inverses};
function rig(){
  const geometry=new Geometry([[.05,0,0],[.25,.08,0],[.85,.05,0],[0,1,0]]);
  const material={tag:'original'};
  return {mesh:{isSkinnedMesh:true,geometry,bindMatrix:new Matrix4(),skeleton,material},geometry,material};
}
function config(){
  const envelopes=Object.fromEntries(names.map(name=>[name,{radius:.4,mode:'smooth',strength:1}]));
  return {format:'whiskeypose-skin-envelopes',version:1,envelopes};
}

test('skin buffers update live, while keeping the same skeleton, pose, and geometry model',()=>{
  const {mesh}=rig(),settings=config();
  const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),settings);
  const savedPose=mesh.skeleton.bones[1].matrixWorld;
  const savedMesh=mesh;
  const first=ctl.update(settings,'pelvis');
  const original=mesh.geometry.getAttribute('skinWeight').array.slice();
  settings.envelopes.pelvis.strength=3;
  const second=ctl.update(settings,'pelvis');
  const modified=mesh.geometry.getAttribute('skinWeight').array;
  assert.notDeepEqual(Array.from(modified),Array.from(original));
  assert.strictEqual(mesh,savedMesh);
  assert.strictEqual(mesh.skeleton.bones[1].matrixWorld,savedPose);
  assert.equal(first.total,4);assert.equal(second.total,4);
  ctl.dispose();
});
test('capsule pose endpoints follow current bone transforms, not the original marker locations',()=>{
  const {mesh}=rig();const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),config());
  const before=ctl.poseSegments().find(x=>x.name==='spine');
  const prior=mesh.skeleton.bones[1].matrixWorld;
  mesh.skeleton.bones[1].matrixWorld=new Matrix4(prior.x,prior.y+2,prior.z);
  const after=ctl.poseSegments().find(x=>x.name==='spine');
  assert.equal(after.head[1]-before.head[1],2);
  assert.equal(after.tail[1]-before.tail[1],2);
  mesh.skeleton.bones[1].matrixWorld=prior;
  ctl.dispose();
});
test('heatmap can be toggled without permanently replacing the material',()=>{
  const {mesh,material}=rig();const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),config());
  ctl.update(config(),'pelvis');ctl.toggleHeatmap(true);
  assert.notEqual(mesh.material,material);
  assert.ok(mesh.geometry.getAttribute('color'));
  ctl.toggleHeatmap(false);
  assert.strictEqual(mesh.material,material);
  assert.equal(mesh.geometry.getAttribute('color'),undefined);
  ctl.dispose();
});

test('automatic mode preserves Blender FBX weights even after optional envelope override',()=>{
  const {mesh}=rig(),settings=config();
  const inputIndex=new Uint16Array([0,1,2,0, 0,1,2,0, 0,1,2,0, 0,1,2,0]);
  const inputWeights=new Float32Array([.7,.2,.1,0, .3,.6,.1,0, .1,.7,.2,0, .1,.1,.8,0]);
  mesh.geometry.setAttribute('skinIndex',new Attribute(inputIndex,4));
  mesh.geometry.setAttribute('skinWeight',new Attribute(inputWeights,4));
  const original=Array.from(inputWeights);
  const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),settings);
  const before=ctl.update(settings,'pelvis','smart-auto');
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('skinWeight').array),original);
  assert.equal(before.total,4);
  settings.envelopes.pelvis.strength=3;
  ctl.update(settings,'pelvis','envelope');
  assert.notDeepEqual(Array.from(mesh.geometry.getAttribute('skinWeight').array),original);
  ctl.update(settings,'pelvis','smart-auto');
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('skinWeight').array),original);
  ctl.dispose();
});

test('SIB directly edits live skinned buffers, undo restores them, while pose remains unchanged',()=>{
  const {mesh}=rig(),settings=config();
  const inputIndex=new Uint16Array(16),inputWeights=new Float32Array(16);
  for(let i=0;i<4;i++){inputIndex[i*4]=0;inputIndex[i*4+1]=1;inputWeights[i*4]=.8;inputWeights[i*4+1]=.2;}
  mesh.geometry.setAttribute('skinIndex',new Attribute(inputIndex,4));
  mesh.geometry.setAttribute('skinWeight',new Attribute(inputWeights,4));
  mesh.matrixWorld=new Matrix4();mesh.name='Body';
  const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),settings);
  ctl.update(settings,'pelvis','smart-auto');
  const before=Array.from(mesh.geometry.getAttribute('skinWeight').array);
  const poseRef=mesh.skeleton.bones[0].matrixWorld;
  ctl.beginBrushStroke();
  const count=ctl.paintHit({object:mesh,face:{a:0,b:1,c:2},point:{toArray:()=>[.05,0,0]}},
    'pelvis',.5,.35,false);
  assert.ok(count>0);
  assert.equal(ctl.endBrushStroke(),true);
  assert.notDeepEqual(Array.from(mesh.geometry.getAttribute('skinWeight').array),before);
  assert.ok(ctl.paintedCount()>0);
  const exportData=ctl.getBrushEdits();
  assert.equal(exportData.format,'whiskeypose-sib-v1');
  assert.ok(exportData.meshes[0].samples.length>0);
  assert.ok(Math.abs(exportData.meshes[0].samples[0].w.reduce((sum,entry)=>sum+entry[1],0)-1)<1e-5);
  assert.strictEqual(mesh.skeleton.bones[0].matrixWorld,poseRef);
  assert.equal(ctl.undoBrushStroke('pelvis'),true);
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('skinWeight').array),before);
  assert.equal(ctl.paintedCount(),0);
  ctl.dispose();
});

// THREE.Uint16BufferAttribute and THREE.Float32BufferAttribute COPY their input.
// Regression for Alpha 0.3.5: painted CPU arrays must point at GEOMETRY arrays
// or the heatmap changes while the actual skinned deformation stays frozen.
test('SIB brush updates actual GPU upload arrays despite typed-array copies',()=>{
  const {mesh}=rig(),settings=config();
  mesh.name='TestBody';
  const initialIndices=new Uint16Array(16);
  const initialWeights=new Float32Array(16);
  for(let i=0;i<4;i++){
    initialIndices[i*4]=0;initialIndices[i*4+1]=1;
    initialWeights[i*4]=.8;initialWeights[i*4+1]=.2;
  }
  mesh.geometry.setAttribute('skinIndex',new Attribute(initialIndices,4));
  mesh.geometry.setAttribute('skinWeight',new Attribute(initialWeights,4));
  mesh.matrixWorld=new Matrix4();
  const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),settings);
  ctl.update(settings,'pelvis','smart-auto');
  const indexAttr=mesh.geometry.getAttribute('skinIndex');
  const weightAttr=mesh.geometry.getAttribute('skinWeight');
  const before=Array.from(weightAttr.array);
  const vertexXOffset=()=>{
    // Simulates GPU skin blend of pelvis (+1 X) and spine (+0 X) in a test pose.
    let sum=0;
    for(let j=0;j<4;j++)if(indexAttr.array[j]===0)sum+=weightAttr.array[j];
    return sum;
  };
  const beforeX=vertexXOffset();
  ctl.beginBrushStroke();
  const changed=ctl.paintHit({object:mesh,face:{a:0,b:1,c:2},
    point:{toArray:()=>[.05,0,0]}},'pelvis',.5,.5,false);
  assert.ok(changed>0);
  ctl.endBrushStroke();
  assert.notDeepEqual(Array.from(weightAttr.array),before,
    'GPU skinWeight BufferAttribute must change, not just an intermediate CPU array');
  assert.ok(weightAttr.version>0,'actual GPU upload attribute must be marked needsUpdate');
  assert.ok(indexAttr.version>0,'skin indices must also be flagged for upload');
  assert.ok(vertexXOffset()>beforeX,
    'pose deformation result should respond to painted weights');
  ctl.undoBrushStroke('pelvis');
  assert.deepEqual(Array.from(weightAttr.array),before,'Undo must restore GPU buffer values');
  ctl.dispose();
});

test('Reduce on zero weight is a true no-op with no phantom Undo entry',()=>{
  const {mesh}=rig(),settings=config();
  mesh.name='Body';mesh.matrixWorld=new Matrix4();
  const ids=new Uint16Array(16),wts=new Float32Array(16);
  for(let i=0;i<4;i++){ids[i*4]=0;wts[i*4]=1;}
  mesh.geometry.setAttribute('skinIndex',new Attribute(ids,4));
  mesh.geometry.setAttribute('skinWeight',new Attribute(wts,4));
  const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),settings);
  ctl.update(settings,'thigh.L','smart-auto');
  ctl.beginBrushStroke();
  const n=ctl.paintHit({object:mesh,face:{a:0,b:1,c:2},
    point:{toArray:()=>[.05,0,0]}},'thigh.L',.5,1,true);
  assert.equal(n,0);
  assert.equal(ctl.endBrushStroke(),false);
  assert.equal(ctl.paintedCount(),0);
  assert.equal(ctl.undoBrushStroke('thigh.L'),false);
  ctl.dispose();
});

test('SIB reports sparse geometry instead of silently pretending a dab worked',()=>{
 const {mesh}=rig(),settings=config();
 mesh.name='Body';mesh.matrixWorld=new Matrix4();
 const indices=new Uint16Array(16),weights=new Float32Array(16);
 for(let i=0;i<4;i++)weights[i*4]=1;
 mesh.geometry.setAttribute('skinIndex',new Attribute(indices,4));
 mesh.geometry.setAttribute('skinWeight',new Attribute(weights,4));
 const ctl=live.createLiveSkin([mesh],names.map(name=>({name})),settings);
 ctl.update(settings,'pelvis','smart-auto');
 ctl.beginBrushStroke();
 const count=ctl.paintHit({object:mesh,face:{a:0,b:1,c:2},
   point:{toArray:()=>[999,999,999]}},'pelvis',.01,.5,false);
 assert.equal(count,0);
 assert.match(ctl.brushStatus(),/no vertex in brush radius/);
 assert.equal(ctl.endBrushStroke(),false);
 ctl.dispose();
});
