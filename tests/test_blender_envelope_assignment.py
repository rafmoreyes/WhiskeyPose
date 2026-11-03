"""Mock Blender data interface: verify envelopes become actual vertex-group weights."""
import importlib,os,sys,types,unittest
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))

class VertexGroup:
    def __init__(self,name):self.name=name;self.weights={}
    def add(self,indices,weight,mode):
        assert mode=='REPLACE'
        for idx in indices:self.weights[idx]=weight
class VertexGroups:
    def __init__(self):self.rows={}
    def get(self,name):return self.rows.get(name)
    def new(self,name):
        group=VertexGroup(name);self.rows[name]=group;return group
    def remove(self,item):del self.rows[item.name]
class Matrix:
    def __matmul__(self,co):return tuple(co)
    def copy(self):return self
class Modifiers(list):
    def new(self,name,kind):
        mod=types.SimpleNamespace(type=kind,object=None);self.append(mod);return mod
class Mesh:
    def __init__(self,points):
        self.data=types.SimpleNamespace(vertices=[types.SimpleNamespace(index=i,co=p) for i,p in enumerate(points)])
        self.vertex_groups=VertexGroups();self.matrix_world=Matrix();self.modifiers=Modifiers();self.parent=None
class TestBlenderEnvelopeGroups(unittest.TestCase):
    def test_group_weights_written_and_normalized(self):
        with patch.dict(sys.modules,{'bpy':types.ModuleType('bpy')}):
            import auto_rig
            importlib.reload(auto_rig)
            bones=[{'name':'pelvis','head':(0,0,0),'tail':(0,0,1)},
                   {'name':'spine','head':(1,0,0),'tail':(1,0,1)}]
            config={'pelvis':{'radius':.6,'mode':'smooth'},'spine':{'radius':.6,'mode':'smooth'}}
            # Test the group writer directly; schema validation is tested separately.
            mesh=Mesh([(0,0,.5),(.5,0,.5),(8,0,.5)])
            rig=object()
            missing=auto_rig.assign_envelopes(mesh,rig,bones,1,config)
            self.assertEqual(missing,1)
            self.assertIs(mesh.parent,rig)
            self.assertIs(mesh.modifiers[0].object,rig)
            for vertex in mesh.data.vertices:
                weights=[g.weights.get(vertex.index,0) for g in mesh.vertex_groups.rows.values()]
                self.assertAlmostEqual(sum(weights),1)
            self.assertGreater(mesh.vertex_groups.get('pelvis').weights[1],0)
            self.assertGreater(mesh.vertex_groups.get('spine').weights[1],0)
if __name__=='__main__':unittest.main()
