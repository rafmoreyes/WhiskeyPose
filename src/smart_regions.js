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
