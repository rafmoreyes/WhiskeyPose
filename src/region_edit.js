/** SSR anatomical ownership -> addressable Live Skin groups.
 * Optional connected pieces let the artist reach cloth wings without raycasting.
 * No geometry, skin weights or bone hierarchy is modified here.
 */
export const REGION_LABELS=Object.freeze({
 head:'Head / Hair',
 neck:'Neck / Head transition',
 torso:'Torso / Chest',
 'arm.L':'Left Arm',
 'arm.R':'Right Arm',
 'leg.L':'Left Leg',
 'leg.R':'Right Leg',
 other:'Other / Unclassified',
});
export const REGION_BONES=Object.freeze({
 head:'head',neck:'neck',torso:'chest',
 'arm.L':'upper_arm.L','arm.R':'upper_arm.R',
 'leg.L':'thigh.L','leg.R':'thigh.R',
 other:'pelvis',
});
export function anatomyKey(zone){
 const z=String(zone||'');
 if(z==='head'||z==='detached-head')return 'head';
 if(z==='head-neck'||z==='neck-chest'||z.startsWith('neck'))return 'neck';
 if(z.startsWith('arm.L'))return 'arm.L';
 if(z.startsWith('arm.R'))return 'arm.R';
 if(z.startsWith('leg.L'))return 'leg.L';
 if(z.startsWith('leg.R'))return 'leg.R';
 if(z==='torso'||z==='body')return 'torso';
 return 'other';
}
function components(indices,neighbors){
 const allowed=new Set(indices),visited=new Set(),parts=[];
 for(const seed of indices){
  if(visited.has(seed))continue;
  const stack=[seed],part=[];visited.add(seed);
  while(stack.length){
   const i=stack.pop();part.push(i);
   for(const other of neighbors[i]||[]){
    if(allowed.has(other)&&!visited.has(other)){visited.add(other);stack.push(other);}
   }
  }
  parts.push(part);
 }
 return parts.sort((a,b)=>b.length-a.length);
}
/** Build main region target + optional individual topology-connected pieces.
 * A region target may span several meshes; a piece is always a single mesh.
 * No floating point distance or brush sphere is involved in targeting.
 */
export function buildRegionTargets(contexts){
 const order=Object.keys(REGION_LABELS);
 const groups=new Map();
 const partsByRegion=new Map();
 for(let ci=0;ci<contexts.length;ci++){
  const ctx=contexts[ci],buckets=new Map();
  for(let i=0;i<ctx.ownership.length;i++){
   const key=anatomyKey(ctx.ownership[i]?.zone);
   if(!buckets.has(key))buckets.set(key,[]);
   buckets.get(key).push(i);
  }
  for(const [key,indices] of buckets){
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push({contextIndex:ci,indices});
   const pieces=components(indices,ctx.adjacency);
   if(!partsByRegion.has(key))partsByRegion.set(key,[]);
   for(const piece of pieces)if(piece.length>=12){
    partsByRegion.get(key).push({contextIndex:ci,indices:piece,
      meshName:String(ctx.meshName||'Mesh').slice(0,64)});
   }
  }
 }
 const result=[];
 for(const key of order){
  const segments=groups.get(key);
  if(!segments?.length)continue;
  const count=segments.reduce((sum,s)=>sum+s.indices.length,0);
  result.push({id:key,key,label:REGION_LABELS[key],count,segments});
  const pieces=partsByRegion.get(key)||[];
  const meaningful=pieces.filter(p=>p.indices.length>=12);
  // Do not flood the Inspector with tiny disconnected FBX triangles.
  // Show piece targeting only if region is actually split into multiple parts.
  if(meaningful.length>1){
   const shown=meaningful.sort((a,b)=>b.indices.length-a.indices.length).slice(0,8);
   for(let i=0;i<shown.length;i++){
    const part=shown[i],id='piece:'+key+':'+part.contextIndex+':'+i;
    result.push({id,key,label:'↳ '+REGION_LABELS[key]+' · '+part.meshName+' · part '+(i+1),
      count:part.indices.length,segments:[{contextIndex:part.contextIndex,indices:part.indices}]});
   }
  }
 }
 return result;
}
