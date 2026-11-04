"""SSR regression tests: independent of Blender, verified with the JS solver."""
import json, shutil, subprocess, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from smart_regions import spatial_region_ownership, mesh_region_ownerships
from envelope_skin import envelope_weights

BONES=[
 {'name':'pelvis','head':(0,0,.92),'tail':(0,0,1.04)},
 {'name':'spine','head':(0,0,1.04),'tail':(0,0,1.24)},
 {'name':'chest','head':(0,0,1.24),'tail':(0,0,1.43)},
 {'name':'neck','head':(0,0,1.43),'tail':(0,0,1.65)},
 {'name':'head','head':(0,0,1.65),'tail':(0,0,1.93)}
]
for sign,side in ((1,'L'),(-1,'R')):
 def pt(x,z):return (x*sign,0,z)
 for part,a,b in (
   ('shoulder',pt(0,1.43),pt(.32,1.42)),
   ('upper_arm',pt(.32,1.42),pt(.65,1.23)),
   ('forearm',pt(.65,1.23),pt(.84,1.08)),
   ('hand',pt(.84,1.08),pt(.95,1.05)),
   ('thigh',pt(.17,.91),pt(.19,.55)),
   ('shin',pt(.19,.55),pt(.18,.14)),
   ('foot',pt(.18,.14),pt(.24,.06))):
  BONES.append({'name':part+'.'+side,'head':a,'tail':b})
ENV={b['name']:{'radius':.4,'mode':'smooth','strength':1} for b in BONES}

class SSR(unittest.TestCase):
 def test_region_chains(self):
  for p,expected in (((0,0,1.18),'torso'),((.56,0,1.28),'arm.L'),((-.71,0,1.16),'arm.R'),((.19,0,.5),'leg.L'),((-.2,0,.37),'leg.R')):
   self.assertEqual(spatial_region_ownership(p,BONES,2)['zone'],expected)
 def test_cross_region_blocking_even_with_giant_capsules(self):
  for p,exclude in (((.58,0,1.2),'upper_arm.R'),((-.2,0,.5),'upper_arm.L'),((0,0,1.15),'forearm.L')):
   mask=spatial_region_ownership(p,BONES,2)
   weights,_=envelope_weights(p,BONES,ENV,2,ownership=mask)
   self.assertNotIn(exclude,dict(weights))
   self.assertAlmostEqual(sum(w for _,w in weights),1)
 def test_head_and_neck_preserved(self):
  self.assertEqual(spatial_region_ownership((0,0,1.86),BONES,2)['weights'],[('head',1.)])
  self.assertNotIn('head',spatial_region_ownership((.38,0,1.38),BONES,2)['allowed'])
 def test_rigid_detached_component(self):
  body=[(0,0,1.1),(0,0,1.08),(.02,0,1.1),(0,.03,1.1),(.01,.025,1.08),(.03,0,1.07)]
  accessory=[(.60,-.005,1.24),(.61,.01,1.24),(.60,.005,1.245),(.61,-.008,1.238)]
  result=mesh_region_ownerships(body+accessory,[(0,1,2),(2,3,4),(3,4,5),(6,7,8),(7,8,9)],BONES,2)
  self.assertEqual(result[6]['zone'],'arm.L-rigid')
  self.assertEqual(len(result[6]['weights']),1)
 @unittest.skipUnless(shutil.which('node'),'Node needed for parity')
 def test_javascript_python_parity(self):
  points=[(0,0,1.18),(.56,0,1.28),(-.71,0,1.16),(.19,0,.5),(-.2,0,.37)]
  bones=[{'name':b['name'],'head':[b['head'][0],b['head'][2],-b['head'][1]],'tail':[b['tail'][0],b['tail'][2],-b['tail'][1]]} for b in BONES]
  js="import {spatialRegionOwnership} from './src/smart_regions.js';const d=JSON.parse(process.argv[1]);console.log(JSON.stringify(d.points.map(p=>spatialRegionOwnership(p,d.bones,2))));"
  data={'bones':bones,'points':[[p[0],p[2],-p[1]] for p in points]}
  result=subprocess.run(['node','--input-type=module','-e',js,json.dumps(data)],capture_output=True,text=True,cwd=ROOT,check=True)
  for p,actual in zip(points,json.loads(result.stdout)):
   expect=spatial_region_ownership(p,BONES,2)
   self.assertEqual(actual['zone'],expect['zone'])
   self.assertEqual(actual.get('allowed'),list(expect['allowed']))

if __name__=='__main__':
 unittest.main()
