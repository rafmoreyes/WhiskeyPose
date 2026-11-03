import * as THREE from 'three';

/** Skin influence capsules anchored to current bone transforms, not marker rest pose.
 * Meshes are re-positioned each render frame; geometry is rebuilt only when a
 * radius/selection changes. On rigs the overlay follows the actual posed bones.
 */
export function createEnvelopeTool(scene) {
  const layer=new THREE.Group();
  layer.name='WhiskeyPose_SkinEnvelopes';scene.add(layer);
  const up=new THREE.Vector3(0,1,0),from=new THREE.Vector3(),to=new THREE.Vector3();
  let active=false,current=null,objects=new Map();
  function clear(){
    for(const item of objects.values()){
      layer.remove(item.fill);
      item.fill.geometry.dispose();item.fill.material.dispose();
      if(item.outline){item.fill.remove(item.outline);item.outline.material.dispose();}
    }
    objects.clear();
  }
  function refresh(){
    clear();
    if(!current?.bones?.length||!current.config)return;
    const {bones,config,selected,showAll,height}=current;
    for(const bone of bones){
      if(!showAll&&bone.name!==selected)continue;
      const setting=config.envelopes[bone.name];if(!setting)continue;
      const focus=bone.name===selected, radius=Math.max(.001,setting.radius*height);
      const restA=new THREE.Vector3(...bone.head),restB=new THREE.Vector3(...bone.tail);
      const restLength=restA.distanceTo(restB);
      const geometry=new THREE.CapsuleGeometry(radius,Math.max(0,restLength-2*radius),8,16);
      const material=new THREE.MeshBasicMaterial({color:focus?0xf3b971:0x55c4c1,transparent:true,
        opacity:focus?.23:.045,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
      const fill=new THREE.Mesh(geometry,material);fill.renderOrder=200;
      fill.userData.boneName=bone.name;layer.add(fill);
      let outline=null;
      if(focus){
        outline=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xffd194,transparent:true,opacity:.7,
          wireframe:true,depthTest:false,depthWrite:false}));
        outline.renderOrder=201;fill.add(outline);
      }
      objects.set(bone.name,{fill,outline,radius});
    }
    tick();layer.visible=active;
  }
  function tick(){
    if(!active||!current?.bones?.length)return;
    const bones=current.getPoseSegments?current.getPoseSegments():current.bones;
    for(const bone of bones){
      const item=objects.get(bone.name);if(!item)continue;
      from.fromArray(bone.head);to.fromArray(bone.tail);
      const delta=to.clone().sub(from),length=delta.length();
      if(length<1e-8)continue;
      // Rotation changes the pose, not the physical length of the rest bone.
      item.fill.position.copy(from).addScaledVector(delta,.5);
      item.fill.quaternion.setFromUnitVectors(up,delta.multiplyScalar(1/length));
    }
  }
  function update(data){current=data;refresh();}
  function setActive(value){active=Boolean(value);layer.visible=active;}
  return {update,setActive,clear,tick};
}
