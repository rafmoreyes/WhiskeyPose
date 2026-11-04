"""Smart Head/Neck region tests: no Blender install required."""
import json, os, sys, unittest, shutil, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from smart_regions import head_neck_ownership,is_detached_head_piece,head_owned_components
from envelope_skin import envelope_weights
from marker_rig import make_marker_template
from test_marker_rig import P,B
BONES=[
 {'name':'chest','head':(0,0,1.2),'tail':(0,0,1.4)},
 {'name':'neck','head':(0,0,1.4),'tail':(0,0,1.65)},
 {'name':'head','head':(0,0,1.65),'tail':(0,0,2)},
 {'name':'shoulder.L','head':(0,0,1.4),'tail':(.45,0,1.32)},
 {'name':'shoulder.R','head':(0,0,1.4),'tail':(-.45,0,1.32)},
]
ENV={b['name']:{'radius':.4,'mode':'smooth','strength':1} for b in BONES}
class SmartRegions(unittest.TestCase):
 def test_chin_reference_head_pivot(self):
  bones,details=make_marker_template(B,{'format':'whiskeypose-rig-markers','version':2,'space':'normalized-three-bounds-y-up','markers':P})
  by={b['name']:b for b in bones}
  self.assertEqual(by['head']['parent'],'neck')
  self.assertAlmostEqual(by['head']['head'][2],.28*details['markers']['neck'][2]+.72*details['markers']['chin'][2])
  self.assertEqual(by['head']['head'],by['neck']['tail'])
  self.assertNotEqual(by['head']['head'],details['markers']['chin'])
  self.assertEqual(len(bones),19)
 def test_head_is_rigid_with_small_envelope(self):
  env={k:{**v,'radius':.002} for k,v in ENV.items()}
  weights,fallback=envelope_weights((0,0,1.84),BONES,env,2)
  self.assertEqual(weights,[('head',1.)]);self.assertFalse(fallback)
 def test_shoulders_and_pectoral_exclude_head_even_large_radius(self):
  for point in ((.43,0,1.32),(.30,0,1.25),(0,0,1.12),(-.42,0,1.32)):
   ownership=head_neck_ownership(point,BONES,2)
   self.assertEqual(ownership['zone'],'body')
   weights,_=envelope_weights(point,BONES,ENV,2)
   self.assertNotIn('head',dict(weights));self.assertNotIn('neck',dict(weights))
   self.assertAlmostEqual(sum(v for _,v in weights),1.)
 def test_neck_blend(self):
  for point,zone,names in [((0,0,1.645),'head-neck',{'head','neck'}),((0,0,1.45),'neck-chest',{'neck','chest'})]:
   result=head_neck_ownership(point,BONES,2)
   self.assertEqual(result['zone'],zone)
   self.assertEqual({x[0] for x in result['weights']},names)
   self.assertAlmostEqual(sum(x[1] for x in result['weights']),1.)
 def test_head_islands_in_joined_fbx(self):
  hair=[(-.1,0,1.72),(.1,0,1.85),(.02,-.03,1.92),(.05,.02,1.76),(0,0,1.3)]
  shoulder=[(.38,0,1.32),(.45,0,1.31),(.4,0,1.25)]
  mask=head_owned_components(hair+shoulder,[(0,1,2),(0,2,3),(3,4,0),(5,6,7)],BONES,2)
  self.assertEqual(mask,[True]*5+[False]*3)
  self.assertTrue(is_detached_head_piece(hair,BONES,2))
  self.assertFalse(is_detached_head_piece(shoulder,BONES,2))
 def test_blender_vertex_groups_apply_head_ownership(self):
  from unittest.mock import patch
  import types, importlib
  from test_blender_envelope_assignment import Mesh
  with patch.dict(sys.modules, {'bpy':types.ModuleType('bpy')}):
   import auto_rig
   importlib.reload(auto_rig)
   mesh=Mesh([(0,0,1.84),(.43,0,1.32),(0,0,1.45)])
   auto_rig.assign_envelopes(mesh,object(),BONES,2,ENV)
   self.assertEqual(mesh.vertex_groups.get('head').weights.get(0),1.)
   self.assertEqual(mesh.vertex_groups.get('head').weights.get(1,0),0)
   self.assertEqual(mesh.vertex_groups.get('neck').weights.get(1,0),0)
 @unittest.skipUnless(shutil.which('node'),'Node is required for parity')
 def test_javascript_python_parity(self):
  points=[[0,1.84,0],[0,1.645,0],[0,1.45,0],[.43,1.32,0],[-.4,1.26,0]]
  jsbones=[{'name':b['name'],'head':[b['head'][0],b['head'][2],-b['head'][1]],'tail':[b['tail'][0],b['tail'][2],-b['tail'][1]]} for b in BONES]
  js="""import {headNeckOwnership} from './src/smart_regions.js';
  const data=JSON.parse(process.argv[1]);
  console.log(JSON.stringify(data.points.map(p=>headNeckOwnership(p,data.bones,2))));"""
  result=subprocess.run(['node','--input-type=module','-e',js,json.dumps({'bones':jsbones,'points':points})],capture_output=True,text=True,cwd=ROOT,check=True)
  for p,j in zip(points,json.loads(result.stdout)):
   k=head_neck_ownership((p[0],-p[2],p[1]),BONES,2)
   self.assertEqual(k['zone'],j['zone'])
   if 'weights' in k:
    for (_,a),(_,b) in zip(k['weights'],j['weights']):self.assertAlmostEqual(a,b,places=9)
if __name__=='__main__':unittest.main()
