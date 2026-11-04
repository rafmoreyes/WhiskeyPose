/** Browser preview of the same 19-bone template produced by backend/marker_rig.py.
 * This is an actual bone head/tail preview, NOT a weighted deformation preview.
 * Both solvers are compared in automated parity tests for normalized coordinates.
 */
import {MARKER_KEYS} from './marker_math.js';
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,f)=>a.map(v=>v*f);
const length=(a)=>Math.hypot(...a);
const unit=(a)=>scale(a,1/Math.max(length(a),1e-10));

export function buildSkeletonTemplate(bounds,payload){
  if(!bounds||!Array.isArray(bounds.min)||!Array.isArray(bounds.max))throw Error('Invalid model bounds');
  if(!payload||payload.format!=='whiskeypose-rig-markers'||payload.version!==2||payload.space!=='normalized-three-bounds-y-up')throw Error('Unsupported marker payload');
  const values=payload.markers;
  if(!values||typeof values!=='object'||Object.keys(values).length!==16||MARKER_KEYS.some(k=>!(k in values)))throw Error('All 16 joint markers are required');
  const min=bounds.min,max=bounds.max,size=min.map((v,i)=>max[i]-v);
  if([...min,...max].some(v=>!Number.isFinite(v))||size.some(v=>!Number.isFinite(v)||v<=1e-9))throw Error('Invalid model bounds');
  const markers={};
  for(const key of MARKER_KEYS){
    const n=values[key];
    if(!Array.isArray(n)||n.length!==3||n.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<-.25||v>1.25))throw Error('Invalid marker: '+key);
    markers[key]=n.map((v,i)=>min[i]+v*size[i]);
  }
  const {groin,chest,neck,chin}=markers;
  if(!(groin[1]<chest[1]&&chest[1]<neck[1]&&neck[1]<chin[1]))throw Error('Joint order must be Groin below Chest below Neck below Chin');
  const height=size[1], width=size[0];
  const pelvisEnd=lerp(groin,chest,.18);
  // Chin is a landmark; head rotation begins at the cranium base.
  const headPivot=lerp(neck,chin,.72);
  const headTop=[chin[0],Math.max(chin[1]+height*.045,min[1]+height*.965),chin[2]];
  const bones=[];
  function bone(name,head,tail,parent=null){
    if(length(sub(tail,head))<=height*.001)throw Error('Joint positions overlap: '+name);
    bones.push({name,head,tail,parent});
  }
  bone('pelvis',groin,pelvisEnd);
  bone('spine',pelvisEnd,chest,'pelvis');
  bone('chest',chest,neck,'spine');
  bone('neck',neck,headPivot,'chest');
  bone('head',headPivot,headTop,'neck')
  for(const [side,sign] of [['L',1],['R',-1]]){
    const shoulder=markers[`shoulder.${side}`],elbow=markers[`elbow.${side}`],wrist=markers[`wrist.${side}`],knee=markers[`knee.${side}`],heel=markers[`heel.${side}`],toe=markers[`toe.${side}`];
    bone(`shoulder.${side}`,neck,shoulder,'chest');
    bone(`upper_arm.${side}`,shoulder,elbow,`shoulder.${side}`);
    bone(`forearm.${side}`,elbow,wrist,`upper_arm.${side}`);
    bone(`hand.${side}`,wrist,add(wrist,scale(unit(sub(wrist,elbow)),height*.045)),`forearm.${side}`);
    const hip=[groin[0]+sign*width*.085,groin[1],groin[2]];
    bone(`thigh.${side}`,hip,knee,'pelvis');
    const ankle=add(add(heel,scale(unit(sub(knee,heel)),height*.038)),scale(sub(toe,heel),.10));
    bone(`shin.${side}`,knee,ankle,`thigh.${side}`);
    bone(`foot.${side}`,ankle,toe,`shin.${side}`);
  }
  return bones;
}
