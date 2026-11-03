import os,sys,unittest
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
from marker_rig import MARKERS, validate_payload, make_marker_template

B=(-1,-.5,0,1,.5,3)
P={
'chin':[.5,.86,.55],'neck':[.5,.80,.55],'chest':[.5,.72,.55],'groin':[.5,.54,.55],
'shoulder.L':[.72,.77,.50],'shoulder.R':[.28,.77,.50],
'elbow.L':[.82,.68,.5],'elbow.R':[.18,.68,.5],
'wrist.L':[.96,.60,.5],'wrist.R':[.04,.60,.5],
'knee.L':[.60,.30,.5],'knee.R':[.40,.30,.5],
'heel.L':[.60,.06,.30],'heel.R':[.40,.06,.30],
'toe.L':[.60,.02,.90],'toe.R':[.40,.02,.90],
}
def payload(points=None):return {'format':'whiskeypose-rig-markers','version':2,'space':'normalized-three-bounds-y-up','markers':points or {k:list(v) for k,v in P.items()}}
class TestMarkerRig(unittest.TestCase):
 def test_all_markers_required(self):
  self.assertEqual(len(MARKERS),16)
  self.assertEqual(len(validate_payload(payload())),16)
  v=payload();del v['markers']['shoulder.L']
  with self.assertRaisesRegex(ValueError,'16'):validate_payload(v)
 def test_world_transform_follows_three_axis_mapping(self):
  b,meta=make_marker_template(B,payload())
  self.assertEqual(len(b),19)
  self.assertEqual(meta['source'],'confirmed-markers')
  chest=next(x for x in b if x['name']=='chest')
  self.assertAlmostEqual(chest['head'][2],.72*3)
  self.assertAlmostEqual(chest['tail'][2],.80*3)
  self.assertAlmostEqual(chest['tail'][1],(.5-.55)*1)
  self.assertEqual(len({x['name'] for x in b}),19)
 def test_shoulder_marker_controls_upper_arm_head(self):
  base,_=make_marker_template(B,payload())
  variant=payload();variant['markers']['shoulder.R']=[.22,.74,.7]
  changed,_=make_marker_template(B,variant)
  before=next(x for x in base if x['name']=='upper_arm.R')['head']
  after=next(x for x in changed if x['name']=='upper_arm.R')['head']
  self.assertNotEqual(before,after)
  self.assertAlmostEqual(after[0],-.56)
  self.assertAlmostEqual(after[1],-.2)
  self.assertAlmostEqual(after[2],2.22)
 def test_neck_marker_controls_spine_and_neck_boundary(self):
  base,_=make_marker_template(B,payload())
  moved=payload();moved['markers']['neck']=[.52,.81,.4]
  changed,_=make_marker_template(B,moved)
  self.assertNotEqual(next(x for x in base if x['name']=='neck')['head'],next(x for x in changed if x['name']=='neck')['head'])
  self.assertEqual(next(x for x in changed if x['name']=='chest')['tail'],next(x for x in changed if x['name']=='neck')['head'])
 def test_heel_and_toe_drive_foot_bone(self):
  base,_=make_marker_template(B,payload())
  foot=next(x for x in base if x['name']=='foot.L')
  v=payload();v['markers']['toe.L']=[.6,.04,.65]
  changed,_=make_marker_template(B,v)
  foot2=next(x for x in changed if x['name']=='foot.L')
  self.assertNotEqual(foot['tail'],foot2['tail'])
 def test_reject_invalid_values_and_height_order(self):
  v=payload();v['markers']['heel.R']=[float('nan'),0,0]
  with self.assertRaisesRegex(ValueError,'heel.R'):validate_payload(v)
  v=payload();v['markers']['neck']=[.5,.40,.5]
  with self.assertRaisesRegex(ValueError,'order'):make_marker_template(B,v)
 def test_reject_old_format(self):
  p=payload();p['version']=1
  with self.assertRaisesRegex(ValueError,'version 2'):validate_payload(p)
if __name__=='__main__':unittest.main()
