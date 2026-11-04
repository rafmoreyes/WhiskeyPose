import * as THREE from 'three';
import { createPoseAwarePicker } from './soft_pick.js';

/** Paint directly on the visible skinned surface; orbit remains available when
 * the tool is disabled. No raycasts against hidden or occluded geometry.
 * Uses Three.js's skinned-mesh raycaster and current posed geometry. */
export function createSoftInfluenceTool({renderer,camera,scene,controls,meshes,liveSkin,onChange,onStrokeEnd,onHover}) {
  const canvas=renderer.domElement;
  const raycaster=new THREE.Raycaster();
  const picker=createPoseAwarePicker(THREE.DoubleSide);
  const mouse=new THREE.Vector2();
  const ring=new THREE.Mesh(
    new THREE.RingGeometry(.96,1,48),
    new THREE.MeshBasicMaterial({color:0xeeb576,transparent:true,opacity:.9,
      side:THREE.DoubleSide,depthWrite:false,depthTest:false})
  );
  ring.visible=false;ring.renderOrder=30;
  scene.add(ring);
  const normal=new THREE.Vector3(),up=new THREE.Vector3(0,0,1);
  let enabled=false,drawing=false,erase=false,name='upper_arm.L',radius=.045,strength=.3,pointerId=null,overSurface=null;
  function hit(event){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    mouse.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height*2-1));
    raycaster.setFromCamera(mouse,camera);
    // Posed meshes can extend far beyond their cached initial bounding sphere.
    // The picker recomputes it only when bone matrices or skin weights change,
    // and uses two-sided raycasts without altering the rendered material.
    return picker.pick(raycaster,meshes());
  }
  function moveCursor(result){
    if(!result?.face){ring.visible=false;return;}
    const obj=result.object;
    normal.copy(result.face.normal).transformDirection(obj.matrixWorld).normalize();
    // Keep the 3D brush ring camera-facing when painting back-facing cloth.
    if(normal.dot(raycaster.ray.direction)>0)normal.negate();
    ring.position.copy(result.point).addScaledVector(normal,.002*radius);
    ring.quaternion.setFromUnitVectors(up,normal);
    ring.scale.setScalar(radius);
    ring.visible=true;
  }
  function paint(result){
    if(!result||!liveSkin())return;
    const n=liveSkin().paintHit(result,name,radius,strength,erase);
    onChange?.(n,erase,liveSkin().brushStatus?.());
  }
  function down(event){
    if(!enabled||event.button!==0)return;
    const result=hit(event);
    if(!result)return;
    event.preventDefault();event.stopImmediatePropagation();
    drawing=true;erase=Boolean(event.shiftKey||eraseMode);
    pointerId=event.pointerId;
    controls.enabled=false;
    try{canvas.setPointerCapture(event.pointerId);}catch{}
    liveSkin()?.beginBrushStroke();
    moveCursor(result);paint(result);
  }
  let eraseMode=false;
  function move(event){
    if(!enabled)return;
    if(drawing){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.pointerId!==pointerId)return;
    }
    const result=hit(event);
    if(Boolean(result)!==overSurface){
      overSurface=Boolean(result);
      onHover?.(overSurface);
    }
    moveCursor(result);
    if(drawing)paint(result);
  }
  function end(event){
    if(!drawing || (event && event.pointerId!==undefined && pointerId!==event.pointerId))return;
    drawing=false;controls.enabled=true;
    try{if(pointerId!==null && canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId)}catch{}
    pointerId=null;
    if(liveSkin()?.endBrushStroke())onStrokeEnd?.();
  }
  canvas.addEventListener('pointerdown',down,true);
  canvas.addEventListener('pointermove',move,true);
  window.addEventListener('pointerup',end,true);
  window.addEventListener('pointercancel',end,true);
  canvas.addEventListener('pointerleave',()=>{if(!drawing)ring.visible=false;});
  function configure(params={}){
    if(params.name!==undefined)name=params.name;
    if(params.radius!==undefined)radius=params.radius;
    if(params.strength!==undefined)strength=params.strength;
    if(params.erase!==undefined)eraseMode=Boolean(params.erase);
  }
  function setActive(value){
    enabled=Boolean(value);
    if(!enabled){end();ring.visible=false;overSurface=null;}
    canvas.style.cursor=enabled?'crosshair':'';
    canvas.style.touchAction=enabled?'none':'';
  }
  function dispose(){
    setActive(false);
    canvas.removeEventListener('pointerdown',down,true);
    canvas.removeEventListener('pointermove',move,true);
    window.removeEventListener('pointerup',end,true);
    window.removeEventListener('pointercancel',end,true);
    scene.remove(ring);ring.geometry.dispose();ring.material.dispose();
  }
  return {setActive,configure,dispose};
}
