import * as THREE from 'three';

/** Editable capsule display. The actual skin computation runs in Blender. */
export function createEnvelopeTool(scene) {
  const layer = new THREE.Group();
  layer.name = 'WhiskeyPose_SkinEnvelopes';
  scene.add(layer);
  const up = new THREE.Vector3(0,1,0);
  let active = false, current = null;
  function clear() {
    for(const child of [...layer.children]) {
      layer.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }
  function refresh() {
    clear();
    layer.visible = active;
    if(!current?.bones?.length || !current?.config) return;
    const {bones, config, selected, showAll, height} = current;
    for(const bone of bones) {
      if(!showAll && bone.name!==selected) continue;
      const setting=config.envelopes[bone.name];
      if(!setting)continue;
      const radius=setting.radius*height;
      const a=new THREE.Vector3(...bone.head), b=new THREE.Vector3(...bone.tail);
      const d=b.clone().sub(a),len=d.length();
      if(len<1e-7)continue;
      const focus=bone.name===selected;
      const material=new THREE.MeshBasicMaterial({
        color:focus?0xe4b16f:0x68babb,
        transparent:true,opacity:focus?.29:.075,
        wireframe:!focus,side:THREE.DoubleSide,depthTest:false,depthWrite:false,
      });
      const capsule=new THREE.Mesh(new THREE.CapsuleGeometry(radius,Math.max(0,len-2*radius),5,12),material);
      capsule.position.copy(a).addScaledVector(d,.5);
      capsule.quaternion.setFromUnitVectors(up,d.normalize());
      capsule.renderOrder=180;
      capsule.userData.boneName=bone.name;
      layer.add(capsule);
    }
  }
  function update(data) {current=data;refresh();}
  function setActive(value) {active=Boolean(value);layer.visible=active;}
  return {update,setActive,clear};
}
