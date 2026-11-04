/** Pure skin-envelope mathematics shared by the browser's live solver.
 * Bone envelopes are authored as a percentage of character height.
 * The Blender implementation in backend/envelope_skin.py follows the same rules.
 */
export const ENVELOPE_SCHEMA = 'whiskeypose-skin-envelopes';
const BONES = /^(pelvis|spine|chest|neck|head|(?:shoulder|upper_arm|forearm|hand|thigh|shin|foot)\.[LR])$/;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export function distanceSegmentSquared(p,a,b) {
  const x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];
  const length2=x*x+y*y+z*z;
  const t=length2<1e-12?0:clamp(((p[0]-a[0])*x+(p[1]-a[1])*y+(p[2]-a[2])*z)/length2,0,1);
  const dx=p[0]-a[0]-t*x,dy=p[1]-a[1]-t*y,dz=p[2]-a[2]-t*z;
  return dx*dx+dy*dy+dz*dz;
}
const baseRadius = (name) => name.startsWith('thigh.')?.066:name.startsWith('shin.')?.047:
  name.startsWith('foot.')?.05:name.startsWith('hand.')?.035:
  name.startsWith('upper_arm.')?.052:name.startsWith('forearm.')?.046:
  name.startsWith('shoulder.')?.07:name==='head'?.11:
  name==='neck'?.062:name==='chest'?.135:name==='spine'?.12:.12;
export function fitEnvelopes(bones,bounds,samplePoints=[]) {
  if(!Array.isArray(bones)||bones.length!==19)throw Error('Expected 19 preview bones');
  const height=bounds.max[1]-bounds.min[1];
  if(!Number.isFinite(height)||height<=1e-9)throw Error('Invalid character bounds');
  const samples={}; for(const bone of bones)samples[bone.name]=[];
  for(const point of samplePoints){
    let best=Infinity,name=null;
    for(const bone of bones){
      const d2=distanceSegmentSquared(point,bone.head,bone.tail);
      if(d2<best){best=d2;name=bone.name;}
    }
    if(name)samples[name].push(Math.sqrt(best)/height);
  }
  const envelopes={};
  for(const bone of bones){
    const defaults=baseRadius(bone.name),distances=samples[bone.name].sort((a,b)=>a-b);
    const observed=distances.length>=15?distances[Math.floor((distances.length-1)*.8)]*1.28:defaults;
    envelopes[bone.name]={radius:Number(clamp(observed,defaults*.55,defaults*2.0).toFixed(5)),mode:'smooth',strength:1};
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
    const strength=row?.strength??1; // Existing 0.3.0 settings remain valid.
    if(!row||typeof row.radius!=='number'||!Number.isFinite(row.radius)||row.radius<.002||row.radius>.4||
       !['smooth','rigid'].includes(row.mode)||typeof strength!=='number'||!Number.isFinite(strength)||strength<0||strength>3)
      throw Error('Invalid skin envelope '+name);
    copy[name]={radius:row.radius,mode:row.mode,strength};
  }
  return {format:ENVELOPE_SCHEMA,version:1,envelopes:copy};
}
/** Calculate normalized weights from precomputed *squared* distance-to-bone segments.
 * Used when the artist moves a slider; distances need not be recalculated.
 */
export function weightsForDistances(names,distances,config,height,limit=4,ownership=null){
  if(ownership?.weights)return {weights:ownership.weights,fallback:false};
  const blocked=new Set(ownership?.blocked||[]);
  let nearest=Infinity,nearestName=null,nearestEnabled=Infinity,enabledName=null;
  const hits=[],rigid=[];
  for(let i=0;i<names.length;i++){
    const name=names[i],d2=distances[i],setting=config.envelopes[name];
    if(blocked.has(name))continue;
    if(d2<nearest){nearest=d2;nearestName=name;}
    const strength=setting.strength??1;
    if(strength>0 && d2<nearestEnabled){nearestEnabled=d2;enabledName=name;}
    if(strength<=0)continue;
    const radius=setting.radius*height;
    if(d2>=radius*radius)continue;
    const normalized=Math.sqrt(d2)/radius;
    if(setting.mode==='rigid')rigid.push([normalized,name]);
    else hits.push([((1-normalized*normalized)**2)*strength,name]);
  }
  if(rigid.length){rigid.sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:1));return {weights:[[rigid[0][1],1]],fallback:false};}
  if(!hits.length)return {weights:[[enabledName??nearestName,1]],fallback:true};
  hits.sort((a,b)=>b[0]-a[0]||(a[1]<b[1]?-1:1));
  const top=hits.slice(0,limit),sum=top.reduce((v,x)=>v+x[0],0);
  return {weights:top.map(([score,name])=>[name,score/sum]),fallback:false};
}
export function envelopeWeights(point,bones,data,height,ownership=null){
  const distances=bones.map(b=>distanceSegmentSquared(point,b.head,b.tail));
  return weightsForDistances(bones.map(b=>b.name),distances,data,height,4,ownership);
}
