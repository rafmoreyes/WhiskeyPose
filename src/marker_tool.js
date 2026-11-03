import * as THREE from 'three';
import {MARKER_DEFS, MARKER_KEYS, markerPair, reflectX, proposeMarkers, exportMarkerDraft, parseMarkerDraft, rigMarkerPayload} from './marker_math.js';
import {buildSkeletonTemplate} from './skeleton_solver.js';

/** Non-destructive marker placement. Confirmed positions are sent to the worker for rig generation. */
export function createMarkerTool({scene, camera, renderer, controls, meshes, onChange}) {
  const layer = new THREE.Group();
  layer.name = 'WhiskeyPose_AssistedMarkers';
  scene.add(layer);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let model = null, bounds = null, active = false, dragging = null;
  let selected = 'chin', symmetry = true, preview = false, radius = 0.02;
  let approvedSnapshot = null, previewError = null, previewBones = [];
  let positions = {}, confirmed = {}, markerMeshes = new Map();
  let skeletonGroup = null;
  const boneGeometry = new THREE.CylinderGeometry(1,1,1,8);
  const boneMaterial = new THREE.MeshBasicMaterial({color:0x5bdacb,transparent:true,opacity:.78,depthTest:false,depthWrite:false});

  function offsetPointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function notify(phase='update') { onChange?.(phase); }
  function positionFor(key) { const p = positions[key]; return p ? new THREE.Vector3(...p) : null; }
  function updateVisuals() {
    if (!model) return;
    for (const [key, item] of markerMeshes) {
      item.position.fromArray(positions[key]);
      const color = key === selected ? 0xffcd7c : (confirmed[key] ? 0x78d4ac : 0x5abfe7);
      item.material.color.setHex(color);
      item.scale.setScalar(key === selected ? 1.35 : 1);
      item.children[0].position.set(0, radius * (key === selected ? 2.65 : 2.4), 0);
      item.children[0].material.color.setHex(color);
    }
    updatePreview();
  }
  function clearSkeleton() {
    if (skeletonGroup) { layer.remove(skeletonGroup); skeletonGroup.clear(); skeletonGroup = null; }
    previewBones = []; previewError = null;
  }
  function updatePreview() {
    clearSkeleton();
    if (!preview || !model) return;
    try {
      // Calculate bone heads/tails from the exact normalized markers used by the Blender worker.
      const data = rigMarkerPayload(positions, Object.fromEntries(MARKER_KEYS.map(key=>[key,true])), {min:bounds.min.toArray(),max:bounds.max.toArray()});
      previewBones = buildSkeletonTemplate({min:bounds.min.toArray(),max:bounds.max.toArray()},data);
      skeletonGroup = new THREE.Group();
      skeletonGroup.name = 'WhiskeyPose_SkeletonPreview';
      const up = new THREE.Vector3(0,1,0);
      for (const bone of previewBones) {
        const head = new THREE.Vector3(...bone.head), tail = new THREE.Vector3(...bone.tail);
        const delta = tail.clone().sub(head);
        const rod = new THREE.Mesh(boneGeometry,boneMaterial);
        rod.scale.set(radius*.30,delta.length(),radius*.30);
        rod.position.copy(head).addScaledVector(delta,.5);
        rod.quaternion.setFromUnitVectors(up,delta.normalize());
        rod.renderOrder = 190;
        rod.userData.boneName = bone.name;
        skeletonGroup.add(rod);
      }
      layer.add(skeletonGroup);
    } catch (error) {
      previewError = error.message;
    }
  }
  function labelSprite(label) {
    const canvas=document.createElement('canvas'); canvas.width=240; canvas.height=54;
    const context=canvas.getContext('2d');
    context.font='600 24px Arial,sans-serif'; context.textAlign='center'; context.fillStyle='#ffffff';
    context.fillText(label,120,32);
    const texture=new THREE.CanvasTexture(canvas);
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});
    const sprite=new THREE.Sprite(material);
    sprite.scale.set(radius*10,radius*2.4,1);
    sprite.renderOrder=201;
    return sprite;
  }
  function clearVisuals() {
    layer.clear();
    for(const mesh of markerMeshes.values()) {
      mesh.geometry.dispose(); mesh.material.dispose();
      const label=mesh.children[0]; label.material.map.dispose();label.material.dispose();
    }
    markerMeshes.clear();
    clearSkeleton();
  }
  function makeVisuals() {
    clearVisuals(); if(!model)return;
    for(const def of MARKER_DEFS) {
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,14,10),new THREE.MeshBasicMaterial({color:0x5abfe7,depthTest:false,depthWrite:false}));
      mesh.name='Marker:'+def.key;
      mesh.userData.markerKey=def.key;
      mesh.renderOrder=200;
      mesh.add(labelSprite(def.label));
      markerMeshes.set(def.key,mesh); layer.add(mesh);
    }
    updateVisuals();
  }
  function place(key, point, isConfirmed=true) {
    positions[key]=point.toArray();confirmed[key]=isConfirmed;approvedSnapshot=null;
    const pair=markerPair(key);
    if(symmetry&&pair) { positions[pair]=reflectX(positions[key],(bounds.min.x+bounds.max.x)/2); confirmed[pair]=isConfirmed; }
    updateVisuals();
  }
  function suggest() {
    if(!model)return;
    const proposal=proposeMarkers({min:bounds.min.toArray(),max:bounds.max.toArray()});
    positions=proposal;approvedSnapshot=null;
    confirmed=Object.fromEntries(MARKER_KEYS.map(k=>[k,false]));
    // Prefill a front-facing location when the silhouette intersects the guess.
    const ray=new THREE.Raycaster(), front=new THREE.Vector3(0,0,-1), back=new THREE.Vector3(0,0,1);
    const size=bounds.getSize(new THREE.Vector3());
    for(const key of MARKER_KEYS) {
      const v=positions[key];
      const heel=key.startsWith('heel.');
      ray.set(new THREE.Vector3(v[0],v[1],heel ? bounds.min.z-Math.max(size.z,size.y)*2 : bounds.max.z+Math.max(size.z,size.y)*2),heel?back:front);
      const contact=ray.intersectObjects(meshes(),false)[0];
      if(contact)positions[key]=contact.point.toArray();
    }
    selected='chin';makeVisuals();notify('reset');
  }
  function setModel(next) {
    clearVisuals(); model=next; dragging=null;approvedSnapshot=null;preview=false;
    if(!model){bounds=null; positions={};confirmed={};layer.visible=false;return;}
    model.updateWorldMatrix(true,true);
    bounds=new THREE.Box3().setFromObject(model);
    radius=Math.max(bounds.getSize(new THREE.Vector3()).y*.012,0.005);
    layer.visible=active; suggest();
  }
  function setActive(value) {active=Boolean(value);layer.visible=active && Boolean(model);if(!active){dragging=null;controls.enabled=true;}}
  function choose(key){if(MARKER_KEYS.includes(key)){selected=key;updateVisuals();notify('select');}}
  function setSymmetry(value){symmetry=Boolean(value);notify('select');}
  function setPreview(value){preview=Boolean(value);updateVisuals();notify('update');}
  function confirmAll(){for(const key of MARKER_KEYS)confirmed[key]=true;updateVisuals();notify('update');}
  function approveSkeleton(){
    if(!preview)throw new Error('Open Skeleton Preview before approving.');
    if(previewError||previewBones.length!==19)throw new Error(previewError||'Cannot preview all bones.');
    const payload=asRigPayload();
    approvedSnapshot=JSON.stringify(payload);
    notify('update');
  }
  function asApprovedRigPayload(){
    const payload=asRigPayload();
    if(!approvedSnapshot||JSON.stringify(payload)!==approvedSnapshot)throw new Error('Preview and approve your skeleton before generating skin.');
    return payload;
  }
  function getStatus() {return {selected,symmetry,preview,previewError,previewBones:previewBones.length,approved:approvedSnapshot!==null,confirmed:{...confirmed},count:Object.values(confirmed).filter(Boolean).length,total:MARKER_KEYS.length,model:!!model};}
  function asDraft(name){return exportMarkerDraft(positions,confirmed,name,symmetry);}
  function loadDraft(data){const incoming=parseMarkerDraft(data);if(!model)throw new Error('Import a model first');const defaults=proposeMarkers({min:bounds.min.toArray(),max:bounds.max.toArray()});positions={...defaults,...incoming.positions};approvedSnapshot=null;preview=false;confirmed=Object.fromEntries(MARKER_KEYS.map(key=>[key,incoming.confirmation[key]===true]));symmetry=incoming.symmetry;makeVisuals();notify('update');return incoming.model;}
  function asRigPayload(){if(!model||!bounds)throw new Error('Import a model first');return rigMarkerPayload(positions,confirmed,{min:bounds.min.toArray(),max:bounds.max.toArray()});}
  function pickMarker() {
    const hits=raycaster.intersectObjects([...markerMeshes.values()],false);
    return hits.length?hits[0].object.userData.markerKey:null;
  }
  function beginDrag(event){
    if(!active||!model||event.button!==0||!layer.visible)return;
    offsetPointer(event);
    const marker=pickMarker();
    const surface=marker?null:raycaster.intersectObjects(meshes(),false)[0];
    if(!marker&&!surface)return;
    event.preventDefault();event.stopPropagation();controls.enabled=false;
    dragging=marker||selected;
    if(marker)selected=marker;
    if(surface)place(selected,surface.point);
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal, positionFor(dragging));
    renderer.domElement.setPointerCapture(event.pointerId);
    updateVisuals();notify('select');
  }
  function moveDrag(event){
    if(!dragging)return;
    event.preventDefault();offsetPointer(event);
    if(raycaster.ray.intersectPlane(dragPlane,hit)) {
      place(dragging,hit); // Plane follows camera; side view edits depth, front view edits X/Y.
    }
  }
  function endDrag(event){
    if(!dragging)return;
    if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
    dragging=null;controls.enabled=true;notify('update');
  }
  renderer.domElement.addEventListener('pointerdown',beginDrag,{capture:true});
  renderer.domElement.addEventListener('pointermove',moveDrag);
  renderer.domElement.addEventListener('pointerup',endDrag);
  renderer.domElement.addEventListener('pointercancel',endDrag);
  function frameView(mode){
    if(!model||!bounds)return;
    const center=bounds.getCenter(new THREE.Vector3());const size=bounds.getSize(new THREE.Vector3());
    const maxDim=Math.max(size.y,size.x,size.z,.1);
    const distance=maxDim/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.58;
    const direction=mode==='side'?new THREE.Vector3(1,0,0):mode==='front'?new THREE.Vector3(0,0,1):new THREE.Vector3(.8,.35,1).normalize();
    camera.position.copy(center).addScaledVector(direction,distance);
    controls.target.copy(center); camera.lookAt(center);camera.updateProjectionMatrix();controls.update();
  }
  return {setModel,setActive,choose,setSymmetry,setPreview,suggest,confirmAll,approveSkeleton,getStatus,asDraft,asApprovedRigPayload,loadDraft,frameView};
}
