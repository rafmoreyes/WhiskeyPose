"""SSR Automatic Skin: deterministic tests without Blender/GPU."""
import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from automatic_skin import solve_automatic_skin

BONES = [
 {'name':'pelvis','head':(0,0,0),'tail':(0,0,1)},
 {'name':'spine','head':(0,0,1),'tail':(0,0,2)},
 {'name':'head','head':(0,0,2.5),'tail':(0,0,3.2)},
 {'name':'neck','head':(0,0,2.2),'tail':(0,0,2.5)},
 {'name':'chest','head':(0,0,1.8),'tail':(0,0,2.2)},
 {'name':'shoulder.L','head':(0,0,2.2),'tail':(.35,0,2.1)},
 {'name':'shoulder.R','head':(0,0,2.2),'tail':(-.35,0,2.1)},
 {'name':'upper_arm.L','head':(.35,0,2.1),'tail':(.8,0,1.8)},
 {'name':'forearm.L','head':(.8,0,1.8),'tail':(1.2,0,1.5)},
 {'name':'upper_arm.R','head':(-.35,0,2.1),'tail':(-.8,0,1.8)},
 {'name':'forearm.R','head':(-.8,0,1.8),'tail':(-1.2,0,1.5)},
 {'name':'hand.L','head':(1.2,0,1.5),'tail':(1.3,0,1.4)},
 {'name':'hand.R','head':(-1.2,0,1.5),'tail':(-1.3,0,1.4)},
 {'name':'thigh.L','head':(.2,0,1),'tail':(.2,0,.5)},
 {'name':'shin.L','head':(.2,0,.5),'tail':(.2,0,.1)},
 {'name':'foot.L','head':(.2,0,.1),'tail':(.4,-.1,0)},
 {'name':'thigh.R','head':(-.2,0,1),'tail':(-.2,0,.5)},
 {'name':'shin.R','head':(-.2,0,.5),'tail':(-.2,0,.1)},
 {'name':'foot.R','head':(-.2,0,.1),'tail':(-.4,-.1,0)}]

class AutomaticSkin(unittest.TestCase):
 def test_skull_fixed_without_tuning_radius(self):
  out,diag=solve_automatic_skin([(0,0,2.95),(.4,0,2.1)],[],BONES,3.3,
    [{'shoulder.L':1},{'head':1}])
  self.assertEqual(out[0],{'head':1})
  self.assertNotIn('head',out[1])
  self.assertEqual(diag['vertices'],2)
 def test_no_envelopes_required_normalized(self):
  points=[(.3,0,.4),(.2,0,.52),(.1,0,.7),(0,0,1)]
  out,diag=solve_automatic_skin(points,[(0,1,2),(1,2,3)],BONES,3.3)
  self.assertEqual(diag['seedFallbackVertices'],4)
  for row in out:
   self.assertAlmostEqual(sum(row.values()),1.)
   self.assertLessEqual(len(row),4)
 def test_wrong_side_bone_heat_is_excluded(self):
  points=[(.9,0,1.75),(-.9,0,1.75)]
  seed=[{'upper_arm.R':.9,'upper_arm.L':.1},{'upper_arm.L':.9,'upper_arm.R':.1}]
  out,_=solve_automatic_skin(points,[],BONES,3.3,seed)
  self.assertNotIn('upper_arm.R',out[0])
  self.assertNotIn('upper_arm.L',out[1])
 def test_bad_seed_length(self):
  with self.assertRaises(ValueError):
   solve_automatic_skin([(0,0,1)],[],BONES,3.,[])
 def test_topology_smoothes_bone_heat_seed(self):
  points=[(.4,0,1.9),(.5,0,1.85),(.6,0,1.8)]
  seeds=[{'upper_arm.L':1},{'upper_arm.L':1},{'forearm.L':1}]
  raw,_=solve_automatic_skin(points,[(0,1,2)],BONES,3.3,seeds,passes=0)
  smooth,_=solve_automatic_skin(points,[(0,1,2)],BONES,3.3,seeds,passes=4)
  self.assertGreater(smooth[1].get('forearm.L',0),raw[1].get('forearm.L',0))

if __name__=='__main__':unittest.main()
