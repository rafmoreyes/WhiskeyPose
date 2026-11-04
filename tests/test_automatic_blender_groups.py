"""Check automatic SSR weights become actual Blender-compatible vertex groups."""
import importlib, os, sys, types, unittest
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
from test_blender_envelope_assignment import Mesh
from test_automatic_skin import BONES

class AutomaticGroups(unittest.TestCase):
    def test_automatic_solver_writes_normalized_groups_without_envelopes(self):
        with patch.dict(sys.modules,{'bpy':types.ModuleType('bpy')}):
            import auto_rig
            importlib.reload(auto_rig)
            mesh=Mesh([(0,0,2.95),(.7,0,1.8),(-.7,0,1.8),(.2,0,.3)])
            rig=object()
            with patch.object(auto_rig,'try_bone_heat',return_value=False):
                report=auto_rig.assign_smart_auto(mesh,rig,BONES,3.3)
            self.assertEqual(report['seedMethod'],'anatomical-distance')
            self.assertEqual(report['vertices'],4)
            self.assertIs(mesh.parent,rig)
            self.assertIs(mesh.modifiers[0].object,rig)
            self.assertEqual(mesh.vertex_groups.get('head').weights.get(0),1.0)
            for vert in mesh.data.vertices:
                values=[group.weights.get(vert.index,0) for group in mesh.vertex_groups.rows.values()]
                self.assertAlmostEqual(sum(values),1)
                self.assertLessEqual(sum(value>1e-8 for value in values),4)

if __name__=='__main__':unittest.main()
