import os,sys,unittest
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
from marker_rig import MARKERS, validate_payload, make_marker_template

B=(-1,-.5,0,1,.5,3)
P={
'chin':[.5,.86,.55],'chest':[.5,.72,.55],'groin':[.5,.54,.55],
'elbow.L':[.82,.68,.5],'elbow.R':[.18,.68,.5],
'wrist.L':[.96,.60,.5],'wrist.R':[.04,.60,.5],
'knee.L':[.60,.30,.5],'knee.R':[.40,.30,.5],
'heel.L':[.60,.06,.30],'heel.R':[.40,.06,.30],
'toe.L':[.60,.02,.90],'toe.R':[.40,.02,.90],
}
def payload(points=None):return {'format':'whiskeypose-rig-markers','version':1,'space':'normalized-three-bounds-y-up','markers':points or {k:list(v) for k,v in P.items()}}
class TestMarkerRig(unittest.TestCase):
 def test_all_marker_points_required(self):
  self.assertEqual(len(MARKERS),13)
  self.assertEqual(len(validate_payload(payload())),13)
  v=payload();del v['markers']['toe.L']
  with self.assertRaisesRegex(ValueError,'13'):validate_payload(v)
 def test_world_transform_follows_three_axis_mapping(self):
  b,meta=make_marker_template(B,payload())
  self.assertEqual(len(b),19)
  self.assertEqual(meta['source'],'confirmed-markers')
  chest=next(x for x in b if x['name']=='chest')
  self.assertAlmostEqual(chest['tail'][2],.72*3)
  self.assertAlmostEqual(chest['tail'][1],(.5-.55)*1)
  self.assertEqual(len({x['name'] for x in b}),19)
 def test_moving_marker_changes_corresponding_bone_not_only_preview(self):
  base,_=make_marker_template(B,payload())
  variant=payload(); variant['markers']['elbow.R']=[.14,.62,.7]
  changed,_=make_marker_template(B,variant)
  before=next(x for x in base if x['name']=='upper_arm.R')['tail']
  after=next(x for x in changed if x['name']=='upper_arm.R')['tail']
  self.assertNotEqual(before,after)
  self.assertAlmostEqual(after[0],-.72)
  self.assertAlmostEqual(after[1],-.2)
  self.assertAlmostEqual(after[2],1.86)
 def test_heel_and_toe_drive_foot_bone(self):
  base,_=make_marker_template(B,payload())
  foot=next(x for x in base if x['name']=='foot.L')
  self.assertAlmostEqual(foot['tail'][1],-.4)
  v=payload();v['markers']['toe.L']=[.6,.04,.65]
  changed,_=make_marker_template(B,v)
  foot2=next(x for x in changed if x['name']=='foot.L')
  self.assertNotEqual(foot['tail'],foot2['tail'])
 def test_reject_invalid_values_and_height_order(self):
  v=payload();v['markers']['heel.R']=[float('nan'),0,0]
  with self.assertRaisesRegex(ValueError,'heel.R'):validate_payload(v)
  v=payload();v['markers']['chest']=[.5,.40,.5]
  with self.assertRaisesRegex(ValueError,'order'):make_marker_template(B,v)
if __name__=='__main__':unittest.main()
