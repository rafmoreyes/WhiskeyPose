/**
 * Keep skinned-mesh raycasts aligned with CURRENT pose and skin weights.
 * SkinnedMesh computes a boundingSphere lazily once. Posed cloth or an arm
 * can move outside that cached sphere and become impossible to pick.
 *
 * Raycasts use DoubleSide TEMPORARILY; materials are restored immediately,
 * including when the raycaster throws. This module is pure for Node tests.
 */
export function createPoseAwarePicker(doubleSide) {
  const previous=new WeakMap();
  function poseSignature(mesh) {
    const bones=mesh.skeleton?.bones||[];
    // Update ancestors before sampling matrices and the posed bounding sphere.
    for(const bone of bones)bone.updateWorldMatrix?.(true,false);
    return bones.map(bone=>{
      const elements=bone.matrixWorld?.elements;
      if(elements)return elements.join(',');
      const q=bone.quaternion;
      return q?[q.x,q.y,q.z,q.w].join(','):'unknown';
    }).join('|');
  }
  function refresh(mesh) {
    mesh.updateWorldMatrix?.(true,false);
    const geometry=mesh.geometry;
    const pose=poseSignature(mesh);
    const skinIndex=geometry?.getAttribute?.('skinIndex');
    const skinWeight=geometry?.getAttribute?.('skinWeight');
    const state=previous.get(mesh);
    if(!state||state.pose!==pose||state.geometry!==geometry||
      state.skinIndex!==skinIndex||state.skinWeight!==skinWeight||
      state.indexVersion!==skinIndex?.version||state.weightVersion!==skinWeight?.version) {
      mesh.computeBoundingSphere?.();
      previous.set(mesh,{
        pose,geometry,skinIndex,skinWeight,
        indexVersion:skinIndex?.version,weightVersion:skinWeight?.version
      });
    }
  }
  function pick(raycaster,objects) {
    const candidates=objects.filter(mesh=>mesh?.isSkinnedMesh&&mesh.visible);
    if(!candidates.length)return null;
    const changed=[];
    try {
      for(const mesh of candidates){
        refresh(mesh);
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        for(const material of materials){
          if(!material||material.side===doubleSide)continue;
          changed.push([material,material.side]);
          material.side=doubleSide;
        }
      }
      return raycaster.intersectObjects(candidates,false)[0]||null;
    } finally {
      for(const [material,side] of changed)material.side=side;
    }
  }
  return {pick};
}
