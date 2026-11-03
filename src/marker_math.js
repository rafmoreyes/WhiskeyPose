/**
 * WhiskeyPose marker data model. All positions are Three.js WORLD coordinates (Y up).
 * This module deliberately has no DOM/Three.js dependencies, so import/export and
 * symmetry can be validated without running a GPU or Blender.
 */
export const MARKER_DEFS = Object.freeze([
  {key: 'chin', label: 'Chin', hint: 'Under the jaw', side: null},
  {key: 'groin', label: 'Groin', hint: 'Center of the pelvis', side: null},
  {key: 'elbow.L', label: 'Left elbow', hint: 'Elbow joint', side: 'L'},
  {key: 'elbow.R', label: 'Right elbow', hint: 'Elbow joint', side: 'R'},
  {key: 'wrist.L', label: 'Left wrist', hint: 'Hand / forearm junction', side: 'L'},
  {key: 'wrist.R', label: 'Right wrist', hint: 'Hand / forearm junction', side: 'R'},
  {key: 'knee.L', label: 'Left knee', hint: 'Center of kneecap', side: 'L'},
  {key: 'knee.R', label: 'Right knee', hint: 'Center of kneecap', side: 'R'},
]);
export const MARKER_KEYS = Object.freeze(MARKER_DEFS.map((m) => m.key));
export const markerPair = (key) => key.endsWith('.L') ? key.slice(0, -1) + 'R' : key.endsWith('.R') ? key.slice(0, -1) + 'L' : null;
export const reflectX = (position, centerX) => [2 * centerX - position[0], position[1], position[2]];

/** Rough 3D starting positions, not anatomical detection or rigging output. */
export function proposeMarkers(bounds) {
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) throw new Error('Invalid model bounds');
  const [minX,minY,minZ] = bounds.min;
  const [maxX,maxY,maxZ] = bounds.max;
  const [w,h,d] = [maxX-minX, maxY-minY, maxZ-minZ];
  if (![minX,minY,minZ,maxX,maxY,maxZ].every(Number.isFinite) || Math.min(w,h,d) < 0 || h === 0) throw new Error('Invalid model bounds');
  const cx = (minX+maxX)/2, cz = (minZ+maxZ)/2;
  const tPose = w/h > 0.85;
  const point = (x,y) => [cx+x*w, minY+y*h, cz];
  return {
    chin: point(0,0.842), groin: point(0,0.515),
    'elbow.L': point(0.29,tPose?0.773:0.678),
    'elbow.R': point(-0.29,tPose?0.773:0.678),
    'wrist.L': point(0.43,tPose?0.760:0.575),
    'wrist.R': point(-0.43,tPose?0.760:0.575),
    'knee.L': point(0.105,0.288), 'knee.R': point(-0.105,0.288),
  };
}

/** A round-trippable draft for a single imported character. Not a skeleton. */
export function exportMarkerDraft(positions, confirmation, modelName, symmetry) {
  const markers = {};
  for (const key of MARKER_KEYS) {
    const value = positions[key];
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`Marker ${key} is missing`);
    markers[key] = {position: value.map(Number), confirmed: Boolean(confirmation[key])};
  }
  return {format:'whiskeypose-markers', version:1, space:'world-y-up', model: modelName || '', symmetry:Boolean(symmetry), markers};
}
export function parseMarkerDraft(data) {
  if (!data || data.format !== 'whiskeypose-markers' || data.version !== 1 || data.space !== 'world-y-up' || !data.markers) throw new Error('Not a WhiskeyPose marker file (v1)');
  const positions = {}, confirmation = {};
  for (const key of MARKER_KEYS) {
    const row = data.markers[key];
    const p = row?.position;
    if (!Array.isArray(p) || p.length !== 3 || !p.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7)) throw new Error(`Invalid marker: ${key}`);
    positions[key] = [...p];
    confirmation[key] = row.confirmed === true;
  }
  return {positions, confirmation, symmetry:data.symmetry !== false, model:typeof data.model === 'string' ? data.model : ''};
}
