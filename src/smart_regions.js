/** Anatomical ownership before the envelope solver, matched to Python.
 * This is a deterministic head/neck pilot, not general AI segmentation.
 */
const smoothstep=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function headNeckOwnership(point,bones,height,up=1){
  const by=Object.fromEntries(bones.map(b=>[b.name,b]));
  if(!['head','neck','chest','shoulder.L','shoulder.R'].every(k=>by[k]))return null;
  const pivot=by.head.head,chest=by.chest.head;
  const y=point[up],py=pivot[up],cy=chest[up];
  const shoulderSpan=Math.hypot(...[0,1,2].filter(i=>i!==up).map(i=>by['shoulder.L'].tail[i]-by['shoulder.R'].tail[i]));
  const centerDist=Math.hypot(...[0,1,2].filter(i=>i!==up).map(i=>point[i]-pivot[i]));
  const headRadius=Math.max(.12*height,.48*shoulderSpan);
  const neckRadius=Math.max(.065*height,Math.min(.12*height,.32*shoulderSpan));
  const top=.020*height,band=.035*height;
  if(y>=py+top)return {zone:'head',weights:[['head',1]]};
  if(py-band<y&&y<py+top&&centerDist<=headRadius){
    const t=smoothstep((y-(py-band))/(top+band));
    return {zone:'head-neck',weights:[['head',t],['neck',1-t]].filter(([_,v])=>v>1e-8)};
  }
  const neckStart=cy+.025*height;
  if(neckStart<y&&y<=py-band&&centerDist<=neckRadius){
    const span=Math.max(py-band-neckStart,1e-9),n=smoothstep((y-neckStart)/span);
    return {zone:'neck-chest',weights:[['neck',n],['chest',1-n]].filter(([_,v])=>v>1e-8)};
  }
  return {zone:'body',blocked:['head','neck']};
}
export function isDetachedHeadPiece(points,bones,height,up=1){
  if(!points?.length||points.length<3)return false;
  const by=Object.fromEntries(bones.map(b=>[b.name,b]));
  if(!by.head||!by.chest)return false;
  const pivot=by.head.head,chest=by.chest.head,high=pivot[up]+.020*height;
  let countHigh=0,min=Infinity;
  const center=[0,0,0];
  for(const p of points){
    if(p[up]>high)countHigh++;
    min=Math.min(min,p[up]);
    for(let i=0;i<3;i++)center[i]+=p[i];
  }
  if(countHigh/points.length<.60||min<chest[up]-.075*height)return false;
  for(let i=0;i<3;i++)center[i]/=points.length;
  const dist=Math.hypot(...[0,1,2].filter(i=>i!==up).map(i=>center[i]-pivot[i]));
  return dist<=.24*height;
}
/** Classify disconnected triangle islands; welded duplicates bridge UV seams.
 * This is calculated once on the rest mesh, not on every Live Skin slider move.
 */
export function headOwnedComponents(points,faces,bones,height,up=1){
  const n=points.length,owned=new Uint8Array(n);
  if(n<3)return owned;
  const parent=Array.from({length:n},(_,i)=>i);
  function find(value){while(parent[value]!==value){parent[value]=parent[parent[value]];value=parent[value];}return value;}
  function union(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
  const tol=Math.max(height*1e-5,1e-9),seen=new Map();
  for(let i=0;i<n;i++){
    const key=points[i].map(v=>Math.round(v/tol)).join(',');
    if(seen.has(key))union(i,seen.get(key));else seen.set(key,i);
  }
  for(const face of faces){
    if(!face?.length)continue;
    const root=face[0];if(root<0||root>=n)continue;
    for(const j of face.slice(1))if(j>=0&&j<n)union(root,j);
  }
  const groups=new Map();
  for(let i=0;i<n;i++){
    const root=find(i);if(!groups.has(root))groups.set(root,[]);
    groups.get(root).push(i);
  }
  for(const indices of groups.values()){
    if(indices.length<3)continue;
    const step=Math.max(1,Math.floor(indices.length/1500));
    const sample=[];for(let i=0;i<indices.length;i+=step)sample.push(points[indices[i]]);
    if(isDetachedHeadPiece(sample,bones,height,up))for(const i of indices)owned[i]=1;
  }
  return owned;
}


// Alpha 0.3.3 SSR: chain ownership in rest space. Same rules as backend/smart_regions.py.
export const REGION_GROUPS=Object.freeze({
 torso:['pelvis','spine','chest'],
 'arm.L':['shoulder.L','upper_arm.L','forearm.L','hand.L'],
 'arm.R':['shoulder.R','upper_arm.R','forearm.R','hand.R'],
 'leg.L':['thigh.L','shin.L','foot.L'],
 'leg.R':['thigh.R','shin.R','foot.R'],
});
const distance2=(a,b)=>a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);
function segmentDistance2(point,bone){
 const a=bone.head,b=bone.tail,v=a.map((x,i)=>b[i]-x);
 const length2=v.reduce((sum,x)=>sum+x*x,0);
 const t=length2>1e-12?Math.max(0,Math.min(1,v.reduce((sum,x,i)=>sum+(point[i]-a[i])*x,0)/length2)):0;
 return a.reduce((sum,x,i)=>sum+(point[i]-x-t*v[i])**2,0);
}
export function spatialRegionOwnership(point,bones,height,up=1){
 const base=headNeckOwnership(point,bones,height,up);
 if(!base||base.weights)return base;
 const by=Object.fromEntries(bones.map(b=>[b.name,b]));
 const candidates=[];
 for(const [zone,names] of Object.entries(REGION_GROUPS)){
  const available=names.filter(name=>by[name]);
  if(available.length)candidates.push([Math.min(...available.map(name=>segmentDistance2(point,by[name]))),zone]);
 }
 if(!candidates.length)return base;
 candidates.sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:1));
 const zone=candidates[0][1],allowed=REGION_GROUPS[zone].filter(name=>by[name]);
 if(zone==='torso'){
  for(const side of ['L','R']){
   const arm=by['upper_arm.'+side];
   if(arm&&distance2(point,arm.head)<(.09*height)**2)
    for(const name of ['shoulder.'+side,'upper_arm.'+side])
     if(by[name]&&!allowed.includes(name))allowed.push(name);
   const hip=by['thigh.'+side];
   if(hip&&distance2(point,hip.head)<(.07*height)**2)allowed.push('thigh.'+side);
  }
 }else if(zone.startsWith('arm.')){
  const arm=by['upper_arm.'+zone.at(-1)];
  if(arm&&distance2(point,arm.head)<(.10*height)**2&&by.chest)allowed.push('chest');
 }else if(zone.startsWith('leg.')){
  const hip=by['thigh.'+zone.at(-1)];
  if(hip&&distance2(point,hip.head)<(.11*height)**2&&by.pelvis)allowed.push('pelvis');
 }
 return {zone,allowed:[...new Set(allowed)]};
}
export function meshRegionOwnerships(points,faces,bones,height,up=1){
 const n=points.length;
 if(!n)return [];
 const plan=points.map(p=>spatialRegionOwnership(p,bones,height,up));
 const headOwned=headOwnedComponents(points,faces,bones,height,up);
 for(let i=0;i<n;i++)if(headOwned[i])plan[i]={zone:'detached-head',weights:[['head',1]]};
 if(n<6)return plan;
 const parent=Array.from({length:n},(_,i)=>i);
 function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 function union(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
 const tol=Math.max(height*1e-5,1e-9),welded=new Map();
 for(let i=0;i<n;i++){
  const key=points[i].map(v=>Math.round(v/tol)).join(',');
  if(welded.has(key))union(i,welded.get(key));else welded.set(key,i);
 }
 for(const face of faces){
  if(!face?.length)continue;
  const first=face[0];if(first<0||first>=n)continue;
  for(let j=1;j<face.length;j++){const k=face[j];if(k>=0&&k<n)union(first,k);}
 }
 const components=new Map();
 for(let i=0;i<n;i++){
  const root=find(i);if(!components.has(root))components.set(root,[]);
  components.get(root).push(i);
 }
 if(components.size<=1)return plan;
 const by=Object.fromEntries(bones.map(b=>[b.name,b]));
 for(const indices of components.values()){
  if(indices.length<3||indices.length>n*.50)continue;
  const tally=new Map();
  for(const i of indices){
   const zone=plan[i]?.zone;
   if(zone&&REGION_GROUPS[zone])tally.set(zone,(tally.get(zone)||0)+1);
  }
  let zone=null,count=0;
  for(const [name,amount] of tally)if(amount>count){zone=name;count=amount;}
  if(!zone||count<indices.length*.75)continue;
  const extrema=[0,1,2].map(k=>{
   let mn=Infinity,mx=-Infinity;
   for(const i of indices){mn=Math.min(mn,points[i][k]);mx=Math.max(mx,points[i][k]);}
   return mx-mn;
  });
  const extent=Math.max(...extrema),centroid=[0,0,0];
  for(const i of indices)for(let k=0;k<3;k++)centroid[k]+=points[i][k];
  for(let k=0;k<3;k++)centroid[k]/=indices.length;
  const winner=REGION_GROUPS[zone].filter(name=>by[name])
   .map(name=>by[name]).sort((a,b)=>segmentDistance2(centroid,a)-segmentDistance2(centroid,b))[0];
  const rigid=extent<.095*height&&segmentDistance2(centroid,winner)<(.10*height)**2;
  for(const i of indices){
   if(['detached-head','head','head-neck','neck-chest'].includes(plan[i]?.zone))continue;
   if(rigid)plan[i]={zone:zone+'-rigid',weights:[[winner.name,1]]};
   else{
    const allowed=[...REGION_GROUPS[zone]];
    if(zone.startsWith('arm.'))allowed.push('chest');
    if(zone.startsWith('leg.'))allowed.push('pelvis');
    plan[i]={zone,allowed:allowed.filter(name=>by[name])};
   }
  }
 }
 return plan;
}
