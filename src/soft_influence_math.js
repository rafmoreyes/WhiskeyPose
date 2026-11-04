/* Pure, dependency-free soft influence mathematics. */
export const clamp01 = n => Math.min(1,Math.max(0,Number(n)||0));
export function editInfluence(indices,weights,offset,boneIndex,signedStrength,fallbackIndex){
  const current=new Map();
  for(let k=0;k<4;k++){const w=weights[offset+k];if(w>1e-7)current.set(indices[offset+k],(current.get(indices[offset+k])||0)+w);}
  const previous=current.get(boneIndex)||0;
  const amount=Math.min(1,Math.max(-1,signedStrength));
  const next=amount>=0?previous+(1-previous)*amount:previous*(1+amount);
  if(Math.abs(next-previous)<1e-8)return false;
  current.delete(boneIndex);
  if(!current.size && next<1-1e-7){
    if(!Number.isInteger(fallbackIndex)||fallbackIndex===boneIndex)return false;
    current.set(fallbackIndex,1);
  }
  const otherTotal=[...current.values()].reduce((a,b)=>a+b,0);
  const otherEntries=otherTotal>0?[...current].map(([name,w])=>[name,w/otherTotal*(1-next)]):[];
  otherEntries.sort((a,b)=>b[1]-a[1]);
  const ranked=[...(next>1e-7?[[boneIndex,next]]:[]),...otherEntries.slice(0,next>1e-7?3:4)].sort((a,b)=>b[1]-a[1]);
  const total=ranked.reduce((sum,[,w])=>sum+w,0);
  for(let k=0;k<4;k++){
    indices[offset+k]=ranked[k]?.[0]||0;
    weights[offset+k]=ranked[k]?ranked[k][1]/total:0;
  }
  return true;
}
/** Faces may have FBX UV seam duplication. Weld coincident seam vertices within
 * a single mesh only; do not bridge adjacent but separate mesh objects. */
export function makeAdjacency(points,faces,epsilon){
  const neighbors=Array.from({length:points.length},()=>new Set());
  const connect=(a,b)=>{
    if(Number.isInteger(a)&&Number.isInteger(b)&&a!==b&&a>=0&&b>=0&&a<points.length&&b<points.length){
      neighbors[a].add(b);neighbors[b].add(a);
    }
  };
  for(const face of faces){
    for(let k=0;k<face.length;k++)connect(face[k],face[(k+1)%face.length]);
  }
  const inv=1/Math.max(1e-9,epsilon),welds=new Map();
  for(let i=0;i<points.length;i++){
    const p=points[i],key=p.map(v=>Math.round(v*inv)).join(',');
    const prior=welds.get(key);
    if(prior!==undefined)connect(i,prior);else welds.set(key,i);
  }
  return neighbors.map(x=>[...x]);
}
function push(heap,item){
  let i=heap.length;heap.push(item);
  while(i>0){let p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;
}
function pop(heap){
  const item=heap[0],last=heap.pop();if(heap.length){
    let i=0;while(true){
      const a=i*2+1,b=a+1;if(a>=heap.length)break;
      const child=b<heap.length&&heap[b][0]<heap[a][0]?b:a;
      if(last[0]<=heap[child][0])break;
      heap[i]=heap[child];i=child;
    }heap[i]=last;
  }return item;
}
/** Geodesic Dijkstra in posed-space triangle edges, not Euclidean sphere. */
export function surfaceFalloff(adjacency,positionAt,seedIndices,center,radius){
  if(radius<=0) return [];
  const distances=new Map(),heap=[];
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const cache=new Map();
  const point=i=>{if(!cache.has(i))cache.set(i,positionAt(i));return cache.get(i)};
  for(const index of seedIndices){
    if(!Number.isInteger(index)||index<0||index>=adjacency.length)continue;
    const d=dist(point(index),center);
    if(d<radius && d<(distances.get(index)??Infinity)){
      distances.set(index,d);push(heap,[d,index]);
    }
  }
  const influenced=[];
  while(heap.length){
    const [d,index]=pop(heap);
    if(d>radius||d>distances.get(index)+1e-9)continue;
    const t=1-d/radius;
    const falloff=t*t*(3-2*t);
    if(falloff>0)influenced.push([index,falloff]);
    for(const next of adjacency[index]){
      const nd=d+dist(point(index),point(next));
      if(nd<=radius&&nd<(distances.get(next)??Infinity)){
        distances.set(next,nd);push(heap,[nd,next]);
      }
    }
  }
  return influenced;
}
