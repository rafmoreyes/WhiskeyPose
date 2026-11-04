import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFORMATION_STAGES,DEFORMATION_SECTIONS,sampleDeformationTrack,locateDeformationStage,createDeformationTest} from '../src/deformation_test.js';

test('all diagnostic tracks use valid joints and safe amplitudes',()=>{
  assert.equal(DEFORMATION_STAGES.length,8);
  for(const stage of DEFORMATION_STAGES){
    assert.ok(stage.seconds>0);
    assert.ok(stage.tracks.length);
    for(const track of stage.tracks){
      assert.ok(['x','y','z'].includes(track.axis));
      assert.ok(Math.abs(track.degrees)<=50);
    }
  }
  assert.ok(DEFORMATION_SECTIONS.some(x=>x.id==='all'));
});
test('all stages begin and end at zero (no snapping)',()=>{
  for(const stage of DEFORMATION_STAGES)for(const track of stage.tracks){
    assert.ok(Math.abs(sampleDeformationTrack(track,0))<1e-9);
    assert.ok(Math.abs(sampleDeformationTrack(track,1))<1e-9);
    assert.ok(Math.abs(sampleDeformationTrack(track,0.5))<=Math.abs(track.degrees));
  }
});
test('stage lookup isolates sections and loops over full scan',()=>{
  const total=DEFORMATION_STAGES.reduce((n,s)=>n+s.seconds,0);
  assert.equal(locateDeformationStage(0).stage.id,'head');
  assert.equal(locateDeformationStage(total+0.3).stage.id,'head');
  assert.equal(locateDeformationStage(0,'knees').stage.id,'knees');
  assert.equal(locateDeformationStage(99,'knees').stage.id,'knees');
  assert.throws(()=>locateDeformationStage(1,'alien'),/Invalid/);
});
class Quat {
  constructor(v=0){this.v=v;}
  clone(){return new Quat(this.v);}
  copy(q){this.v=q.v;return this;}
  invert(){this.v=-this.v;return this;}
  setFromAxisAngle(axis,rad){this.v=rad;return this;}
  premultiply(q){this.v+=q.v;return this;}
}
class Vec {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vec(this.x,this.y,this.z);}
  applyQuaternion(){return this;}
  normalize(){return this;}
}
const THREE={Quaternion:Quat,Vector3:Vec,MathUtils:{degToRad:degree=>degree*Math.PI/180}};
const makeBone=(name,base)=>({name,quaternion:new Quat(base),parent:{getWorldQuaternion(target){target.v=0;return target;}}});
test('play is non-destructive: pause, resume and stop restore custom artist pose',()=>{
  const head=makeBone('head',.45),neck=makeBone('neck',-.13),elbow=makeBone('forearmR',.91);
  const player=createDeformationTest(THREE);
  player.attach([head,neck,elbow]);player.setFocus('head');
  assert.equal(player.play(),true);
  player.tick(.8);
  assert.notEqual(head.quaternion.v,.45);
  assert.equal(neck.quaternion.v,-.13);
  assert.equal(elbow.quaternion.v,.91);
  player.pause();const before=head.quaternion.v;
  player.tick(1);assert.equal(head.quaternion.v,before);
  player.play();player.tick(.1);assert.notEqual(head.quaternion.v,before);
  player.stop();
  assert.equal(head.quaternion.v,.45);
  assert.equal(neck.quaternion.v,-.13);
  assert.equal(elbow.quaternion.v,.91);
});
test('changing section and attaching new skeleton restore old pose',()=>{
  const head=makeBone('head',.25);
  const player=createDeformationTest(THREE);
  player.attach([head]);player.play();player.tick(.7);
  player.setFocus('knees');assert.equal(head.quaternion.v,.25);
  player.attach([]);assert.equal(player.status().playing,false);
  assert.equal(player.play(),false);
});

test('speed slider accepts zero as hold and 5x without resetting artist pose',()=>{
 const head=makeBone('head',.25);
 const player=createDeformationTest(THREE);
 player.attach([head]);player.setFocus('head');player.play();player.tick(.9);
 const seconds=player.status().seconds;
 const pose=head.quaternion.v;
 player.setSpeed(0);
 assert.equal(player.status().speed,0);
 player.tick(1);
 assert.equal(player.status().seconds,seconds);
 assert.equal(head.quaternion.v,pose);
 player.setSpeed(5);
 assert.equal(player.status().speed,5);
 player.tick(.1);
 assert.ok(player.status().seconds>seconds+.49);
 player.setSpeed(8);
 assert.equal(player.status().speed,5);
 player.setSpeed(-1);
 assert.equal(player.status().speed,0);
 player.stop();assert.equal(head.quaternion.v,.25);
});
