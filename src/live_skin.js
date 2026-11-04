import * as THREE from 'three';
import { distanceSegmentSquared, weightsForDistances } from './envelope_math.js';
import { headNeckOwnership, headOwnedComponents, meshRegionOwnerships } from './smart_regions.js';
import {editInfluence,makeAdjacency,surfaceFalloff} from './soft_influence_math.js';

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
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  // An imported pose is not used here: geometry vertices and bind matrices define rest space.
  for(const mesh of skinned){
    const pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i).applyMatrix4(mesh.bindMatrix);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
      const components=p.toArray();
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],components[k]);max[k]=Math.max(max[k],components[k]);}
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
    const restPoints=[];
    for(let i=0;i<vertices.count;i++){
      p.fromBufferAttribute(vertices,i).applyMatrix4(mesh.bindMatrix);
      const xyz=p.toArray();
      restPoints.push(xyz);
      for(let j=0;j<rest.length;j++)distances[i*names.length+j]=distanceSegmentSquared(xyz,rest[j].head,rest[j].tail);
    }
    const faces=[];
    const index=geometry.getIndex?.();
    if(index){for(let i=0;i+2<index.count;i+=3)faces.push([index.array[i],index.array[i+1],index.array[i+2]]);}
    else {for(let i=0;i+2<vertices.count;i+=3)faces.push([i,i+1,i+2]);}
    const headOwned=headOwnedComponents(restPoints,faces,segments,height);
    const ownershipHeadOnly=restPoints.map((xyz,i)=>headOwned[i]
      ? {zone:'detached-head',weights:[['head',1]]}
      : headNeckOwnership(xyz,segments,height));
    const ownershipSmart=meshRegionOwnerships(restPoints,faces,segments,height);
    contexts.push({mesh,geometry,vertices,segments,distances,restPoints,faces,
      adjacency:makeAdjacency(restPoints,faces,height*1e-6),ownershipHeadOnly,ownershipSmart,
      byName:new Map(segments.map(s=>[s.name,s.index])),
      byIndex:new Map(segments.map(s=>[s.index,s.name])),
      originalMaterial:mesh.material, originalColors:geometry.getAttribute('color'), heatmapMaterial:null,
      skinIndex:null,skinWeight:null,weightForSelected:null,
      sourceIndices:Uint16Array.from(geometry.getAttribute('skinIndex')?.array || new Uint16Array(vertices.count*4)),
      sourceWeights:Float32Array.from(geometry.getAttribute('skinWeight')?.array || new Float32Array(vertices.count*4)),
      paintedIndices:Uint16Array.from(geometry.getAttribute('skinIndex')?.array || new Uint16Array(vertices.count*4)),
      paintedWeights:Float32Array.from(geometry.getAttribute('skinWeight')?.array || new Float32Array(vertices.count*4)),
      touched:new Set()});
  }
  const primary=contexts[0].segments;
  let showHeatmap=false, showRegions=false, selected=names[0];
  let currentRegionMode='smart';
  let workingStroke=null;const undoHistory=[];
  function update(configNow,selectedName=selected,mode='envelope'){
    selected=selectedName;
    currentRegionMode=configNow.regionMode??'smart';
    let outside=0,total=0;const regions={};
    for(const ctx of contexts){
      const vertexCount=ctx.vertices.count,nb=names.length;
      const indices=new Uint16Array(vertexCount*4),weights=new Float32Array(vertexCount*4);
      const selectedWeights=new Float32Array(vertexCount);
      const useImportedWeights=mode==='smart-auto' || mode==='auto';
      const selectedIndex=ctx.byName.get(selected);
      for(let i=0;i<vertexCount;i++){
        const ownership=(currentRegionMode==='smart'?ctx.ownershipSmart:ctx.ownershipHeadOnly)[i];
        const zone=ownership?.zone??'unclassified';regions[zone]=(regions[zone]??0)+1;
        if(useImportedWeights){
          for(let j=0;j<4;j++){
            const slot=i*4+j;
            const usePaint=mode==='smart-auto';
            indices[slot]=(usePaint?ctx.paintedIndices:ctx.sourceIndices)[slot]||0;
            weights[slot]=(usePaint?ctx.paintedWeights:ctx.sourceWeights)[slot]||0;
            if(indices[slot]===selectedIndex)selectedWeights[i]+=weights[slot];
          }
        }else{
          const answer=weightsForDistances(names,ctx.distances.subarray(i*nb,(i+1)*nb),configNow,height,4,ownership);
          if(answer.fallback)outside++;
          for(let j=0;j<answer.weights.length;j++){
            const [name,value]=answer.weights[j];
            indices[i*4+j]=ctx.byName.get(name);
            weights[i*4+j]=value;
            if(name===selected)selectedWeights[i]=value;
          }
        }
      }
      total+=vertexCount;
      ctx.skinIndex=indices;ctx.skinWeight=weights;ctx.weightForSelected=selectedWeights;
      ctx.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
      ctx.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
      if(showHeatmap||showRegions)colorize(ctx);
    }
    return {outside,total,regions,regionMode:currentRegionMode};
  }

  function restoreVertex(ctx,i,oldIndices,oldWeights){
    const offset=i*4;
    for(let j=0;j<4;j++){
      ctx.paintedIndices[offset+j]=oldIndices[j];
      ctx.paintedWeights[offset+j]=oldWeights[j];
      ctx.skinIndex[offset+j]=oldIndices[j];
      ctx.skinWeight[offset+j]=oldWeights[j];
    }
    const differs=oldIndices.some((n,j)=>n!==ctx.sourceIndices[offset+j]||Math.abs(oldWeights[j]-ctx.sourceWeights[offset+j])>1e-5);
    if(differs)ctx.touched.add(i);else ctx.touched.delete(i);
  }
  function commitModifiedBuffers(ctx,selectedName){
    if(ctx.skinIndex){
      ctx.geometry.getAttribute('skinIndex').needsUpdate=true;
      ctx.geometry.getAttribute('skinWeight').needsUpdate=true;
    }
    const boneIndex=ctx.byName.get(selectedName);
    if(ctx.weightForSelected){
      for(let i=0;i<ctx.vertices.count;i++){
        let amount=0;
        for(let j=0;j<4;j++)if(ctx.skinIndex[i*4+j]===boneIndex)amount+=ctx.skinWeight[i*4+j];
        ctx.weightForSelected[i]=amount;
      }
    }
    if(showHeatmap||showRegions)colorize(ctx);
  }
  function beginBrushStroke(){
    if(workingStroke) return;
    workingStroke=new Map();
  }
  function paintHit(hit,name,radius,strength,erase=false){
    if(!workingStroke||!hit?.object||!hit.face)return 0;
    const ctx=contexts.find(c=>c.mesh===hit.object);
    if(!ctx||!ctx.skinIndex)return 0;
    const boneIndex=ctx.byName.get(name);
    if(!Number.isInteger(boneIndex))return 0;
    const hitPoint=hit.point.toArray();
    const temp=new THREE.Vector3(),cache=new Map();
    ctx.mesh.updateWorldMatrix?.(true,false);
    const worldPosition=i=>{
      if(!cache.has(i)){
        const point=ctx.mesh.getVertexPosition
          ? ctx.mesh.getVertexPosition(i,temp)
          : temp.fromBufferAttribute(ctx.vertices,i);
        cache.set(i,point.applyMatrix4(ctx.mesh.matrixWorld).toArray().slice());
      }
      return cache.get(i);
    };
    const affected=surfaceFalloff(ctx.adjacency,worldPosition,
      [hit.face.a,hit.face.b,hit.face.c],hitPoint,radius);
    if(!affected.length)return 0;
    let count=0,prev=workingStroke.get(ctx);
    if(!prev){prev=new Map();workingStroke.set(ctx,prev);}
    const rest=ctx.segments;
    for(const [i,falloff] of affected){
      const offset=i*4;
      const value=Math.min(.95,Math.max(.005,strength))*falloff;
      if(value<.0001)continue;
      let fallbackIndex=-1,nearest=Infinity;
      // For a 100%-rigid vertex, decreasing a bone must transfer ownership.
      // Prefer SSR-allowed bones, but an explicit brush correction can override
      // an incorrect SSR classification for the selected target bone.
      const plan=ctx.ownershipSmart[i];
      const allowed=plan?.allowed || rest.map(x=>x.name);
      for(const candidate of rest){
        if(candidate.index===boneIndex||!allowed.includes(candidate.name))continue;
        const d=distanceSegmentSquared(ctx.restPoints[i],candidate.head,candidate.tail);
        if(d<nearest){nearest=d;fallbackIndex=candidate.index;}
      }
      if(fallbackIndex<0){
        for(const candidate of rest){
          if(candidate.index===boneIndex)continue;
          const d=distanceSegmentSquared(ctx.restPoints[i],candidate.head,candidate.tail);
          if(d<nearest){nearest=d;fallbackIndex=candidate.index;}
        }
      }
      if(!prev.has(i)){
        prev.set(i,{
          indices:Array.from(ctx.paintedIndices.subarray(offset,offset+4)),
          weights:Array.from(ctx.paintedWeights.subarray(offset,offset+4))
        });
      }
      if(editInfluence(ctx.paintedIndices,ctx.paintedWeights,offset,boneIndex,
            erase?-value:value,fallbackIndex)){
        count++;
        for(let j=0;j<4;j++){
          ctx.skinIndex[offset+j]=ctx.paintedIndices[offset+j];
          ctx.skinWeight[offset+j]=ctx.paintedWeights[offset+j];
        }
        const changed=[0,1,2,3].some(j=>ctx.paintedIndices[offset+j]!==ctx.sourceIndices[offset+j]
          ||Math.abs(ctx.paintedWeights[offset+j]-ctx.sourceWeights[offset+j])>1e-5);
        if(changed)ctx.touched.add(i);else ctx.touched.delete(i);
      }
    }
    if(count)commitModifiedBuffers(ctx,name);
    return count;
  }
  function endBrushStroke(){
    if(!workingStroke)return false;
    const completed=[...workingStroke].filter(([,v])=>v.size);
    workingStroke=null;
    if(!completed.length)return false;
    undoHistory.push(completed);
    if(undoHistory.length>24)undoHistory.shift();
    return true;
  }
  function undoBrushStroke(name){
    endBrushStroke();
    const previous=undoHistory.pop();if(!previous)return false;
    for(const [ctx,entries] of previous){
      for(const [i,old] of entries)restoreVertex(ctx,i,old.indices,old.weights);
      commitModifiedBuffers(ctx,name);
    }
    return true;
  }
  function resetBrush(name){
    endBrushStroke();
    for(const ctx of contexts){
      for(const i of [...ctx.touched]){
        const offset=i*4;
        restoreVertex(ctx,i,Array.from(ctx.sourceIndices.subarray(offset,offset+4)),
          Array.from(ctx.sourceWeights.subarray(offset,offset+4)));
      }
      commitModifiedBuffers(ctx,name);
    }
    undoHistory.length=0;
  }
  function paintedCount(){return contexts.reduce((a,c)=>a+c.touched.size,0);}
  function getBrushEdits(){
    return {format:'whiskeypose-sib-v1',version:1,meshes:contexts
      .filter(ctx=>ctx.touched.size)
      .map(ctx=>({
        name:ctx.mesh.name||'SkinnedMesh',
        samples:[...ctx.touched].sort((a,b)=>a-b).map(i=>{
          const p=ctx.restPoints[i];
          const q=p.map((n,k)=>(n-min[k])/Math.max(1e-10,max[k]-min[k]));
          const w=[];
          for(let j=0;j<4;j++){
            const offset=i*4+j,value=ctx.paintedWeights[offset];
            if(value>1e-7)w.push([ctx.byIndex.get(ctx.paintedIndices[offset])||ctx.mesh.skeleton.bones[ctx.paintedIndices[offset]].name,value]);
          }
          return {p:q,w};
        })
      }))};
  }
  function regionColor(zone){
    if(zone.startsWith('head')||zone==='detached-head')return [.94,.72,.40];
    if(zone.startsWith('neck'))return [.78,.57,.80];
    if(zone.startsWith('arm.L'))return [.33,.80,.85];
    if(zone.startsWith('arm.R'))return [.25,.56,.84];
    if(zone.startsWith('leg.L'))return [.64,.84,.41];
    if(zone.startsWith('leg.R'))return [.35,.68,.37];
    if(zone==='torso')return [.89,.52,.48];
    return [.50,.50,.52];
  }
  function colorize(ctx) {
    const colors=new Float32Array(ctx.vertices.count*3);
    for(let i=0;i<ctx.vertices.count;i++){
      if(showRegions){
        const zone=(currentRegionMode==='smart'?ctx.ownershipSmart:ctx.ownershipHeadOnly)[i]?.zone??'unclassified';
        colors.set(regionColor(zone),i*3);
      }else{
        const v=ctx.weightForSelected?.[i]||0;
        const t=Math.min(1,Math.max(0,v));
        colors[i*3]=.09+.85*Math.max(0,(t-.36)/.64);
        colors[i*3+1]=.22+.57*Math.min(1,t*2);
        colors[i*3+2]=.28+.5*(1-t);
      }
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
    if(showHeatmap)showRegions=false;
    for(const ctx of contexts){
      if(showHeatmap||showRegions){colorize(ctx);}
      else {
        ctx.mesh.material=ctx.originalMaterial;
        if(ctx.originalColors)ctx.geometry.setAttribute('color',ctx.originalColors);
        else ctx.geometry.deleteAttribute('color');
      }
    }
  }
  function toggleRegions(value){
    showRegions=Boolean(value);
    if(showRegions)showHeatmap=false;
    for(const ctx of contexts){
      if(showRegions||showHeatmap)colorize(ctx);
      else {ctx.mesh.material=ctx.originalMaterial;
        if(ctx.originalColors)ctx.geometry.setAttribute('color',ctx.originalColors);
        else ctx.geometry.deleteAttribute('color');}
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
    toggleHeatmap(false);toggleRegions(false);
    for(const m of ownedMaterials)m.dispose();
  }
  return {height,update,toggleHeatmap,toggleRegions,poseSegments,dispose,
    beginBrushStroke,paintHit,endBrushStroke,undoBrushStroke,resetBrush,paintedCount,getBrushEdits,
    get hasHeatmap(){return showHeatmap;}, get hasRegionMap(){return showRegions;}};
}
