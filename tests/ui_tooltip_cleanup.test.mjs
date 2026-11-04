import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('no tooltip popups or informational callout cards render in UI',()=>{
  assert.match(js,/function information\(\) \{ return ''; \}/);
  assert.doesNotMatch(js, /<div class="info-card"/);
  assert.doesNotMatch(js, /<div class="side-note"/);
  assert.doesNotMatch(js, /title="/);
  assert.doesNotMatch(js, /<small>\$\{def\.hint\}<\/small>/);
  assert.doesNotMatch(js, /<p class="skin-hint"/);
});
test('retain functional control labels, live diagnostic statuses and errors',()=>{
  for(const id of ['skin-method','envelope-bone','ssr-region-select','ssr-region-add','ssr-region-reduce',
    'sib-enable','sib-strength','sib-radius','sib-undo','sib-reset','deformation-play',
    'ssr-region-feedback','sib-feedback','worker-status','engine-message']){
    assert.ok(js.includes(id),id+' was removed');
  }
  assert.match(js,/role="alert">Live Skin unavailable:/);
  assert.match(js,/Contact Repair applied/);
  assert.match(js,/role="status" aria-live="polite"/);
});
test('preserve keyboard accessibility and inspector scrolling',()=>{
  assert.match(js,/aria-label="Configure External Engines"/);
  assert.match(js,/aria-label="Check Blender worker"/);
  assert.match(js,/class="inspector-content" role="region"/);
  assert.match(css,/grid-template-rows:minmax\(0,1fr\)/);
  assert.match(css,/\.operation-feedback:empty/);
});
