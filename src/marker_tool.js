import * as THREE from 'three';
import {MARKER_DEFS, MARKER_KEYS, markerPair, reflectX, proposeMarkers, exportMarkerDraft, parseMarkerDraft} from './marker_math.js';

/** An independent, non-destructive joint-marker layer. Does NOT modify bones or skin weights. */
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
  let selected = 'chin', symmetry = true, preview = true, radius = 0.02;
  let positions = {}, confirmed = {}, markerMeshes = new Map();
  let previewLines = null;

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
  function updatePreview() {
    if (previewLines) { layer.remove(previewLines); previewLines.geometry.dispose(); previewLines.material.dispose(); previewLines = null; }
    if (!preview || !model) return;
    const p = (key) => positionFor(key);
    const middle = (a,b,t) => a.clone().lerp(b,t);
    const chest = middle(p('groin'),p('chin'),0.73);
    const shoulders = {};
    const width = bounds.max.x - bounds.min.x;
    for (const side of ['L','R']) {
      const elbow=p('elbow.'+side), wrist=p('wrist.'+side);
      const sign=side==='L'?1:-1;
      shoulders[side] = new THREE.Vector3(chest.x+sign*width*.115, chest.y + (p('chin').y-p('groin').y)*0.02, middle(elbow,wrist,0.0).z);
    }
    const points=[];
    const segment=(a,b)=>{if(a&&b)points.push(a,b);};
    segment(p('groin'),chest); segment(chest,p('chin'));
    for(const side of ['L','R']) {
      const elbow=p('elbow.'+side), wrist=p('wrist.'+side), knee=p('knee.'+side);
      segment(chest,shoulders[side]); segment(shoulders[side],elbow); segment(elbow,wrist);
      const hip=new THREE.Vector3(p('groin').x+(side==='L'?1:-1)*width*.08,p('groin').y,p('groin').z);
      segment(p('groin'),hip); segment(hip,knee);
      const ankle=new THREE.Vector3(knee.x,knee.y-(p('groin').y-bounds.min.y)*0.55,knee.z);
      ankle.y = Math.max(bounds.min.y+radius*2,ankle.y);
      segment(knee,ankle);
    }
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const material=new THREE.LineBasicMaterial({color:0x71d1c2,transparent:true,opacity:.82,depthTest:false,depthWrite:false});
    previewLines=new THREE.LineSegments(geometry,material);
    previewLines.renderOrder=199;
    layer.add(previewLines);
  }
  function labelSprite(label) {
    const canvas=document.createElement('canvas'); canvas.width=240; canvas.height=54;
    const context=canvas.getContext('2d');
    context.font='600 24px Arial,sans-serif'; context.textAlign='center'; context.fillStyle='#ffffff';
    context.fillText(label,120,32);
    const texture=new THREE.CanvasTexture(canvas);
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});
    const sprite=new THREE.Sprite(material);
    sprite.scale.set(radius*14,radius*3.15,1);
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
    if (previewLines) { previewLines.geometry.dispose();previewLines.material.dispose(); previewLines=null; }
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
    positions[key]=point.toArray();confirmed[key]=isConfirmed;
    const pair=markerPair(key);
    if(symmetry&&pair) { positions[pair]=reflectX(positions[key],(bounds.min.x+bounds.max.x)/2); confirmed[pair]=isConfirmed; }
    updateVisuals();
  }
  function suggest() {
    if(!model)return;
    const proposal=proposeMarkers({min:bounds.min.toArray(),max:bounds.max.toArray()});
    positions=proposal;
    confirmed=Object.fromEntries(MARKER_KEYS.map(k=>[k,false]));
    // Prefill a front-facing location when the silhouette intersects the guess.
    const ray=new THREE.Raycaster(), front= new THREE.Vector3(0,0,-1);
    const size=bounds.getSize(new THREE.Vector3());
    for(const key of MARKER_KEYS) {
      const v=positions[key];
      ray.set(new THREE.Vector3(v[0],v[1],bounds.max.z+Math.max(size.z,size.y)*2),front);
      const contact=ray.intersectObjects(meshes(),false)[0];
      if(contact)positions[key]=contact.point.toArray();
    }
    selected='chin';makeVisuals();notify('reset');
  }
  function setModel(next) {
    clearVisuals(); model=next; dragging=null;
    if(!model){bounds=null; positions={};confirmed={};layer.visible=false;return;}
    model.updateWorldMatrix(true,true);
    bounds=new THREE.Box3().setFromObject(model);
    radius=Math.max(bounds.getSize(new THREE.Vector3()).y*.012,0.005);
    layer.visible=active; suggest();
  }
  function setActive(value) {active=Boolean(value);layer.visible=active && Boolean(model);if(!active){dragging=null;controls.enabled=true;}}
  function choose(key){if(MARKER_KEYS.includes(key)){selected=key;updateVisuals();notify('select');}}
  function setSymmetry(value){symmetry=Boolean(value);notify('select');}
  function setPreview(value){preview=Boolean(value);updateVisuals();notify('select');}
  function confirmAll(){for(const key of MARKER_KEYS)confirmed[key]=true;updateVisuals();notify('update');}
  function getStatus() {return {selected,symmetry,preview,confirmed:{...confirmed},count:Object.values(confirmed).filter(Boolean).length,total:MARKER_KEYS.length,model:!!model};}
  function asDraft(name){return exportMarkerDraft(positions,confirmed,name,symmetry);}
  function loadDraft(data){const incoming=parseMarkerDraft(data);if(!model)throw new Error('Import a model first');positions=incoming.positions;confirmed=incoming.confirmation;symmetry=incoming.symmetry;makeVisuals();notify('update');return incoming.model;}
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
  return {setModel,setActive,choose,setSymmetry,setPreview,suggest,confirmAll,getStatus,asDraft,loadDraft,frameView};
}
