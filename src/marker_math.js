/** WhiskeyPose joint-marker data (Three.js world Y-up). Pure functions. */
export const MARKER_DEFS = Object.freeze([
  {key:'chin',label:'Chin',hint:'Under the jaw',side:null},
  {key:'chest',label:'Chest',hint:'Sternum / upper chest',side:null},
  {key:'groin',label:'Groin',hint:'Pelvis center',side:null},
  {key:'elbow.L',label:'Left elbow',hint:'Elbow joint',side:'L'},
  {key:'elbow.R',label:'Right elbow',hint:'Elbow joint',side:'R'},
  {key:'wrist.L',label:'Left wrist',hint:'Hand / forearm junction',side:'L'},
  {key:'wrist.R',label:'Right wrist',hint:'Hand / forearm junction',side:'R'},
  {key:'knee.L',label:'Left knee',hint:'Kneecap / knee joint',side:'L'},
  {key:'knee.R',label:'Right knee',hint:'Kneecap / knee joint',side:'R'},
  {key:'heel.L',label:'Left heel',hint:'Heel, near ankle base',side:'L'},
  {key:'heel.R',label:'Right heel',hint:'Heel, near ankle base',side:'R'},
  {key:'toe.L',label:'Left foot point',hint:'Ball / toe of foot',side:'L'},
  {key:'toe.R',label:'Right foot point',hint:'Ball / toe of foot',side:'R'},
]);
export const MARKER_KEYS=Object.freeze(MARKER_DEFS.map(({key})=>key));
const OLD_KEYS=['chin','groin','elbow.L','elbow.R','wrist.L','wrist.R','knee.L','knee.R'];
export const markerPair=(key)=>key.endsWith('.L')?key.slice(0,-1)+'R':key.endsWith('.R')?key.slice(0,-1)+'L':null;
export const reflectX=(p,cx)=>[2*cx-p[0],p[1],p[2]];
function checkPoint(p,key){if(!Array.isArray(p)||p.length!==3||!p.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e8))throw Error(`Invalid marker: ${key}`);return [...p];}
export function proposeMarkers(bounds){
  if(!bounds||!Array.isArray(bounds.min)||!Array.isArray(bounds.max))throw Error('Invalid bounds');
  const [minX,minY,minZ]=bounds.min,[maxX,maxY,maxZ]=bounds.max;
  if(![...bounds.min,...bounds.max].every(Number.isFinite))throw Error('Non-finite bounds');
  const w=maxX-minX,h=maxY-minY,d=maxZ-minZ;
  if(w<=0||h<=0||d<0)throw Error('Invalid bounds');
  const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  const tPose=w/h>0.85;
  const point=(x,y,z=0)=>[cx+x*w,minY+y*h,cz+z*d];
  const elbowY=tPose?.765:.68,wristY=tPose?.752:.59;
  return {
    chin:point(0,.845,.15),chest:point(0,.728,.18),groin:point(0,.525,.13),
    'elbow.L':point(.29,elbowY,.06),'elbow.R':point(-.29,elbowY,.06),
    'wrist.L':point(.43,wristY,.07),'wrist.R':point(-.43,wristY,.07),
    'knee.L':point(.105,.285,.1),'knee.R':point(-.105,.285,.1),
    'heel.L':point(.10,.055,-.15),'heel.R':point(-.10,.055,-.15),
    'toe.L':point(.10,.025,.42),'toe.R':point(-.10,.025,.42),
  };
}
export function exportMarkerDraft(positions,confirmation,modelName,symmetry){
  const markers={};for(const key of MARKER_KEYS)markers[key]={position:checkPoint(positions[key],key),confirmed:confirmation[key]===true};
  return {format:'whiskeypose-markers',version:2,space:'world-y-up',model:modelName||'',symmetry:Boolean(symmetry),markers};
}
export function parseMarkerDraft(data){
  if(!data||data.format!=='whiskeypose-markers'||![1,2].includes(data.version)||data.space!=='world-y-up'||!data.markers)throw Error('Not a WhiskeyPose marker file (v1/v2)');
  const keys=data.version===1?OLD_KEYS:MARKER_KEYS;
  const positions={},confirmation={};
  for(const key of keys){const row=data.markers[key];positions[key]=checkPoint(row?.position,key);confirmation[key]=row?.confirmed===true;}
  return {positions,confirmation,missing:MARKER_KEYS.filter(k=>!keys.includes(k)),symmetry:data.symmetry!==false,model:typeof data.model==='string'?data.model:''};
}
/** Convert Three.js world markers to normalized model bounds for Blender worker.
 * Blender converts normalized (X,Y,Z) -> (X, -Z, Y); depth is reversed.
 * This avoids frontend/Blender FBX unit-scale differences. */
export function rigMarkerPayload(positions,confirmation,bounds){
  if(MARKER_KEYS.some(key=>confirmation[key]!==true))throw Error('Confirm all 13 markers before generating a rig.');
  if(!bounds||!Array.isArray(bounds.min)||!Array.isArray(bounds.max))throw Error('Missing model bounds');
  const size=bounds.max.map((v,i)=>v-bounds.min[i]);
  if(size.some(v=>!Number.isFinite(v)||v<=1e-9))throw Error('Invalid model bounds for rigging');
  const markers={};
  for(const key of MARKER_KEYS){const p=checkPoint(positions[key],key);const n=p.map((v,i)=>(v-bounds.min[i])/size[i]);if(n.some(v=>v<-.25||v>1.25))throw Error(`Marker ${key} is too far outside the model bounds`);markers[key]=n;}
  return {format:'whiskeypose-rig-markers',version:1,space:'normalized-three-bounds-y-up',markers};
}
