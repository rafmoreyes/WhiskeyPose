/**
 * WhiskeyPose deformation scanner.
 * No animation assets, Blender worker, timeline, IK, or extra dependencies.
 * Test motion is added relative to the CURRENT artist pose and fully restored on Stop.
 */
export const DEFORMATION_STAGES = Object.freeze([
  {id:'head',label:'Head (rotation + nod)',seconds:3.6,tracks:[
    {bone:'head',axis:'y',degrees:22},{bone:'head',axis:'x',degrees:10}]},
  {id:'neck',label:'Neck (rotation + tilt)',seconds:3.6,tracks:[
    {bone:'neck',axis:'y',degrees:14},{bone:'neck',axis:'z',degrees:9}]},
  {id:'shoulders',label:'Shoulders + arms',seconds:3.6,tracks:[
    {bone:'shoulder.L',axis:'z',degrees:13},{bone:'shoulder.R',axis:'z',degrees:-13},
    {bone:'upper_arm.L',axis:'z',degrees:32},{bone:'upper_arm.R',axis:'z',degrees:-32}]},
  {id:'elbows',label:'Elbows + wrists',seconds:3.6,tracks:[
    {bone:'forearm.L',axis:'x',degrees:48,oneWay:true},
    {bone:'forearm.R',axis:'x',degrees:48,oneWay:true},
    {bone:'hand.L',axis:'z',degrees:13},{bone:'hand.R',axis:'z',degrees:-13}]},
  {id:'torso',label:'Torso + chest',seconds:3.6,tracks:[
    {bone:'spine',axis:'x',degrees:9},{bone:'chest',axis:'z',degrees:13}]},
  {id:'hips',label:'Hips + thighs',seconds:3.6,tracks:[
    {bone:'thigh.L',axis:'x',degrees:26},{bone:'thigh.R',axis:'x',degrees:-26}]},
  {id:'knees',label:'Knees',seconds:3.6,tracks:[
    {bone:'shin.L',axis:'x',degrees:48,oneWay:true},
    {bone:'shin.R',axis:'x',degrees:48,oneWay:true}]},
  {id:'feet',label:'Ankles + feet',seconds:3.6,tracks:[
    {bone:'foot.L',axis:'x',degrees:17},{bone:'foot.R',axis:'x',degrees:17}]},
]);
export const DEFORMATION_SECTIONS = Object.freeze([
  {id:'all',label:'Full scan — all joints'},
  ...DEFORMATION_STAGES.map(({id,label})=>({id,label})),
]);
const canonical = name => String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp = (value,a,b) => Math.min(b,Math.max(a,value));
export function sampleDeformationTrack(track,phase) {
  const t=clamp(phase,0,1);
  const envelope=Math.sin(Math.PI*t)**2; // 0 at both boundaries
  const wave=track.oneWay ? envelope : Math.sin(2*Math.PI*t)*envelope;
  return track.degrees*wave;
}
export function locateDeformationStage(seconds,focus='all') {
  const stages=focus==='all'?DEFORMATION_STAGES:DEFORMATION_STAGES.filter(stage=>stage.id===focus);
  if(!stages.length)throw Error('Invalid deformation section: '+focus);
  const total=stages.reduce((t,stage)=>t+stage.seconds,0);
  let t=((seconds%total)+total)%total;
  for(const stage of stages) {
    if(t<stage.seconds)return {stage,phase:t/stage.seconds,total};
    t-=stage.seconds;
  }
  return {stage:stages[stages.length-1],phase:0,total};
}
export function createDeformationTest(THREE) {
  const axisVectors={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  const bonesByName=new Map();
  let bones=[],snapshot=null,playing=false,paused=false,seconds=0,focus='all',speed=1,intensity=1;
  let stageLabel='—';
  function attach(nextBones) {
    stop();
    bones=Array.isArray(nextBones)?nextBones:[];
    bonesByName.clear();
    for(const bone of bones)if(!bonesByName.has(canonical(bone.name)))bonesByName.set(canonical(bone.name),bone);
  }
  function supportedCount() {
    const names=new Set(DEFORMATION_STAGES.flatMap(stage=>stage.tracks.map(track=>canonical(track.bone))));
    return [...names].filter(name=>bonesByName.has(name)).length;
  }
  function capture() {
    const baseline=new Map(),parentInv=new Map();
    for(const bone of bones){
      baseline.set(bone,bone.quaternion.clone());
      const inverse=bone.parent?.getWorldQuaternion
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
        : new THREE.Quaternion();
      parentInv.set(bone,inverse);
    }
    return {baseline,parentInv};
  }
  function restore() {
    if(!snapshot)return;
    for(const [bone,quat] of snapshot.baseline)bone.quaternion.copy(quat);
  }
  function play() {
    if(playing){paused=false;return true;}
    if(!supportedCount())return false;
    snapshot=capture();
    seconds=0;stageLabel='—';playing=true;paused=false;
    tick(0);
    return true;
  }
  function pause() {if(playing)paused=true;}
  function stop() {
    restore();
    snapshot=null;playing=false;paused=false;seconds=0;stageLabel='—';
  }
  function setFocus(value) {
    if(!DEFORMATION_SECTIONS.some(section=>section.id===value))throw Error('Unknown deformation section');
    stop();
    focus=value;
  }
  function setSpeed(value) {const parsed=Number(value);speed=clamp(Number.isFinite(parsed)?parsed:1,0,5);}
  function setIntensity(value) {intensity=clamp(Number(value)||1,.25,1.5);}
  function tick(deltaSeconds) {
    if(!playing||paused||!snapshot)return stageLabel;
    seconds+=clamp(Number(deltaSeconds)||0,0,.12)*speed;
    const {stage,phase}=locateDeformationStage(seconds,focus);
    stageLabel=stage.label;
    restore();
    for(const track of stage.tracks) {
      const bone=bonesByName.get(canonical(track.bone));
      if(!bone)continue;
      const degrees=sampleDeformationTrack(track,phase)*intensity;
      if(Math.abs(degrees)<1e-8)continue;
      const axis=axisVectors[track.axis].clone().applyQuaternion(snapshot.parentInv.get(bone)).normalize();
      const rotation=new THREE.Quaternion().setFromAxisAngle(axis,THREE.MathUtils.degToRad(degrees));
      bone.quaternion.premultiply(rotation);
    }
    return stageLabel;
  }
  function status(){return {playing,paused,focus,speed,intensity,stageLabel,supportedCount:supportedCount(),seconds};}
  return {attach,play,pause,stop,tick,setFocus,setSpeed,setIntensity,status};
}
