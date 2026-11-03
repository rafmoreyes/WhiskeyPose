/** Pure WhiskeyPose envelope configuration shared with the Blender worker.
 * Each capsule is owned by one bone; radius is normalized to character height.
 */
export const ENVELOPE_SCHEMA = 'whiskeypose-skin-envelopes';
const BONES = /^(pelvis|spine|chest|neck|head|(?:shoulder|upper_arm|forearm|hand|thigh|shin|foot)\.[LR])$/;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const distanceSegmentSquared = (p,a,b) => {
  const v=a.map((_,i)=>b[i]-a[i]);
  const len2=v.reduce((s,x)=>s+x*x,0);
  const t=len2<1e-12 ? 0 : clamp(v.reduce((s,x,i)=>s+x*(p[i]-a[i]),0)/len2,0,1);
  return p.reduce((s,x,i)=>s+(x-a[i]-t*v[i])**2,0);
};
const baseRadius = (name) => name.startsWith('thigh.')?.066:name.startsWith('shin.')?.047:
  name.startsWith('foot.')?.05:name.startsWith('hand.')?.035:
  name.startsWith('upper_arm.')?.052:name.startsWith('forearm.')?.046:
  name.startsWith('shoulder.')?.07:name==='head'?.11:
  name==='neck'?.062:name==='chest'?.135:name==='spine'?.12:.12;

/** Automatic capsule fitting from geometry samples, constrained by anatomical defaults.
 * The nearest-bone filter rejects many nearby accessories, but cannot separate all
 * disconnected mesh islands; this is a starting point for human review.
 */
export function fitEnvelopes(bones, bounds, samplePoints = []) {
  if(!Array.isArray(bones)||bones.length!==19)throw Error('Expected 19 preview bones');
  const height=bounds.max[1]-bounds.min[1];
  if(!Number.isFinite(height)||height<=1e-9)throw Error('Invalid character bounds');
  const samples={}; for(const bone of bones)samples[bone.name]=[];
  for(const p of samplePoints){
    let best=Infinity,name=null;
    for(const bone of bones){
      const d2=distanceSegmentSquared(p,bone.head,bone.tail);
      if(d2<best){best=d2;name=bone.name;}
    }
    if(name)samples[name].push(Math.sqrt(best)/height);
  }
  const envelopes={};
  for(const bone of bones){
    const defaults=baseRadius(bone.name);
    const distances=samples[bone.name].sort((a,b)=>a-b);
    // Use the 80th percentile only for bones with sufficient nearby samples.
    // Clamp auto-fit to avoid giant accessory silhouettes overwhelming a joint.
    const observed=distances.length>=15 ? distances[Math.floor((distances.length-1)*.8)]*1.28 : defaults;
    envelopes[bone.name]={radius:Number(clamp(observed,defaults*.55,defaults*2.0).toFixed(5)),mode:'smooth'};
  }
  return {format:ENVELOPE_SCHEMA,version:1,envelopes};
}
export function validateEnvelopeDraft(data,bones){
  const names=bones.map(x=>x.name);
  if(!data||data.format!==ENVELOPE_SCHEMA||data.version!==1||!data.envelopes||
    Object.keys(data.envelopes).length!==names.length)throw Error('Invalid envelope payload');
  const copy={};
  for(const name of names){
    if(!BONES.test(name))throw Error('Unknown skeleton bone '+name);
    const row=data.envelopes[name];
    if(!row||typeof row.radius!=='number'||!Number.isFinite(row.radius)||row.radius<.002||row.radius>.4||!['smooth','rigid'].includes(row.mode))throw Error('Invalid skin envelope '+name);
    copy[name]={radius:row.radius,mode:row.mode};
  }
  return {format:ENVELOPE_SCHEMA,version:1,envelopes:copy};
}
export function envelopeWeights(point,bones,data,height){
  const hits=[];let closest=[Infinity,null];const rigid=[];
  for(const bone of bones){
    const name=bone.name,d2=distanceSegmentSquared(point,bone.head,bone.tail);
    if(d2<closest[0])closest=[d2,name];
    const r=height*data.envelopes[name].radius;
    if(d2>=r*r)continue;
    const n=Math.sqrt(d2)/r;
    if(data.envelopes[name].mode==='rigid')rigid.push([n,name]);
    else hits.push([(1-n*n)**2,name]);
  }
  if(rigid.length){rigid.sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:1));return {weights:[[rigid[0][1],1]],fallback:false};}
  if(!hits.length)return {weights:[[closest[1],1]],fallback:true};
  hits.sort((a,b)=>b[0]-a[0]||(a[1]<b[1]?-1:1));
  const top=hits.slice(0,4),sum=top.reduce((v,x)=>v+x[0],0);
  return {weights:top.map(([score,name])=>[name,score/sum]),fallback:false};
}
