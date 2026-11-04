"""Contact Repair pilot: fail closed on unknown topology; corrected SSR ownership."""
import sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from contact_repair import plan_contact_repair,_arcs,_verify_closed,CONTACTS,WITNESSES
from automatic_skin import solve_automatic_skin
from test_automatic_skin import BONES

class GuardedContactRepair(unittest.TestCase):
 def test_unknown_mesh_does_not_get_modified(self):
  points=[(0.,0.,0.),(1.,0.,0.),(0.,1.,0.)]
  faces=[(0,1,2)]
  old_points=list(points);old_faces=list(faces)
  with self.assertRaisesRegex(ValueError,'only the audited'):
   plan_contact_repair(points,faces)
  self.assertEqual(points,old_points)
  self.assertEqual(faces,old_faces)
 def test_matching_dimensions_alone_not_sufficient_to_cut(self):
  with self.assertRaisesRegex(ValueError,'face topology'):
   plan_contact_repair([(0.,0.,0.)]*5376,[(0,1,2)]*5910)
 def test_contact_profile_requires_two_known_bridges_per_side(self):
  self.assertEqual(len(CONTACTS['L']['faces']),21)
  self.assertEqual(len(CONTACTS['R']['faces']),21)
  self.assertEqual(len(WITNESSES),8)
  self.assertEqual(len(CONTACTS['L']['connector_edges']),2)
 def test_boundary_winding_rejects_open_and_duplicate_faces(self):
  with self.assertRaisesRegex(ValueError,'open or nonmanifold'):
   _verify_closed([(0,1,2)])
  with self.assertRaisesRegex(ValueError,'reverse surface winding'):
   _verify_closed([(0,1,2),(0,1,2)])
 def test_ownership_override_preserves_arm_leg_separation(self):
  # Same 2 vertices at an arm/thigh contact but with hostile bone-heat seeds.
  points=[(.3,0.,1.05),(.4,0.,1.05)]
  overrides={
   0:{'zone':'contact-arm.L','allowed':('upper_arm.L','forearm.L')},
   1:{'zone':'contact-leg.L','weights':[('thigh.L',1.)]}
  }
  seed=[{'thigh.L':1.},{'forearm.L':1.}]
  out,diagnostics=solve_automatic_skin(points,[],BONES,3.3,seed,
    ownership_override=overrides,passes=4)
  self.assertNotIn('thigh.L',out[0])
  self.assertEqual(out[1],{'thigh.L':1.})
  self.assertAlmostEqual(sum(out[0].values()),1.)
  self.assertLessEqual(len(out[0]),4)

if __name__=='__main__':unittest.main()
