import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from skin_paint import validate_paint_edits,normalized_blender_point,match_mesh

class SoftInfluencePayload(unittest.TestCase):
 def payload(self):
  return {'format':'whiskeypose-sib-v1','version':1,'meshes':[{
   'name':'Body','samples':[{'p':[.2,.6,.4],'w':[['upper_arm.L',.8],['forearm.L',.2]]}]}]}
 def test_accept_valid_weights(self):
  sections,count=validate_paint_edits(self.payload())
  self.assertEqual(count,1)
  self.assertEqual(len(sections[0]['samples'][0]['w']),2)
 def test_reject_partial_weight_sum(self):
  p=self.payload();p['meshes'][0]['samples'][0]['w'][0][1]=.4
  with self.assertRaises(ValueError):validate_paint_edits(p)
 def test_reject_invalid_float(self):
  p=self.payload();p['meshes'][0]['samples'][0]['p'][0]=float('nan')
  with self.assertRaises(ValueError):validate_paint_edits(p)
 def test_coordinate_axis_conversion(self):
  bounds=(0,-10,3,2,6,7)
  self.assertEqual(normalized_blender_point((1,-2,5),bounds),(.5,.5,.5))
 def test_fail_on_ambiguous_mesh(self):
  class Mesh:
   def __init__(self,name):self.name=name
  self.assertEqual(match_mesh('Body',[Mesh('Body')]).name,'Body')
  with self.assertRaises(ValueError):match_mesh('NotFound',[Mesh('Body'),Mesh('Coat')])
if __name__=='__main__':unittest.main()
