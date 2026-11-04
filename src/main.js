import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { createMarkerTool } from './marker_tool.js';
import { MARKER_DEFS } from './marker_math.js';
import { buildSkeletonTemplate } from './skeleton_solver.js';
import { fitEnvelopes, validateEnvelopeDraft } from './envelope_math.js';
import { createEnvelopeTool } from './envelope_tool.js';
import { createLiveSkin } from './live_skin.js';
import { createDeformationTest, DEFORMATION_SECTIONS } from './deformation_test.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="identity">
        <div class="monogram">W<span>.</span></div>
        <div><div class="brand">WhiskeyPose</div><div class="subbrand">CHARACTER WORKSPACE</div></div>
      </div>
      <div class="version"><span class="live-dot"></span> ALPHA 0.3.4 <span class="version-note">AUTOMATIC SKIN</span></div>
      <div class="section-eyebrow">WORKFLOW</div>
      <nav id="workflow" class="workflow" aria-label="Workflow">
        <button class="step active" data-tab="import"><span class="step-number">01</span><span><strong>Import</strong><small>Model & diagnostics</small></span><span class="step-arrow">›</span></button>
        <button class="step" data-tab="rig"><span class="step-number">02</span><span><strong>Rig</strong><small>Place joint markers</small></span><span class="step-arrow">›</span></button>
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
        <div class="marker-view-tools hidden" id="marker-views"><span>MARKER VIEW</span><button data-marker-view="front">Front</button><button data-marker-view="side">Side</button><button data-marker-view="perspective">3/4</button></div>
        <div class="marker-tip hidden" id="marker-tip">Select a marker, then drag it or click the mesh. Use Side to adjust depth.</div>
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
    <aside class="inspector"><div class="inspector-header"><span>INSPECTOR</span><span id="active-mode">IMPORT</span></div><div id="panel" class="inspector-content" role="region" aria-label="Inspector controls" tabindex="0"></div><div class="inspector-bottom"><div class="worker-row"><span><span id="worker-dot" class="worker-dot"></span> Blender worker</span><button id="engine-settings-open" class="worker-config-button" title="Configure External Engines" aria-label="Configure External Engines">⚙</button><button id="retry-worker" title="Check the local export worker">↻</button><strong id="worker-status">Offline</strong></div></div></aside>
  </div>
  <input id="file-input" type="file" accept=".fbx" hidden />
  <input id="marker-input" type="file" accept=".json,application/json" hidden />
  <div id="engines-overlay" class="engines-overlay hidden">
    <section class="engines-dialog" role="dialog" aria-modal="true" aria-labelledby="engines-title">
      <header class="engines-head"><div><small>LOCAL PROCESSING</small><h2 id="engines-title">External Engines</h2></div><button id="engines-close" aria-label="Close settings">✕</button></header>
      <div class="engines-body">
        <div class="engines-current"><div class="engines-current-icon">B</div><div><strong>Blender Engine</strong><p id="engine-active">Checking installation...</p></div><span id="engine-ready" class="engine-pill">Offline</span></div>
        <p class="engine-help">Blender runs in the background, locally on this computer. Steam and standalone installations are supported. Nothing is installed or downloaded automatically.</p>
        <label class="engine-field-label" for="engine-candidates">Detected installations</label>
        <select id="engine-candidates" class="engine-control"><option value="">Checking...</option></select>
        <label class="engine-field-label" for="engine-manual-path">Blender executable</label>
        <input id="engine-manual-path" class="engine-control" type="text" spellcheck="false" autocomplete="off" placeholder="Select blender.exe or paste its full path" />
        <div class="engine-actions"><button id="engine-scan">↻ Scan</button><button id="engine-browse">Browse...</button><button id="engine-auto">Use Auto</button></div>
        <div class="engine-actions engine-primary-actions"><button id="engine-test">Test Engine</button><button id="engine-use">Use This Blender</button></div>
        <p id="engine-message" class="engine-message" role="status" aria-live="polite">Start start-worker.cmd to enable engine settings.</p>
        <p class="engine-footnote">Your selection is saved locally outside the Git repository. Use Auto to return to automatic detection. Browse opens a native Windows file dialog when supported by Python.</p>
      </div>
    </section>
  </div>
`;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatCount = (n) => new Intl.NumberFormat('en-US').format(n);
const state = { processing: false, riggedFile: null, rigReport: null, autoRiggedFile: null, autoRigReport: null, sourceFile: null, activeTab: 'import', file: null, model: null, skeletonHelper: null, bones: [], rest: new Map(), selectedBone: null, meshes: [], skinnedMeshes: [], stats: null, workerReady: false, skinMethod: 'smart-auto', envelopeOverride: false, envelopeConfig: null, envelopeDefaults: null, envelopeBones: null, envelopeHeight: 0, selectedEnvelope: 'upper_arm.L', showAllEnvelopes: false, showSkinHeatmap: true, showSkinRegions:false, liveSkin: null, liveError: null, envelopeDirty: false, savedRigMarkers: null, wire: false, gridVisible: true, bonesVisible: false };
const deformationTest=createDeformationTest(THREE);
let deformationLastFrame=0;
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

// Alpha 0.2.2 marker positions and reviewed skeleton drive the Blender rigging pipeline.
const envelopeTool = createEnvelopeTool(scene);
const markerTool = createMarkerTool({
  scene, camera, renderer, controls, meshes: () => state.meshes,
  onChange: (phase) => {
    if (!state.stats?.bones && (phase === 'update' || phase === 'reset')) {
      state.envelopeConfig = null;
      state.envelopeDefaults = null;
      state.envelopeBones = null;
      envelopeTool.clear();
    }
    if (phase !== 'drag' && state.activeTab === 'rig') renderPanel();
  },
});

function resizeViewport() {
  const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
}
new ResizeObserver(resizeViewport).observe(viewport);
function animate(now=0) {
  const elapsed=deformationLastFrame?Math.max(0,(now-deformationLastFrame)/1000):0;
  deformationLastFrame=now;
  requestAnimationFrame(animate);controls.update();
  if(deformationTest.status().playing){
    const name=deformationTest.tick(elapsed);
    const label=$('#deformation-current');
    if(label && label.textContent!==name)label.textContent=name;
  }
  if (state.liveSkin && state.model && (state.activeTab === 'skin' || state.activeTab === 'pose')) {
    state.model.updateWorldMatrix(true,true); envelopeTool.tick();
  }
  renderer.render(scene,camera);
}
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
  deformationTest.attach([]);
  state.liveSkin?.dispose();state.liveSkin=null;state.liveError=null;
  markerTool.setModel(null);
  envelopeTool.clear();
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
    if (!options.generated && !options.keepEnvelope) { state.envelopeOverride = false; state.autoRiggedFile=null;state.autoRigReport=null;state.envelopeConfig = null; state.envelopeDefaults = null; state.envelopeBones = null; state.envelopeDirty = false; state.savedRigMarkers = null; }
    state.file = file; state.sourceFile = options.generated ? (state.sourceFile || file) : file; state.riggedFile = options.generated ? file : null; state.rigReport = options.report || null; state.model = fbx; state.meshes = meshes; state.skinnedMeshes = skinned; state.bones = bones; state.stats = stats;
    for (const bone of bones) state.rest.set(bone, {quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone()});
    deformationTest.attach(bones);
    state.skeletonHelper = new THREE.SkeletonHelper(fbx);
    state.skeletonHelper.visible = state.bonesVisible && bones.length > 0;
    scene.add(fbx); scene.add(state.skeletonHelper);
    markerTool.setModel(fbx);
    if (options.markerDraft) markerTool.loadDraft(options.markerDraft);
    markerTool.setActive(state.activeTab === 'rig' && stats.bones === 0);
    for (const mesh of meshes) { mesh.castShadow = true; mesh.receiveShadow = true; }
    updateWire(); frameModel();
    $('#empty-state').classList.add('hidden');
    $('#asset-name').textContent = file.name;
    $('#file-state').textContent = 'Loaded'; $('#file-state').classList.add('loaded');
    $('#viewport-foot-left').textContent = `${formatCount(stats.vertices)} VERTICES · ${formatCount(stats.triangles)} TRIS`;
    $('#viewport-foot-right').textContent = stats.bones ? `${stats.bones} BONES DETECTED` : 'UNRIGGED MESH';
    state.selectedBone = bones[0] || null;
    if (options.generated && state.envelopeConfig && state.envelopeBones && skinned.length && (state.skinMethod === 'envelope' || state.skinMethod === 'smart-auto')) {
      try {
        state.liveSkin=createLiveSkin(skinned,state.envelopeBones,state.envelopeConfig);
        state.envelopeHeight=state.liveSkin.height;
        state.liveSkin.toggleHeatmap(state.showSkinHeatmap && state.activeTab==='skin');
        state.liveSkin.toggleRegions(state.showSkinRegions && state.activeTab==='skin');
        state.liveDiagnostics=state.liveSkin.update(state.envelopeConfig,state.selectedEnvelope,state.skinMethod);
      }catch(error){state.liveError=error.message;console.warn('Live Skin initialization failed:',error);}
    }
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
  const editingMarkers = tab === 'rig' && state.model && state.stats?.bones === 0;
  markerTool.setActive(Boolean(editingMarkers));
  envelopeTool.setActive(tab === 'skin' || (tab === 'pose' && Boolean(state.liveSkin)));
  state.liveSkin?.toggleHeatmap(state.showSkinHeatmap && tab==='skin');
  state.liveSkin?.toggleRegions(state.showSkinRegions && tab==='skin');
  $('#marker-views').classList.toggle('hidden', !editingMarkers);
  $('#marker-tip').classList.toggle('hidden', !editingMarkers);
  $('#active-mode').textContent = tab.toUpperCase();
  document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
  renderPanel();
}
function metric(name, value) { return `<div class="metric"><span>${name}</span><strong>${typeof value === "number" ? formatCount(value) : escapeHtml(value)}</strong></div>`; }
function information(text) { return `<div class="info-card"><span class="info-symbol">ⓘ</span><p>${text}</p></div>`; }
function sectionTitle(title, subtitle = '') { return `<div class="panel-section-title"><strong>${title}</strong>${subtitle ? `<span>${subtitle}</span>` : ''}</div>`; }

function buildEnvelopeDefaults() {
  if (!state.model || state.stats?.bones || !markerTool.getStatus().approved) return false;
  if (state.envelopeConfig) return true;
  const boundsBox = new THREE.Box3().setFromObject(state.model);
  const bounds={min:boundsBox.min.toArray(),max:boundsBox.max.toArray()};
  const bones=buildSkeletonTemplate(bounds, markerTool.asApprovedRigPayload());
  const sample=[];const worldPoint=new THREE.Vector3();
  state.model.updateWorldMatrix(true,true);
  const total=state.meshes.reduce((n,mesh)=>n+(mesh.geometry?.attributes?.position?.count||0),0);
  const skip=Math.max(1,Math.ceil(total/14000));
  for(const mesh of state.meshes){
    const pos=mesh.geometry?.attributes?.position;
    if(!pos)continue;
    for(let i=0;i<pos.count;i+=skip){
      worldPoint.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      sample.push(worldPoint.toArray());
    }
  }
  const config=fitEnvelopes(bones,bounds,sample);
  state.envelopeConfig=config;
  state.envelopeDefaults=JSON.parse(JSON.stringify(config));
  state.envelopeBones=bones;
  state.envelopeHeight=bounds.max[1]-bounds.min[1];
  state.envelopeDirty=false;
  refreshEnvelopePreview();
  return true;
}
function refreshEnvelopePreview() {
  if(state.skinMethod==='smart-auto'&&!state.envelopeOverride){envelopeTool.clear();return;}
  envelopeTool.update({bones:state.liveSkin ? state.liveSkin.poseSegments() : state.envelopeBones,
    getPoseSegments:state.liveSkin?()=>state.liveSkin.poseSegments():null,
    config:state.envelopeConfig,selected:state.selectedEnvelope,
    showAll:state.showAllEnvelopes,height:state.envelopeHeight});
}
let liveUpdatePending=false;
function scheduleLiveSkinUpdate() {
  if(liveUpdatePending || !state.liveSkin) return;
  liveUpdatePending=true;
  requestAnimationFrame(()=>{
    liveUpdatePending=false;
    if(!state.liveSkin||!state.envelopeConfig)return;
    try {
      state.liveDiagnostics=state.liveSkin.update(state.envelopeConfig,state.selectedEnvelope,state.envelopeOverride?'envelope':state.skinMethod);
      state.liveError=null;
      if(state.activeTab==='skin'){
        const label=$('#live-outside-count');
        if(label)label.textContent=`${formatCount(state.liveDiagnostics.outside)} / ${formatCount(state.liveDiagnostics.total)}`;
      }
    }catch(error){state.liveError=error.message;notify(`Live Skin failed: ${error.message}`,'error');}
  });
}
function boneForEnvelope(name) {
  const key=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  return state.bones.find(b=>String(b.name).toLowerCase().replace(/[^a-z0-9]/g,'')===key)||null;
}
function deformationPanel() {
  if(!state.bones.length)return '';
  const d=deformationTest.status();
  const playLabel=d.playing?(d.paused?'▶ Resume':'Ⅱ Pause'):'▶ Play';
  const options=DEFORMATION_SECTIONS.map(section=>`<option value='${section.id}' ${d.focus===section.id?'selected':''}>${escapeHtml(section.label)}</option>`).join('');
  return `<section class='deformation-test'>${sectionTitle('Deformation Test','AUTO DIAGNOSTIC')}
    <p class='skin-hint'>Automatic joint scan. No keyframes, Blender process, or changes to saved skin/pose.</p>
    <label class='field-label' for='deformation-focus'>TEST SECTION</label>
    <select id='deformation-focus' class='bone-select'>${options}</select>
    <div class='deformation-buttons'><button class='full-button gold' id='deformation-play' ${d.supportedCount?'':'disabled'}>${playLabel}</button>
    <button class='full-button' id='deformation-stop' ${d.playing?'':'disabled'}>■ Stop / Restore</button></div>
    <label class='field-label' for='deformation-speed'>SPEED <strong id='deformation-speed-readout'>${d.speed.toFixed(2)}×</strong></label>
    <input class='envelope-slider' id='deformation-speed' type='range' min='0.25' max='2' step='0.25' value='${d.speed}' />
    <label class='field-label' for='deformation-intensity'>AMPLITUDE <strong id='deformation-intensity-readout'>${Math.round(d.intensity*100)}%</strong></label>
    <input class='envelope-slider' id='deformation-intensity' type='range' min='25' max='150' step='5' value='${Math.round(d.intensity*100)}' />
    <div class='deformation-current'>Testing: <strong id='deformation-current'>${escapeHtml(d.stageLabel)}</strong></div>
    <p class='skin-hint'>Stop restores the exact pose you had before Play. Pausing holds the frame. Unrecognized bones are skipped.</p></section>`;
}
function bindDeformationPanel() {
  if(!$('#deformation-play'))return;
  $('#deformation-play').addEventListener('click',()=>{
    const d=deformationTest.status();
    if(!d.playing){if(!deformationTest.play())notify('No supported deform bones found for the diagnostic test.','error');}
    else if(d.paused)deformationTest.play();
    else deformationTest.pause();
    renderPanel();
  });
  $('#deformation-stop').addEventListener('click',()=>{deformationTest.stop();renderPanel();});
  $('#deformation-focus').addEventListener('change',event=>{deformationTest.setFocus(event.target.value);renderPanel();});
  $('#deformation-speed').addEventListener('input',event=>{
    deformationTest.setSpeed(Number(event.target.value));
    $('#deformation-speed-readout').textContent=deformationTest.status().speed.toFixed(2)+'×';
  });
  $('#deformation-intensity').addEventListener('input',event=>{
    deformationTest.setIntensity(Number(event.target.value)/100);
    $('#deformation-intensity-readout').textContent=Math.round(deformationTest.status().intensity*100)+'%';
  });
}
function skinPoseControls() {
  const bone=boneForEnvelope(state.selectedEnvelope);
  if(!bone)return information('No matching pose bone was found for this envelope.');
  state.selectedBone=bone;
  return `<div class="live-pose-section">${sectionTitle('Pose Test', 'LIVE DEFORMATION')}
    <p class="skin-hint">Bend ${escapeHtml(bone.name)} while tuning its envelope. The pose stays in place.</p>
    ${['x','y','z'].map(axis=>`<div class="rotation-row"><label class="axis ${axis}">${axis.toUpperCase()}</label>
      <input data-live-pose-axis="${axis}" type="range" min="-180" max="180" step="1" value="${Math.round(THREE.MathUtils.radToDeg(bone.rotation[axis]))}" ${deformationTest.status().playing?'disabled':''} />
      <output data-live-pose-readout="${axis}">${Math.round(THREE.MathUtils.radToDeg(bone.rotation[axis]))}°</output></div>`).join('')}
    <div class="panel-row"><button class="half-button" id="skin-reset-selected-pose">Reset bone</button><button class="half-button" id="skin-reset-all-pose">Reset pose</button></div>
  </div>`;
}
function bindSkinPoseControls(panel){
  const bone=boneForEnvelope(state.selectedEnvelope);if(!bone)return;
  panel.querySelectorAll('[data-live-pose-axis]').forEach(input=>input.addEventListener('input',()=>{
    bone.rotation[input.dataset.livePoseAxis]=THREE.MathUtils.degToRad(Number(input.value));
    panel.querySelector(`[data-live-pose-readout="${input.dataset.livePoseAxis}"]`).textContent=`${input.value}°`;
  }));
  $('#skin-reset-selected-pose')?.addEventListener('click',()=>{resetBone(bone);renderPanel();});
  $('#skin-reset-all-pose')?.addEventListener('click',()=>{for(const b of state.bones)resetBone(b);renderPanel();});
}
function updateEnvelope(name, change) {
  if (!state.envelopeConfig?.envelopes?.[name]) return;
  Object.assign(state.envelopeConfig.envelopes[name],change);
  state.envelopeDirty=true;
  refreshEnvelopePreview();
  scheduleLiveSkinUpdate();
}
function renderPanel() {
  const panel = $('#panel');
  const s = state.stats;
  if (state.activeTab === 'import') {
    panel.innerHTML = `
      ${sectionTitle('Source model', 'FBX FORMAT')}
      ${state.file ? `<div class="asset-card"><div class="asset-file-icon">FBX</div><div><strong title="${escapeHtml(state.file.name)}">${escapeHtml(state.file.name)}</strong><small>${(state.file.size / (1024 * 1024)).toFixed(2)} MB · LOCAL FILE</small></div></div>` : `<div class="asset-placeholder">No file imported yet.<br/>Choose a character FBX to start.</div>`}
      ${sectionTitle('Geometry diagnostics')}
      <div class="metrics">${metric('Meshes', s?.meshes ?? '—')}${metric('Vertices', s?.vertices ?? '—')}${metric('Triangles', s?.triangles ?? '—')}${metric('Materials', s?.materials ?? '—')}${metric('Skinned meshes', s?.skinned ?? '—')}${metric('Bones', s?.bones ?? '—')}${metric('Animation clips', s?.animations ?? '—')}</div>
      ${information('Automatic SSR skinning is now the default. The Blender worker calculates weights using bone heat, anatomical region limits and mesh connectivity. No envelope adjustment is required.')}
      <button class="full-button gold" id="panel-import">＋ &nbsp; Import FBX</button>
      `;
    $('#panel-import').addEventListener('click', selectFile);
  } else if (state.activeTab === 'rig') {
    const canRig = Boolean(s && !s.bones && state.workerReady && !state.processing);
    const m = markerTool.getStatus();
    const complete = m.count === m.total;
    panel.innerHTML = `${sectionTitle('Joint markers', 'ALPHA 0.3.1')}
      ${s?.bones ? information('The generated FBX is rigged. Inspect bones below, or reopen the original unrigged FBX to refine markers and regenerate.') : !s ? information('Import an FBX character to start placing anatomical markers. No Blender worker is required for this step.') : `
      <div class="marker-summary"><strong>${m.count}<span> / ${m.total}</span></strong><span>${complete ? 'Ready for review' : 'Markers confirmed'}<small>Blue = suggested · Green = confirmed · Gold = selected</small></span></div>
      <div class="marker-list">${MARKER_DEFS.map((def, index) => `<button class="marker-row ${m.selected===def.key?'selected':''}" data-marker="${def.key}"><span class="marker-number">${String(index+1).padStart(2,'0')}</span><span class="marker-description"><strong>${def.label}</strong><small>${def.hint}</small></span><span class="marker-indicator ${m.confirmed[def.key]?'confirmed':'suggested'}"></span></button>`).join('')}</div>
      <div class="marker-toggles"><label><input type="checkbox" id="marker-symmetry" ${m.symmetry ? 'checked':''}/> Mirror L/R</label><label><input type="checkbox" id="marker-preview" ${m.preview ? 'checked':''}/> Skeleton preview</label></div>
      <div class="marker-actions"><button class="half-button" id="marker-suggest">↻ Reset suggestions</button><button class="half-button" id="marker-approve">✓ Confirm all</button></div>
      <div class="marker-actions"><button class="half-button" id="marker-load">↑ Load markers</button><button class="half-button gold-outline" id="marker-save">⇩ Save markers JSON</button></div>
      <div class="skeleton-review ${m.approved ? 'approved' : ''}">
        <strong>Skeleton review · 19 bones</strong>
        <small>${!m.preview ? 'Enable Skeleton preview to inspect the calculated bones.' : m.previewError ? escapeHtml(m.previewError) : m.approved ? '✓ Skeleton approved. Ready for Auto-Skin.' : `${m.previewBones} actual bone segments shown. Inspect Front and Side.`}</small>
        <button id="approve-skeleton" class="full-button ${m.approved ? '' : 'gold'}" ${complete && m.preview && !m.previewError && !m.approved ? '' : 'disabled'}>${m.approved ? '✓ Skeleton approved' : '✓ Approve skeleton'}</button>
      </div>
      ${information('Set all 16 anatomical markers, enable Skeleton preview, inspect the calculated bones in Front and Side, and approve before skinning. Dragging any marker after approval requires a new review.')}
      `}
      <div class="legacy-rig-panel">${sectionTitle('Generate rig from markers', 'ALPHA 0.3.1')}
      ${s && !s.bones ? `<button id="auto-rig" class="full-button gold" ${canRig && complete && m.approved ? '' : 'disabled'}>${state.processing ? 'Generating rig and weights…' : 'Generate Rig + Automatic Skin'}</button>` : ''}
      ${s && !s.bones && !state.workerReady ? information('Start the Blender worker (start-worker.cmd) for rig generation. Marker editing remains local and works without it.') : ''}
      ${s && !s.bones && !complete ? information(`Confirm all ${m.total} markers, then review the skeleton.`) : ''}
      ${s && !s.bones && complete && !m.approved ? information('Preview and approve the 19-bone skeleton before generating skin weights.') : ''}
      ${s?.bones ? `<div class="headline-stat"><strong>${s.bones}</strong><span>Detected bones</span></div><div class="bone-scroll">${state.bones.slice(0,120).map((b,i)=>`<button class="bone-item" data-select-bone="${i}">${escapeHtml(b.name || `Bone ${i + 1}`)}</button>`).join('')}</div>` : ''}
      ${state.riggedFile ? `<button class="full-button gold" id="download-rig">⇩ &nbsp; Download rigged FBX</button><button class="full-button" id="edit-source-markers">↶ &nbsp; Edit source markers</button>` : ''}
      ${information('The generated rig is a 19-bone landmark-driven prototype, not anatomy-aware AI. Validate shoulders, knees, footwear and deformation before production use.')}
      </div>`;
    panel.querySelectorAll('[data-marker]').forEach(el=>el.addEventListener('click',()=>markerTool.choose(el.dataset.marker)));
    $('#marker-symmetry')?.addEventListener('change',event=>markerTool.setSymmetry(event.target.checked));
    $('#marker-preview')?.addEventListener('change',event=>markerTool.setPreview(event.target.checked));
    $('#marker-suggest')?.addEventListener('click',()=>{markerTool.suggest();notify('Suggestions restored; all confirmations cleared.','success');});
    $('#marker-approve')?.addEventListener('click',()=>markerTool.confirmAll());
    $('#approve-skeleton')?.addEventListener('click',()=>{try{markerTool.approveSkeleton();notify('Skeleton approved. Ready to generate skin.','success');}catch(error){notify(error.message,'error');}});
    $('#marker-load')?.addEventListener('click',()=>$('#marker-input').click());
    $('#marker-save')?.addEventListener('click',saveMarkers);
    panel.querySelectorAll('[data-select-bone]').forEach((el) => el.addEventListener('click', () => {state.selectedBone = state.bones[Number(el.dataset.selectBone)]; setTab('pose');}));
    $('#auto-rig')?.addEventListener('click',()=>generateRig());
    $('#download-rig')?.addEventListener('click', () => saveBlob(state.riggedFile, state.riggedFile.name));
    $('#edit-source-markers')?.addEventListener('click', () => { if (state.sourceFile) importFBX(state.sourceFile, {markerDraft:state.savedMarkerDraft}); });
  } else if (state.activeTab === 'skin') {
    if (!state.envelopeConfig && s && !s.bones && markerTool.getStatus().approved) {
      try { buildEnvelopeDefaults(); } catch (error) { notify(`Envelope setup failed: ${error.message}`, 'error'); }
    }
    const active = state.envelopeConfig && state.envelopeBones?.length;
    const names = active ? state.envelopeBones.map(b=>b.name) : [];
    if (active && !names.includes(state.selectedEnvelope)) state.selectedEnvelope=names[0];
    const selected=active ? state.envelopeConfig.envelopes[state.selectedEnvelope] : null;
    const envelopeMode=state.skinMethod==='envelope'||state.envelopeOverride;
    const report=state.rigReport?.weights || [];
    const outside=report.reduce((sum,row)=>sum+(row.fallbackVertices||0),0);
    const total=report.reduce((sum,row)=>sum+(row.totalVertices||0),0);
    panel.innerHTML = `${sectionTitle('Automatic Skin / Smart Regions', 'ALPHA 0.3.4')}
      <div class="headline-stat"><strong>${active ? names.length : (s?.skinned ?? '—')}</strong><span>${active?'Deformation bones':'Skinned meshes'}</span></div>
      ${active ? `
      <label class="field-label" for="skin-method">SKINNING METHOD</label>
      <select id="skin-method" class="bone-select" ${s?.bones ? 'disabled' : ''}><option value="smart-auto" ${state.skinMethod==='smart-auto'?'selected':''}>Automatic Skin — SSR + topology</option><option value="envelope" ${state.skinMethod==='envelope'?'selected':''}>Envelope Skin — advanced</option><option value="auto" ${state.skinMethod==='auto'?'selected':''}>Blender Auto Weights — legacy</option></select>
      <label class="field-label" for="envelope-bone">INSPECT BONE</label>
      <select id="envelope-bone" class="bone-select">${names.map(n=>`<option value="${n}" ${state.selectedEnvelope===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select>
      ${state.skinMethod==='smart-auto'&&s?.bones ? `<label class="envelope-show"><input type="checkbox" id="envelope-override" ${state.envelopeOverride?'checked':''}/> Advanced: use editable envelope override</label>` : ''}
      ${state.skinMethod==='smart-auto'&&!state.envelopeOverride ? information('Automatic weights are already calculated. Use Deformation Test to check the result. Envelope controls are optional.') : ''}
      <div class="advanced-envelope-editor" ${envelopeMode ? '' : 'hidden'}>
      <label class="field-label" for="envelope-radius">CAPSULE RADIUS <strong id="envelope-radius-value">${(selected.radius*100).toFixed(1)}%</strong> OF CHARACTER HEIGHT</label>
      <input id="envelope-radius" class="envelope-slider" type="range" min="0.4" max="35" step="0.2" value="${selected.radius*100}" />
      <label class="field-label" for="envelope-strength">INFLUENCE STRENGTH <strong id="envelope-strength-value">${Math.round((selected.strength??1)*100)}%</strong></label>
      <input id="envelope-strength" class="envelope-slider" type="range" min="0" max="300" step="5" value="${(selected.strength??1)*100}" />
      <div class="skin-hint">Relative influence, normalized with neighboring bones. 0% excludes this volume; 100% is normal.</div>
      <label class="field-label" for="envelope-mode">INFLUENCE BEHAVIOR</label>
      <select id="envelope-mode" class="bone-select"><option value="smooth" ${selected.mode==='smooth'?'selected':''}>Smooth — blend with overlapping bones</option><option value="rigid" ${selected.mode==='rigid'?'selected':''}>Rigid — follow this bone only</option></select>
      <label class="envelope-show"><input type="checkbox" id="envelope-show-all" ${state.showAllEnvelopes?'checked':''}/> Show all envelopes</label>
      <label class="envelope-show"><input type="checkbox" id="ssr-enable" ${state.envelopeConfig.regionMode!=='head-only'?'checked':''}/> <strong>Smart Skin Regions (SSR)</strong></label>
      </div>
      <label class="envelope-show"><input type="checkbox" id="ssr-region-map" ${state.showSkinRegions?'checked':''}/> Show anatomical regions</label>
      <label class="envelope-show"><input type="checkbox" id="envelope-heatmap" ${state.showSkinHeatmap?'checked':''}/> Show influence heatmap</label>
      ${state.liveDiagnostics?.regions ? '<div class="ssr-metrics">'+Object.entries(state.liveDiagnostics.regions).map(([zone,n])=>zone+': '+formatCount(n)).join(' · ')+'</div>' : ''}
      <button class="full-button" id="envelope-reset" ${envelopeMode?'':'hidden'}>↻ Reset selected envelope</button>
      ${information(state.skinMethod==='smart-auto'&&!state.envelopeOverride
       ? 'Automatic mode: Blender bone-heat or anatomical fallback, constrained by SSR and topology smoothing. No envelope sizes required.'
       : state.skinMethod==='envelope'||state.envelopeOverride
       ? 'Advanced envelope mode: sliders replace automatic weights. SSR still limits cross-region influence.'
       : 'Legacy Blender weights, without SSR post-processing.')}
      ${state.liveError ? information('Live skin unavailable: '+escapeHtml(state.liveError)+'. Blender export remains available.') : ''}
      ${!s?.bones ? `<button class="full-button gold" id="envelope-generate" ${state.workerReady && markerTool.getStatus().approved && !state.processing?'':'disabled'}>${state.processing?'Generating…':state.skinMethod==='smart-auto'?'Generate Automatic Rig + Skin':'Generate Rig + Skin'}</button>` : state.riggedFile && state.sourceFile && state.savedRigMarkers ? `<button class="full-button gold" id="envelope-rebuild" ${state.workerReady && !state.processing?'':'disabled'}>${state.processing?'Generating…':envelopeMode?'Save Edited Skin FBX':'Download Automatic Skin FBX'}</button>` : ''}
      ${state.liveSkin ? `<div class="live-status">● ${envelopeMode?'LIVE ENVELOPE OVERRIDE':'AUTOMATIC SSR SKIN'} · No FBX reload</div><div class="live-summary">${envelopeMode?'Outside-envelope vertices':'Fallback vertices'}: <strong id="live-outside-count">${envelopeMode?(state.liveDiagnostics ? `${formatCount(state.liveDiagnostics.outside)} / ${formatCount(state.liveDiagnostics.total)}` : 'computing...'):`${formatCount(report.reduce((sum,r)=>sum+(r.seedFallbackVertices||0),0))} / ${formatCount(report.reduce((sum,r)=>sum+(r.vertices||0),0))}`}</strong></div>${skinPoseControls()}${deformationPanel()}<button id="save-pose-skin" class="full-button">Save current pose JSON</button>` : ''}
      ` : information(s?.bones ? 'This FBX was imported with a rig. Envelope editing currently applies to skeletons built from WhiskeyPose markers.' : 'Go to Rig, confirm the 16 markers and approve the skeleton. Automatic Skin will generate weights without requiring envelope edits.')}
      ${report.length && !state.liveSkin ? `<div class="metrics">${metric('Envelope skin',state.rigReport.skinMode==='envelope'?'Used':'Not used')}${metric('Outside-envelope vertices',total?`${formatCount(outside)} / ${formatCount(total)} (${(outside/total*100).toFixed(1)}%)`:'—')}</div>` : ''}
      ${state.skinnedMeshes.length ? `<div class="mesh-list">${state.skinnedMeshes.map(m=>`<div class="mesh-row"><span class="mesh-dot"></span>${escapeHtml(m.name||'Unnamed mesh')}<small>${m.skeleton?.bones?.length||0} bones</small></div>`).join('')}</div>` : ''}
      <button class="full-button" id="skin-wire">${state.wire ? 'Hide wireframe' : 'Show wireframe'}</button>
      ${state.riggedFile && state.rigReport?.version && ['0.1.1','0.2.1','0.3.0','0.3.1'].includes(state.rigReport.version) ? information('Older rig detected: Smart Head Pivot requires returning to Edit source markers and generating a new rig from the unrigged FBX. Existing generated skeletons are not silently migrated.') : ''}
      ${information('Automatic SSR and topology-aware smoothing are experimental. Test shoulders, knees and clothing with Deformation Test. Skin exports in Rest Pose; save the artistic pose separately.')}`;
    $('#skin-wire').addEventListener('click', () => {state.wire=!state.wire;$('#toggle-wire').classList.toggle('toggled',state.wire);updateWire();renderPanel();});
    if (active) {
      refreshEnvelopePreview();
      $('#skin-method').addEventListener('change',event=>{state.skinMethod=event.target.value;state.envelopeOverride=false;scheduleLiveSkinUpdate();renderPanel();});
      $('#envelope-override')?.addEventListener('change',event=>{state.envelopeOverride=event.target.checked;
        state.envelopeDirty=state.envelopeOverride;
        if(!state.envelopeOverride&&state.autoRiggedFile){
          state.file=state.autoRiggedFile;
          state.riggedFile=state.autoRiggedFile;
          state.rigReport=state.autoRigReport;
        }
        refreshEnvelopePreview();scheduleLiveSkinUpdate();renderPanel();});
      $('#envelope-bone').addEventListener('change',event=>{state.selectedEnvelope=event.target.value;scheduleLiveSkinUpdate();renderPanel();});
      $('#envelope-radius').addEventListener('input',event=>{
        const radius=Number(event.target.value)/100;
        updateEnvelope(state.selectedEnvelope,{radius});
        $('#envelope-radius-value').textContent=`${(radius*100).toFixed(1)}%`;
      });
      $('#envelope-strength').addEventListener('input',event=>{
        const strength=Number(event.target.value)/100;
        updateEnvelope(state.selectedEnvelope,{strength});
        $('#envelope-strength-value').textContent=`${Math.round(strength*100)}%`;
      });
      $('#envelope-mode').addEventListener('change',event=>updateEnvelope(state.selectedEnvelope,{mode:event.target.value}));
      $('#ssr-enable').addEventListener('change',event=>{
        state.envelopeConfig.regionMode=event.target.checked?'smart':'head-only';
        state.envelopeDirty=true;scheduleLiveSkinUpdate();renderPanel();
      });
      $('#ssr-region-map').addEventListener('change',event=>{
        state.showSkinRegions=event.target.checked;
        if(state.showSkinRegions)state.showSkinHeatmap=false;
        state.liveSkin?.toggleRegions(state.showSkinRegions);
        const heatmap=$('#envelope-heatmap');if(heatmap)heatmap.checked=state.showSkinHeatmap;
      });
      $('#envelope-heatmap').addEventListener('change',event=>{
        state.showSkinHeatmap=event.target.checked;
        if(state.showSkinHeatmap)state.showSkinRegions=false;
        state.liveSkin?.toggleHeatmap(state.showSkinHeatmap);
        const map=$('#ssr-region-map');if(map)map.checked=state.showSkinRegions;
      });
      $('#envelope-show-all').addEventListener('change',event=>{state.showAllEnvelopes=event.target.checked;refreshEnvelopePreview();});
      $('#envelope-reset').addEventListener('click',()=>{
        if (state.envelopeDefaults?.envelopes?.[state.selectedEnvelope]) updateEnvelope(state.selectedEnvelope,{...state.envelopeDefaults.envelopes[state.selectedEnvelope]});
        renderPanel();
      });
      $('#envelope-generate')?.addEventListener('click',()=>generateRig());
      $('#envelope-rebuild')?.addEventListener('click',()=>generateRig({rebuild:true}));
      if(state.liveSkin){bindSkinPoseControls(panel);bindDeformationPanel();$('#save-pose-skin')?.addEventListener('click',downloadPose);}
    } else envelopeTool.clear();
  } else {
    const bone = state.selectedBone;
    panel.innerHTML = `${sectionTitle('Interactive pose', 'RIGGED FBX ONLY')}
      ${state.bones.length ? `<label class="field-label" for="bone-select">SELECT BONE</label><select id="bone-select" class="bone-select">${state.bones.map((b,i) => `<option value="${i}" ${bone===b ? 'selected' : ''}>${escapeHtml(b.name || `Bone ${i+1}`)}</option>`).join('')}</select><div id="rotation-controls"></div><div class="panel-row"><button class="half-button" id="reset-bone">Reset bone</button><button class="half-button" id="reset-pose">Reset all</button></div><button class="full-button gold" id="save-pose">⇩ &nbsp; Save pose JSON</button>${deformationPanel()}` : information(state.file ? 'This FBX has no skeleton. You can inspect the model, but posing requires rig generation first.' : 'Import an already-rigged FBX to test simple bone rotations.')}
      ${information('Rotation controls are a diagnostic tool, not a production IK solver. Image-driven posing and IK are scheduled for later Alpha versions.')}`;
    if (state.bones.length) {
      $('#bone-select').addEventListener('change', (event) => {state.selectedBone = state.bones[Number(event.target.value)]; renderRotationControls();});
      $('#reset-bone').addEventListener('click', () => {resetBone(state.selectedBone); renderRotationControls();});
      $('#reset-pose').addEventListener('click', () => {for (const b of state.bones) resetBone(b); renderRotationControls(); notify('Pose restored to the imported state.', 'success');});
      $('#save-pose').addEventListener('click', downloadPose);
      renderRotationControls();
      bindDeformationPanel();
    }
  }
}
function renderRotationControls() {
  const container = $('#rotation-controls');
  const bone = state.selectedBone;
  if (!container || !bone) return;
  const values = ['x','y','z'].map((axis) => Math.round(THREE.MathUtils.radToDeg(bone.rotation[axis])));
  container.innerHTML = `<div class="rotation-title">LOCAL ROTATION <small>DEGREES</small></div>${['x','y','z'].map((axis,i) => `<div class="rotation-row"><label class="axis ${axis}">${axis.toUpperCase()}</label><input data-axis="${axis}" type="range" min="-180" max="180" value="${values[i]}" step="1" ${deformationTest.status().playing?'disabled':''}/><output id="angle-${axis}">${values[i]}°</output></div>`).join('')}`;
  container.querySelectorAll('[data-axis]').forEach((input) => input.addEventListener('input', () => {const axis = input.dataset.axis; bone.rotation[axis] = THREE.MathUtils.degToRad(Number(input.value)); $(`#angle-${axis}`).textContent = `${input.value}°`; }));
}
function resetBone(bone) {
  if (!bone) return;
  if(deformationTest.status().playing)deformationTest.stop();
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
function saveMarkers() {
  if (!state.file || !state.model) return;
  try {
    const draft=markerTool.asDraft(state.file.name);
    const filename=state.file.name.replace(/\.fbx$/i,'')+'_WhiskeyPose_Markers.json';
    saveBlob(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),filename);
    notify(`Saved ${filename}. This is a marker draft, not a rig.`, 'success');
  } catch(error) {notify(`Could not save markers: ${error.message}`,'error');}
}
async function loadMarkers(file) {
  if(!state.model) {notify('Import an FBX before loading markers.','error');return;}
  try {
    if(file.size > 1024*1024) throw new Error('Marker JSON is too large');
    const parsed=JSON.parse(await file.text());
    const modelName=markerTool.loadDraft(parsed);
    notify(modelName && modelName!==state.file.name ? `Markers loaded. Warning: file was created for ${modelName}. Check alignment.` : 'Markers loaded. Verify them on your model.', 'success');
  } catch(error) {notify(`Could not read markers: ${error.message}`,'error');}
}
function downloadPose() {
  if (!state.bones.length) return;
  if(deformationTest.status().playing)deformationTest.stop();
  const filename = (state.file?.name || 'character').replace(/\.fbx$/i, '') + '_pose.json';
  saveBlob(new Blob([JSON.stringify(posePayload(), null, 2)], {type:'application/json'}), filename);
  notify(`Saved ${filename}.`, 'success');
}
async function engineRequest(url, data) {
  const response = await fetch(url, data === undefined ? {signal:AbortSignal.timeout(4000)} : {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Engine service error (${response.status})`);
  return payload;
}
function engineMessage(message, kind = '') {
  const field = $('#engine-message');
  field.textContent = message;
  field.dataset.kind = kind;
}
async function refreshEngines(prefill = false) {
  const info = await engineRequest('/api/engines');
  const list = $('#engine-candidates');
  list.replaceChildren();
  if (!info.candidates.length) list.add(new Option('No Blender installations found', ''));
  for (const item of info.candidates) {
    list.add(new Option(`${item.source} · ${item.path}`, item.path));
  }
  $('#engine-active').textContent = info.active ? `${info.active.source} · ${info.active.path}` : 'No installation found';
  $('#engine-ready').textContent = info.active ? 'Detected' : 'Not found';
  $('#engine-ready').classList.toggle('ready', Boolean(info.active));
  if (info.active) list.value = info.active.path;
  if (prefill || !$('#engine-manual-path').value.trim()) {
    $('#engine-manual-path').value = info.active?.path || info.savedPath || '';
  }
  engineMessage(info.active ? 'Blender detected. Use Test Engine to verify its version.' : 'No Blender found. Browse or paste the path to blender.exe.');
}
async function openEngineSettings() {
  $('#engines-overlay').classList.remove('hidden');
  $('#engine-manual-path').focus();
  engineMessage('Scanning local Blender installations...');
  try { await refreshEngines(true); }
  catch (error) { engineMessage(`Worker unavailable. Run start-worker.cmd. ${error.message}`, 'error'); }
}
function closeEngineSettings() { $('#engines-overlay').classList.add('hidden'); }
async function engineAction(label, fn) {
  engineMessage(label);
  try { await fn(); }
  catch (error) { engineMessage(error.message, 'error'); }
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
async function generateRig({rebuild=false}={}) {
  // The originally generated automatic FBX is already available. Avoid a
  // redundant Blender job when no advanced envelope correction was made.
  if(rebuild && state.skinMethod==='smart-auto' && !state.envelopeOverride && state.riggedFile){
    saveBlob(state.autoRiggedFile||state.riggedFile,(state.autoRiggedFile||state.riggedFile).name);
    notify('Automatic Skin FBX downloaded. Current pose preserved.','success');
    return;
  }
  if (!state.workerReady || state.processing) return;
  if (!rebuild && (!state.file || state.stats?.bones || !markerTool.getStatus().approved)) return;
  if (!rebuild && !state.envelopeConfig) {
    try { buildEnvelopeDefaults(); } catch (error) { notify(error.message,'error'); return; }
  }
  const inputFile = rebuild ? state.sourceFile : state.file;
  const markers = rebuild ? state.savedRigMarkers : markerTool.asApprovedRigPayload();
  if (!inputFile || !markers || !state.envelopeConfig) return;
  const effectiveMethod=state.envelopeOverride&&state.skinMethod==='smart-auto'?'envelope':state.skinMethod;
  state.processing = true;
  renderPanel();
  notify(effectiveMethod==='smart-auto'?'Blender is generating automatic SSR skin weights…':'Blender is calculating rig and skin…');
  try {
    const markerDraft = rebuild ? state.savedMarkerDraft : markerTool.asDraft(inputFile.name);
    const payload = {
      name:inputFile.name, fbxBase64:await fileAsBase64(inputFile),
      method:effectiveMethod, skeletonApproved:true, markers,
      envelopes:validateEnvelopeDraft(state.envelopeConfig,state.envelopeBones),
    };
    const response = await fetch('/api/auto-rig', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!response.ok) {
      const error=await response.json().catch(()=>({error:response.statusText}));
      throw Error(error.error||response.statusText);
    }
    const report=JSON.parse(response.headers.get('X-WhiskeyPose-Report')||'{}');
    if (report.template!=='confirmed-markers'||report.landmarkCount!==16||report.skinMode!==effectiveMethod||report.envelopeCount!==(effectiveMethod==='envelope'?19:0)) {
      throw Error('Worker did not confirm automatic/advanced skin. Restart the Worker after git pull.');
    }
    const blob=await response.blob();
    const rigged=new File([blob],inputFile.name.replace(/\.fbx$/i,'')+'_WhiskeyPose_Rig.fbx',{type:'application/octet-stream'});
    state.savedRigMarkers=markers;
    state.savedMarkerDraft=markerDraft;
    if(rebuild){
      // Do not replace the SkinnedMesh: a reload would reset all pose transforms.
      state.file=rigged;state.riggedFile=rigged;state.rigReport=report;
      state.envelopeDirty=false;
      saveBlob(rigged,rigged.name.replace(/\.fbx$/i,'')+'_EditedSkin.fbx');
      notify('Skin FBX saved. The current viewport pose is unchanged; the file contains Rest Pose skin. Save the pose separately.','success');
      return;
    }
    const loaded=await importFBX(rigged,{generated:true,report,markerDraft});
    if(!loaded){saveBlob(rigged,rigged.name);throw Error('FBX was generated but the viewport could not load it; file downloaded for review.');}
    if(effectiveMethod==='smart-auto'){state.autoRiggedFile=rigged;state.autoRigReport=report;}
    state.envelopeDirty=false;
    state.bonesVisible=true;
    $('#toggle-skeleton').classList.add('toggled');
    if(state.skeletonHelper)state.skeletonHelper.visible=true;
    setTab('skin');
    notify(`Rig generated (${report.skinMode}): ${state.stats.bones} bones. Run Deformation Test to inspect the result.`, 'success');
  } catch(error){
    notify(`Skin generation failed: ${error.message}`,'error');
    console.error('Skin generation failed:',error);
  } finally {
    state.processing=false;
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
  if(state.liveSkin && state.envelopeDirty && (state.skinMethod==='envelope'||state.envelopeOverride)){setTab('skin');notify('Save Edited Skin FBX first. The current FBX does not contain your latest live envelope changes.','error');return;}
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
$('#marker-input').addEventListener('change', (event) => {const file=event.target.files?.[0];if(file)loadMarkers(file);event.target.value='';});
document.querySelectorAll('[data-marker-view]').forEach(el=>el.addEventListener('click',()=>{markerTool.frameView(el.dataset.markerView);document.querySelectorAll('[data-marker-view]').forEach(button=>button.classList.toggle('selected',button===el));}));
$('#file-input').addEventListener('change', (event) => {const file = event.target.files?.[0]; if (file) importFBX(file); event.target.value = '';});
$('#open-file-top').addEventListener('click', selectFile);
$('#open-file-hero').addEventListener('click', selectFile);
$('#export-fbx-top').addEventListener('click', exportFBX);
$('#frame-view').addEventListener('click', frameModel);
$('#toggle-grid').addEventListener('click', () => {state.gridVisible = !state.gridVisible; grid.visible = state.gridVisible; $('#toggle-grid').classList.toggle('toggled', state.gridVisible);});
$('#toggle-wire').addEventListener('click', () => {state.wire = !state.wire; updateWire(); $('#toggle-wire').classList.toggle('toggled', state.wire); if(state.activeTab==='skin')renderPanel();});
$('#toggle-skeleton').addEventListener('click', () => {state.bonesVisible = !state.bonesVisible; if (state.skeletonHelper) state.skeletonHelper.visible = state.bonesVisible && !!state.bones.length; $('#toggle-skeleton').classList.toggle('toggled', state.bonesVisible);});
$('#retry-worker').addEventListener('click', checkWorker);
$('#engine-settings-open').addEventListener('click', openEngineSettings);
$('#engines-close').addEventListener('click', closeEngineSettings);
$('#engines-overlay').addEventListener('click', (event) => { if (event.target === $('#engines-overlay')) closeEngineSettings(); });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#engines-overlay').classList.contains('hidden')) closeEngineSettings(); });
$('#engine-candidates').addEventListener('change', (event) => { if (event.target.value) $('#engine-manual-path').value = event.target.value; });
$('#engine-scan').addEventListener('click', () => engineAction('Scanning...', () => refreshEngines(true)));
$('#engine-browse').addEventListener('click', () => engineAction('Opening the native file chooser...', async () => {
  const result = await engineRequest('/api/engines/browse', {});
  if (result.path) { $('#engine-manual-path').value = result.path; engineMessage('Executable selected. Click Test Engine or Use This Blender.', 'success'); }
  else engineMessage('Selection cancelled. You can paste an executable path instead.');
}));
$('#engine-test').addEventListener('click', () => engineAction('Testing Blender executable...', async () => {
  const result = await engineRequest('/api/engines/test', {path: $('#engine-manual-path').value.trim() || null});
  engineMessage(`Blender ${result.version} confirmed. Click Use This Blender to save it.`, 'success');
}));
$('#engine-use').addEventListener('click', () => engineAction('Validating and saving...', async () => {
  const path = $('#engine-manual-path').value.trim();
  if (!path) throw new Error('Choose a Blender executable first, or click Use Auto.');
  const result = await engineRequest('/api/engines/select', {path});
  await refreshEngines(true);
  await checkWorker();
  engineMessage(`Blender ${result.version} saved as the preferred engine.`, 'success');
}));
$('#engine-auto').addEventListener('click', () => engineAction('Restoring automatic detection...', async () => {
  await engineRequest('/api/engines/select', {path:null});
  await refreshEngines(true);
  await checkWorker();
  engineMessage('Automatic Blender selection enabled.', 'success');
}));
document.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => setTab(el.dataset.tab)));
const dropzone = $('#dropzone');
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); $('#drop-overlay').classList.remove('hidden'); });
dropzone.addEventListener('dragleave', (event) => { if (!dropzone.contains(event.relatedTarget)) $('#drop-overlay').classList.add('hidden'); });
dropzone.addEventListener('drop', (event) => {event.preventDefault(); $('#drop-overlay').classList.add('hidden'); const file=event.dataTransfer?.files?.[0]; if(file)importFBX(file);});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {if (!dropzone.contains(event.target)) event.preventDefault();});
window.addEventListener('keydown', (event) => {if (event.key.toLowerCase()==='f' && !(event.target instanceof HTMLInputElement)) frameModel();});
markerTool.setActive(false);
renderPanel(); checkWorker();
