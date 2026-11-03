import * as THREE from 'three';
import { distanceSegmentSquared, weightsForDistances } from './envelope_math.js';

/** Map FBXLoader's bone names (e.g. forearmR) to WhiskeyPose's forearm.R. */
const keyOf = name => String(name).toLowerCase().replace(/[^a-z0-9]/g,'');
const NEXT = {
  pelvis:'spine', spine:'chest', chest:'neck', neck:'head',
};
for(const side of ['L','R'])Object.assign(NEXT,{
  [`shoulder.${side}`]:`upper_arm.${side}`, [`upper_arm.${side}`]:`forearm.${side}`,
  [`forearm.${side}`]:`hand.${side}`, [`thigh.${side}`]:`shin.${side}`,
  [`shin.${side}`]:`foot.${side}`,
});

function copyBindMatrices(skeleton) {
  return skeleton.boneInverses.map(inverse => inverse.clone().invert());
}
function endpointVector(matrix) {return new THREE.Vector3().setFromMatrixPosition(matrix);}
function makeBoneSegments(skeleton,names,height) {
  const mapping=new Map(skeleton.bones.map((bone,index)=>[keyOf(bone.name),index]));
  const absent=names.filter(name=>!mapping.has(keyOf(name)));
  if(absent.length)throw Error(`Rig is missing envelope bones: ${absent.join(', ')}`);
  const restMatrices=copyBindMatrices(skeleton);
  return names.map(name=>{
    const index=mapping.get(keyOf(name)),bone=skeleton.bones[index];
    const head=endpointVector(restMatrices[index]);
    const next=NEXT[name],nextIndex=next===undefined?undefined:mapping.get(keyOf(next));
    const parentName=skeleton.bones[index].parent?.name;
    const parentIndex=parentName?mapping.get(keyOf(parentName)):undefined;
    let tail;
    if(nextIndex!==undefined){
      tail=endpointVector(restMatrices[nextIndex]);
    }else if(parentIndex!==undefined){
      const parentHead=endpointVector(restMatrices[parentIndex]);
      const direction=head.clone().sub(parentHead);
      if(direction.lengthSq()<1e-10)direction.set(0,1,0);
      const factor=name.startsWith('hand.')?.38:name.startsWith('foot.')?.55:name==='head'?1.3:.45;
      tail=head.clone().addScaledVector(direction,factor);
    }else{
      tail=head.clone().add(new THREE.Vector3(0,height*.05,0));
    }
    const toLocal=restMatrices[index].clone().invert();
    const headLocal=head.clone().applyMatrix4(toLocal);
    const tailLocal=tail.clone().applyMatrix4(toLocal);
    return {name,index,bone,head:head.toArray(),tail:tail.toArray(),headLocal,tailLocal};
  });
}

/** CPU-edit vertex skin attributes while keeping the current Three.js pose intact.
 * Distance-to-rest-bones is cached once, so moving a slider requires no raycasts,
 * Blender process, FBX reload or skeleton rebind.
 */
export function createLiveSkin(meshes,boneDefinitions,config) {
  const skinned=meshes.filter(mesh=>mesh?.isSkinnedMesh && mesh.skeleton && mesh.geometry?.attributes?.position);
  if(!skinned.length)throw Error('No skinned meshes available for live envelope editing');
  const names=boneDefinitions.map(b=>b.name);
  const contexts=[],ownedMaterials=[];
  const p=new THREE.Vector3();
  let minY=Infinity,maxY=-Infinity;
  // An imported pose is not used here: geometry vertices and bind matrices define rest space.
  for(const mesh of skinned){
    const pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i).applyMatrix4(mesh.bindMatrix);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    }
  }
  const height=maxY-minY;
  if(!Number.isFinite(height)||height<=1e-7)throw Error('Invalid rig bind-pose height');
  for(const mesh of skinned){
    // Some imported FBX models share geometry; cloned attributes must remain independent.
    mesh.geometry=mesh.geometry.clone();
    const geometry=mesh.geometry,vertices=geometry.attributes.position;
    const segments=makeBoneSegments(mesh.skeleton,names,height);
    const distances=new Float32Array(vertices.count*names.length);
    const rest=segments.map(s=>({head:s.head,tail:s.tail}));
    for(let i=0;i<vertices.count;i++){
      p.fromBufferAttribute(vertices,i).applyMatrix4(mesh.bindMatrix);
      const xyz=p.toArray();
      for(let j=0;j<rest.length;j++)distances[i*names.length+j]=distanceSegmentSquared(xyz,rest[j].head,rest[j].tail);
    }
    contexts.push({mesh,geometry,vertices,segments,distances,
      byName:new Map(segments.map(s=>[s.name,s.index])),
      originalMaterial:mesh.material, originalColors:geometry.getAttribute('color'), heatmapMaterial:null,
      skinIndex:null,skinWeight:null,weightForSelected:null});
  }
  const primary=contexts[0].segments;
  let showHeatmap=false, selected=names[0];
  function update(configNow,selectedName=selected){
    selected=selectedName;
    let outside=0,total=0;
    for(const ctx of contexts){
      const vertexCount=ctx.vertices.count,nb=names.length;
      const indices=new Uint16Array(vertexCount*4),weights=new Float32Array(vertexCount*4);
      const selectedWeights=new Float32Array(vertexCount);
      for(let i=0;i<vertexCount;i++){
        const answer=weightsForDistances(names,ctx.distances.subarray(i*nb,(i+1)*nb),configNow,height);
        if(answer.fallback)outside++;
        for(let j=0;j<answer.weights.length;j++){
          const [name,value]=answer.weights[j];
          indices[i*4+j]=ctx.byName.get(name);
          weights[i*4+j]=value;
          if(name===selected)selectedWeights[i]=value;
        }
      }
      total+=vertexCount;
      ctx.skinIndex=indices;ctx.skinWeight=weights;ctx.weightForSelected=selectedWeights;
      ctx.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
      ctx.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
      if(showHeatmap)colorize(ctx);
    }
    return {outside,total};
  }
  function colorize(ctx) {
    const colors=new Float32Array(ctx.vertices.count*3);
    for(let i=0;i<ctx.vertices.count;i++){
      const v=ctx.weightForSelected?.[i]||0;
      // dark blue (0) -> cyan (0.5) -> warm gold (1)
      const t=Math.min(1,Math.max(0,v));
      colors[i*3]=.09+.85*Math.max(0,(t-.36)/.64);
      colors[i*3+1]=.22+.57*Math.min(1,t*2);
      colors[i*3+2]=.28+.5*(1-t);
    }
    ctx.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    if(!ctx.heatmapMaterial){
      ctx.heatmapMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:0,side:THREE.DoubleSide});
      ownedMaterials.push(ctx.heatmapMaterial);
    }
    ctx.mesh.material=ctx.heatmapMaterial;
  }
  function toggleHeatmap(value){
    showHeatmap=Boolean(value);
    for(const ctx of contexts){
      if(showHeatmap){colorize(ctx);}
      else {
        ctx.mesh.material=ctx.originalMaterial;
        if(ctx.originalColors)ctx.geometry.setAttribute('color',ctx.originalColors);
        else ctx.geometry.deleteAttribute('color');
      }
    }
  }
  function poseSegments(){
    const vec=new THREE.Vector3();
    return primary.map(segment=>{
      const bone=segment.bone;
      const head=vec.copy(segment.headLocal).applyMatrix4(bone.matrixWorld).toArray();
      const tail=vec.copy(segment.tailLocal).applyMatrix4(bone.matrixWorld).toArray();
      return {name:segment.name,head,tail};
    });
  }
  function dispose(){
    toggleHeatmap(false);
    for(const m of ownedMaterials)m.dispose();
  }
  return {height, update,toggleHeatmap,poseSegments,dispose, get hasHeatmap(){return showHeatmap;}};
}
