import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="identity">
        <div class="monogram">W<span>.</span></div>
        <div><div class="brand">WhiskeyPose</div><div class="subbrand">CHARACTER WORKSPACE</div></div>
      </div>
      <div class="version"><span class="live-dot"></span> ALPHA 0.1 <span class="version-note">AUTO-RIG PILOT</span></div>
      <div class="section-eyebrow">WORKFLOW</div>
      <nav id="workflow" class="workflow" aria-label="Workflow">
        <button class="step active" data-tab="import"><span class="step-number">01</span><span><strong>Import</strong><small>Model & diagnostics</small></span><span class="step-arrow">›</span></button>
        <button class="step" data-tab="rig"><span class="step-number">02</span><span><strong>Rig</strong><small>Generate humanoid rig</small></span><span class="step-arrow">›</span></button>
        <button class="step" data-tab="skin"><span class="step-number">03</span><span><strong>Skin</strong><small>Auto weights inspector</small></span><span class="step-arrow">›</span></button>
        <button class="step" data-tab="pose"><span class="step-number">04</span><span><strong>Pose</strong><small>Bone rotations</small></span><span class="step-arrow">›</span></button>
      </nav>
      <div class="sidebar-bottom">
        <div class="side-note"><span class="note-spark">✳</span><div><strong>Built for artists.</strong><p>FBX-first workflow. Experimental T/A-pose rig and skin generation.</p></div></div>
        <a class="repo-link" href="https://github.com/rafmoreyes/WhiskeyPose" target="_blank" rel="noopener noreferrer">↗ &nbsp; Project repository</a>
      </div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div class="file-title"><span class="eyebrow">PROJECT /</span> <strong id="asset-name">Untitled character</strong><span id="file-state" class="status-label">No file</span></div>
        <div class="top-actions"><button id="open-file-top" class="toolbar-button">＋ &nbsp; Import FBX</button><button id="export-fbx-top" class="primary-button" disabled>⇩ &nbsp; Export FBX</button></div>
      </header>
      <div class="viewport-wrap" id="dropzone">
        <div class="viewport" id="viewport"></div>
        <div class="viewport-toolbar"><div class="tool-group"><span class="view-chip">PERSPECTIVE</span><button id="frame-view" title="Frame model (F)">⌗ Frame</button><button id="toggle-grid" class="toggled">▦ Grid</button><button id="toggle-wire">◇ Wire</button><button id="toggle-skeleton">♧ Bones</button></div><div class="tool-group"><span id="camera-info" class="camera-label">Orbit / Pan / Zoom</span></div></div>
        <div class="corner-guide">WHISKEYPOSE <span>·</span> 3D VIEWPORT</div>
        <div id="drop-overlay" class="drop-overlay hidden"><div class="drop-target">Drop FBX to import</div></div>
        <div id="empty-state" class="empty-state">
          <div class="empty-mark">W</div>
          <div class="empty-eyebrow">YOUR CHARACTER STARTS HERE</div>
          <h1>Bring your character<br/><em>to life.</em></h1>
          <p>Drop an FBX to inspect its geometry, skeleton and skin. No file is uploaded to a cloud service.</p>
          <button class="hero-button" id="open-file-hero">＋ &nbsp; Import FBX file</button>
          <div class="empty-footer">FBX • A-POSE • T-POSE</div>
        </div>
        <div class="viewport-foot"><span id="viewport-foot-left">READY TO IMPORT</span><span id="viewport-foot-right">THREE.JS · LOCAL PREVIEW</span></div>
      </div>
      <div id="notification" class="notification" role="status" aria-live="polite"></div>
    </section>
    <aside class="inspector"><div class="inspector-header"><span>INSPECTOR</span><span id="active-mode">IMPORT</span></div><div id="panel" class="inspector-content"></div><div class="inspector-bottom"><div class="worker-row"><span><span id="worker-dot" class="worker-dot"></span> Blender worker</span><button id="retry-worker" title="Check the local export worker">↻</button><strong id="worker-status">Offline</strong></div></div></aside>
  </div>
  <input id="file-input" type="file" accept=".fbx" hidden />
`;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatCount = (n) => new Intl.NumberFormat('en-US').format(n);
const state = { processing: false, riggedFile: null, rigReport: null, sourceFile: null, activeTab: 'import', file: null, model: null, skeletonHelper: null, bones: [], rest: new Map(), selectedBone: null, meshes: [], skinnedMeshes: [], stats: null, workerReady: false, wire: false, gridVisible: true, bonesVisible: false };
let notifyTimer;

function notify(message, type = 'info') {
  const el = $('#notification');
  el.textContent = message; el.className = `notification visible ${type}`;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { el.className = 'notification'; }, 6200);
}

const viewport = $('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
camera.position.set(4, 2.6, 5);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xd9e4f3, 0x554d44, 2.1));
const key = new THREE.DirectionalLight(0xffedd5, 3.1);
key.position.set(5, 10, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12; key.shadow.camera.right = 12;
key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9ab8cf, 1.1);
rim.position.set(-5, 5, -7);
scene.add(rim);
const grid = new THREE.GridHelper(20, 20, 0x55585b, 0x41464a);
grid.material.opacity = 0.38; grid.material.transparent = true;
scene.add(grid);

function resizeViewport() {
  const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
}
new ResizeObserver(resizeViewport).observe(viewport);
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate(); resizeViewport();

function frameModel() {
  if (!state.model) return;
  const bounds = new THREE.Box3().setFromObject(state.model);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.1);
  const distance = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.75;
  const direction = new THREE.Vector3(0.82, 0.42, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.001, distance / 300);
  camera.far = Math.max(100, distance * 150);
  camera.updateProjectionMatrix();
  controls.target.copy(center); controls.minDistance = maxDim * 0.06; controls.maxDistance = maxDim * 80; controls.update();
  const feetY = bounds.min.y;
  grid.position.y = feetY - Math.max(0.002, size.y * 0.003);
  grid.scale.setScalar(Math.max(0.1, maxDim / 4));
  key.position.copy(center).add(new THREE.Vector3(maxDim * 2, maxDim * 3, maxDim * 2));
}

function destroyModel() {
  if (state.skeletonHelper) { scene.remove(state.skeletonHelper); state.skeletonHelper.geometry?.dispose(); state.skeletonHelper = null; }
  if (state.model) {
    scene.remove(state.model);
    state.model.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      for (const mat of Array.isArray(object.material) ? object.material : (object.material ? [object.material] : [])) {
        for (const v of Object.values(mat)) if (v?.isTexture) v.dispose();
        mat.dispose();
      }
    });
  }
  state.model = null; state.stats = null; state.bones = []; state.rest.clear(); state.selectedBone = null; state.meshes = []; state.skinnedMeshes = [];
}

function readStats(root) {
  const meshes = [], skinned = [], bones = new Set(), materialSet = new Set();
  let vertices = 0, triangles = 0;
  root.traverse((obj) => {
    if (obj.isMesh) {
      meshes.push(obj);
      if (obj.isSkinnedMesh) skinned.push(obj);
      if (obj.geometry) {
        const g = obj.geometry;
        vertices += g.getAttribute('position')?.count || 0;
        triangles += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count || 0) / 3;
      }
      for (const m of Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : [])) materialSet.add(m);
    }
    if (obj.isBone) bones.add(obj);
  });
  for (const mesh of skinned) for (const bone of mesh.skeleton?.bones || []) bones.add(bone);
  return {meshes, skinned, bones: [...bones], stats: {meshes: meshes.length, skinned: skinned.length, vertices, triangles: Math.round(triangles), bones: bones.size, materials: materialSet.size, animations: root.animations?.length || 0}};
}

async function importFBX(file, options = {}) {
  if (!file || !file.name.toLowerCase().endsWith('.fbx')) { notify('Please choose an .fbx file.', 'error'); return; }
  if (file.size > 200 * 1024 * 1024) { notify('This prototype accepts FBX files up to 200 MB.', 'error'); return; }
  notify(`Reading ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const fbx = new FBXLoader().parse(buffer, '');
    const {meshes, skinned, bones, stats} = readStats(fbx);
    if (!meshes.length) throw new Error('The FBX does not contain a displayable mesh.');
    destroyModel();
    state.file = file; state.sourceFile = options.generated ? (state.sourceFile || file) : file; state.riggedFile = options.generated ? file : null; state.rigReport = options.report || null; state.model = fbx; state.meshes = meshes; state.skinnedMeshes = skinned; state.bones = bones; state.stats = stats;
    for (const bone of bones) state.rest.set(bone, {quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone()});
    state.skeletonHelper = new THREE.SkeletonHelper(fbx);
    state.skeletonHelper.visible = state.bonesVisible && bones.length > 0;
    scene.add(fbx); scene.add(state.skeletonHelper);
    for (const mesh of meshes) { mesh.castShadow = true; mesh.receiveShadow = true; }
    updateWire(); frameModel();
    $('#empty-state').classList.add('hidden');
    $('#asset-name').textContent = file.name;
    $('#file-state').textContent = 'Loaded'; $('#file-state').classList.add('loaded');
    $('#viewport-foot-left').textContent = `${formatCount(stats.vertices)} VERTICES · ${formatCount(stats.triangles)} TRIS`;
    $('#viewport-foot-right').textContent = stats.bones ? `${stats.bones} BONES DETECTED` : 'UNRIGGED MESH';
    state.selectedBone = bones[0] || null;
    renderPanel(); updateExportUI();
    notify(`Loaded ${file.name}. ${stats.bones ? `${stats.bones} bones detected.` : 'No skeleton detected yet.'}`, 'success');
    return true;
  } catch (error) {
    console.error('FBX import failed:', error);
    notify(`Could not import FBX: ${error.message || 'unknown parser error'}`, 'error');
    return false;
  }
}

function updateWire() {
  for (const mesh of state.meshes) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material || !('wireframe' in material)) continue;
      material.wireframe = state.wire;
      material.needsUpdate = true;
    }
  }
}
function setTab(tab) {
  state.activeTab = tab;
  $('#active-mode').textContent = tab.toUpperCase();
  document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
  renderPanel();
}
function metric(name, value) { return `<div class="metric"><span>${name}</span><strong>${typeof value === "number" ? formatCount(value) : escapeHtml(value)}</strong></div>`; }
function information(text) { return `<div class="info-card"><span class="info-symbol">ⓘ</span><p>${text}</p></div>`; }
function sectionTitle(title, subtitle = '') { return `<div class="panel-section-title"><strong>${title}</strong>${subtitle ? `<span>${subtitle}</span>` : ''}</div>`; }

function renderPanel() {
  const panel = $('#panel');
  const s = state.stats;
  if (state.activeTab === 'import') {
    panel.innerHTML = `
      ${sectionTitle('Source model', 'FBX FORMAT')}
      ${state.file ? `<div class="asset-card"><div class="asset-file-icon">FBX</div><div><strong title="${escapeHtml(state.file.name)}">${escapeHtml(state.file.name)}</strong><small>${(state.file.size / (1024 * 1024)).toFixed(2)} MB · LOCAL FILE</small></div></div>` : `<div class="asset-placeholder">No file imported yet.<br/>Choose a character FBX to start.</div>`}
      ${sectionTitle('Geometry diagnostics')}
      <div class="metrics">${metric('Meshes', s?.meshes ?? '—')}${metric('Vertices', s?.vertices ?? '—')}${metric('Triangles', s?.triangles ?? '—')}${metric('Materials', s?.materials ?? '—')}${metric('Skinned meshes', s?.skinned ?? '—')}${metric('Bones', s?.bones ?? '—')}${metric('Animation clips', s?.animations ?? '—')}</div>
      ${information('Alpha 0.1: experimental procedural Auto-Rig + Auto-Skin for upright humanoids in A/T pose. Requires the Blender worker. This is not AI-based yet.')}
      <button class="full-button gold" id="panel-import">＋ &nbsp; Import FBX</button>
      `;
    $('#panel-import').addEventListener('click', selectFile);
  } else if (state.activeTab === 'rig') {
    const canRig = Boolean(s && !s.bones && state.workerReady && !state.processing);
    panel.innerHTML = `${sectionTitle('Humanoid auto-rig', 'ALPHA 0.1 PILOT')}
      <div class="headline-stat"><strong>${s ? s.bones : '—'}</strong><span>${s?.bones ? 'Detected bones' : 'Skeleton not yet generated'}</span></div>
      ${s && !s.bones ? `<button id="auto-rig" class="full-button gold" ${canRig ? '' : 'disabled'}>${state.processing ? 'Generating rig and weights…' : '✳  Auto-Rig + Auto-Skin'}</button>` : ''}
      ${s && !s.bones && !state.workerReady ? information('Start start-worker.cmd in a second CMD window. Blender must be installed. Then click ↻ next to Blender worker below.') : ''}
      ${s?.bones ? `<div class="bone-scroll">${state.bones.slice(0,120).map((b,i)=>`<button class="bone-item" data-select-bone="${i}">${escapeHtml(b.name || `Bone ${i + 1}`)}</button>`).join('')}</div>` : information(s ? 'Experimental generator: upright, roughly symmetric humanoids in A/T pose. Not intended for creatures, nonstandard limbs or already-rigged FBX.' : 'Import a character FBX to begin.')}
      ${state.riggedFile ? `<button class="full-button gold" id="download-rig">⇩ &nbsp; Download rigged FBX</button>` : ''}
      ${state.rigReport ? information(`Generated ${state.rigReport.bones} bones. Weight methods: ${state.rigReport.weights.map(x => x.weights).join(', ')}. Check all joint deformations before production use.`) : information('This first auto-rig uses a procedural skeleton template plus Blender bone-heat weights (with proximity fallback). AI inference will be evaluated separately.')}`;
    panel.querySelectorAll('[data-select-bone]').forEach((el) => el.addEventListener('click', () => {state.selectedBone = state.bones[Number(el.dataset.selectBone)]; setTab('pose');}));
    $('#auto-rig')?.addEventListener('click', generateRig);
    $('#download-rig')?.addEventListener('click', () => saveBlob(state.riggedFile, state.riggedFile.name));
  } else if (state.activeTab === 'skin') {
    panel.innerHTML = `${sectionTitle('Skinning diagnostics', 'DEFORMATION')}
      <div class="headline-stat"><strong>${s ? s.skinned : '—'}</strong><span>Skinned meshes</span></div>
      ${state.skinnedMeshes.length ? `<div class="mesh-list">${state.skinnedMeshes.map((m) => `<div class="mesh-row"><span class="mesh-dot"></span>${escapeHtml(m.name || 'Unnamed mesh')}<small>${m.skeleton?.bones?.length || 0} bones</small></div>`).join('')}</div>` : information(s ? 'No skinned meshes found. This character requires weight generation before it can deform.' : 'Import an FBX to inspect skin bindings.')}
      <button class="full-button" id="skin-wire">${state.wire ? 'Hide wireframe' : 'Show wireframe'}</button>
      ${information(state.rigReport ? `Auto-Skin generated using ${state.rigReport.weights.map(x => x.weights).join(', ')}. Inspect shoulder, hip, elbow and knee bends. No weight paint editor yet.` : 'Automatic weights can be generated from the Rig tab for unrigged T/A-pose humanoids. Existing FBX skin is inspected without modification.')}`;
    $('#skin-wire').addEventListener('click', () => {state.wire = !state.wire; $('#toggle-wire').classList.toggle('toggled', state.wire); updateWire(); renderPanel();});
  } else {
    const bone = state.selectedBone;
    panel.innerHTML = `${sectionTitle('Interactive pose', 'RIGGED FBX ONLY')}
      ${state.bones.length ? `<label class="field-label" for="bone-select">SELECT BONE</label><select id="bone-select" class="bone-select">${state.bones.map((b,i) => `<option value="${i}" ${bone===b ? 'selected' : ''}>${escapeHtml(b.name || `Bone ${i+1}`)}</option>`).join('')}</select><div id="rotation-controls"></div><div class="panel-row"><button class="half-button" id="reset-bone">Reset bone</button><button class="half-button" id="reset-pose">Reset all</button></div><button class="full-button gold" id="save-pose">⇩ &nbsp; Save pose JSON</button>` : information(state.file ? 'This FBX has no skeleton. You can inspect the model, but posing requires rig generation first.' : 'Import an already-rigged FBX to test simple bone rotations.')}
      ${information('Rotation controls are a diagnostic tool, not a production IK solver. Image-driven posing and IK are scheduled for later Alpha versions.')}`;
    if (state.bones.length) {
      $('#bone-select').addEventListener('change', (event) => {state.selectedBone = state.bones[Number(event.target.value)]; renderRotationControls();});
      $('#reset-bone').addEventListener('click', () => {resetBone(state.selectedBone); renderRotationControls();});
      $('#reset-pose').addEventListener('click', () => {for (const b of state.bones) resetBone(b); renderRotationControls(); notify('Pose restored to the imported state.', 'success');});
      $('#save-pose').addEventListener('click', downloadPose);
      renderRotationControls();
    }
  }
}
function renderRotationControls() {
  const container = $('#rotation-controls');
  const bone = state.selectedBone;
  if (!container || !bone) return;
  const values = ['x','y','z'].map((axis) => Math.round(THREE.MathUtils.radToDeg(bone.rotation[axis])));
  container.innerHTML = `<div class="rotation-title">LOCAL ROTATION <small>DEGREES</small></div>${['x','y','z'].map((axis,i) => `<div class="rotation-row"><label class="axis ${axis}">${axis.toUpperCase()}</label><input data-axis="${axis}" type="range" min="-180" max="180" value="${values[i]}" step="1"/><output id="angle-${axis}">${values[i]}°</output></div>`).join('')}`;
  container.querySelectorAll('[data-axis]').forEach((input) => input.addEventListener('input', () => {const axis = input.dataset.axis; bone.rotation[axis] = THREE.MathUtils.degToRad(Number(input.value)); $(`#angle-${axis}`).textContent = `${input.value}°`; }));
}
function resetBone(bone) {
  if (!bone) return;
  const rest = state.rest.get(bone);
  if (!rest) return;
  bone.quaternion.copy(rest.quaternion); bone.position.copy(rest.position); bone.scale.copy(rest.scale);
}
function posePayload() {
  return {format:'whiskeypose-pose',version:1,source:state.file?.name || '',date:new Date().toISOString(),bones:state.bones.map((bone) => {
    const rest = state.rest.get(bone);
    const delta = bone.quaternion.clone().multiply(rest.quaternion.clone().invert());
    return {name: bone.name, quaternion:bone.quaternion.toArray(),restQuaternion:rest.quaternion.toArray(),deltaQuaternion:delta.toArray()};
  })};
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function downloadPose() {
  if (!state.bones.length) return;
  const filename = (state.file?.name || 'character').replace(/\.fbx$/i, '') + '_pose.json';
  saveBlob(new Blob([JSON.stringify(posePayload(), null, 2)], {type:'application/json'}), filename);
  notify(`Saved ${filename}.`, 'success');
}
async function checkWorker() {
  $('#worker-status').textContent = 'Checking';
  try {
    const response = await fetch('/api/health', {signal:AbortSignal.timeout(2200)});
    if (!response.ok) throw new Error('Offline');
    const status = await response.json();
    state.workerReady = Boolean(status.blenderAvailable);
    $('#worker-status').textContent = state.workerReady ? 'Ready' : 'No Blender';
    $('#worker-dot').classList.toggle('online', state.workerReady);
  } catch {
    state.workerReady = false; $('#worker-status').textContent = 'Offline'; $('#worker-dot').classList.remove('online');
  }
  updateExportUI();
}
function updateExportUI() {
  const button = $('#export-fbx-top');
  button.disabled = !state.file || !state.workerReady;
  button.title = !state.file ? 'Import an FBX first' : !state.workerReady ? 'Start the Blender worker (start-worker.cmd)' : 'Experimental Blender FBX round-trip';
}
async function generateRig() {
  if (!state.file || state.stats?.bones || !state.workerReady || state.processing) return;
  const inputFile = state.file;
  state.processing = true;
  renderPanel();
  notify('Blender is generating an experimental humanoid skeleton and skin weights…');
  try {
    const payload = {name: inputFile.name, fbxBase64: await fileAsBase64(inputFile), method: 'auto'};
    const response = await fetch('/api/auto-rig', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    if (!response.ok) {
      const error = await response.json().catch(() => ({error: response.statusText}));
      throw new Error(error.error || response.statusText);
    }
    const report = JSON.parse(response.headers.get('X-WhiskeyPose-Report') || '{}');
    const blob = await response.blob();
    const rigged = new File([blob], inputFile.name.replace(/\.fbx$/i, '') + '_WhiskeyPose_Rigged.fbx', {type:'application/octet-stream'});
    const loaded = await importFBX(rigged, {generated:true, report});
    if (!loaded) {
      saveBlob(rigged, rigged.name);
      throw new Error('Blender generated an FBX, but the viewport could not parse it. The file was downloaded for inspection.');
    }
    state.bonesVisible = true;
    $('#toggle-skeleton').classList.add('toggled');
    if (state.skeletonHelper) state.skeletonHelper.visible = true;
    setTab('rig');
    notify(`Rig generated: ${state.stats.bones} bones, ${state.stats.skinned} skinned mesh(es). Review joints before using it.`, 'success');
  } catch (error) {
    notify(`Auto-Rig failed: ${error.message}`, 'error');
    console.error('Auto-Rig failed:', error);
  } finally {
    state.processing = false;
    renderPanel();
  }
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}
async function exportFBX() {
  if (!state.file || !state.workerReady) return;
  if (!confirm('Experimental export: Blender will re-import and export the FBX. Pose transfer for existing rigs is approximate and needs manual verification. Continue?')) return;
  const button = $('#export-fbx-top');
  button.disabled = true; button.textContent = 'Exporting…';
  try {
    const data = {name: state.file.name, fbxBase64: await fileAsBase64(state.file), pose: state.bones.length ? posePayload() : null};
    const response = await fetch('/api/export-fbx', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if (!response.ok) {const error=await response.json().catch(()=>({error:response.statusText})); throw new Error(error.error || response.statusText);}
    const output = await response.blob();
    const filename = state.file.name.replace(/\.fbx$/i, '') + '_WhiskeyPose_Experimental.fbx';
    saveBlob(output, filename);
    notify('FBX round-trip complete. Verify bones, scale, and pose in Blender/Unreal.', 'success');
  } catch (error) { notify(`FBX export failed: ${error.message}`, 'error'); }
  finally {button.textContent='⇩   Export FBX'; updateExportUI();}
}
function selectFile() { $('#file-input').click(); }
$('#file-input').addEventListener('change', (event) => {const file = event.target.files?.[0]; if (file) importFBX(file); event.target.value = '';});
$('#open-file-top').addEventListener('click', selectFile);
$('#open-file-hero').addEventListener('click', selectFile);
$('#export-fbx-top').addEventListener('click', exportFBX);
$('#frame-view').addEventListener('click', frameModel);
$('#toggle-grid').addEventListener('click', () => {state.gridVisible = !state.gridVisible; grid.visible = state.gridVisible; $('#toggle-grid').classList.toggle('toggled', state.gridVisible);});
$('#toggle-wire').addEventListener('click', () => {state.wire = !state.wire; updateWire(); $('#toggle-wire').classList.toggle('toggled', state.wire); if(state.activeTab==='skin')renderPanel();});
$('#toggle-skeleton').addEventListener('click', () => {state.bonesVisible = !state.bonesVisible; if (state.skeletonHelper) state.skeletonHelper.visible = state.bonesVisible && !!state.bones.length; $('#toggle-skeleton').classList.toggle('toggled', state.bonesVisible);});
$('#retry-worker').addEventListener('click', checkWorker);
document.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => setTab(el.dataset.tab)));
const dropzone = $('#dropzone');
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); $('#drop-overlay').classList.remove('hidden'); });
dropzone.addEventListener('dragleave', (event) => { if (!dropzone.contains(event.relatedTarget)) $('#drop-overlay').classList.add('hidden'); });
dropzone.addEventListener('drop', (event) => {event.preventDefault(); $('#drop-overlay').classList.add('hidden'); const file=event.dataTransfer?.files?.[0]; if(file)importFBX(file);});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {if (!dropzone.contains(event.target)) event.preventDefault();});
window.addEventListener('keydown', (event) => {if (event.key.toLowerCase()==='f' && !(event.target instanceof HTMLInputElement)) frameModel();});
renderPanel(); checkWorker();
