"""Cross-runtime parity: browser skeleton preview coordinates vs Blender worker solver.

Does not require Three.js, Blender, GPU or any installed npm packages.
Node 20+ is needed because it executes our dependency-free JS solver.
"""
import json, os, shutil, subprocess, sys, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from marker_rig import make_marker_template
from test_marker_rig import P, B

JS="""
import {buildSkeletonTemplate} from './src/skeleton_solver.js';
const chunks=[];
for await (const chunk of process.stdin) chunks.push(chunk);
const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
process.stdout.write(JSON.stringify(buildSkeletonTemplate(data.bounds,data.payload)));
"""

@unittest.skipUnless(shutil.which('node'), 'Node unavailable for cross-runtime parity check')
class SkeletonParity(unittest.TestCase):
    def preview(self, points):
        packet={'format':'whiskeypose-rig-markers','version':2,'space':'normalized-three-bounds-y-up','markers':points}
        stdin=json.dumps({'bounds':{'min':[-1,0,-.5],'max':[1,3,.5]},'payload':packet})
        proc=subprocess.run(['node','--input-type=module','-e',JS],input=stdin,text=True,capture_output=True,cwd=ROOT,timeout=8,check=True)
        return json.loads(proc.stdout),make_marker_template(B,packet)[0]
    def test_exact_paired_solver_agreement(self):
        variants=[P,dict(P,**{'shoulder.L':[.64,.73,.6],'neck':[.48,.81,.42]}),dict(P,**{'elbow.R':[.10,.71,.44],'toe.L':[.65,.025,.7]})]
        for points in variants:
            js_bones,py_bones=self.preview(points)
            self.assertEqual([x['name'] for x in js_bones],[x['name'] for x in py_bones])
            for js,py in zip(js_bones,py_bones):
                self.assertEqual(js['parent'],py['parent'])
                for end in ('head','tail'):
                    x,y,z=js[end]
                    transformed=(x,-z,y)
                    for actual,expected in zip(transformed,py[end]):
                        self.assertAlmostEqual(actual,expected,places=9,msg=f'{js["name"]}.{end}')

if __name__ == '__main__':unittest.main()
