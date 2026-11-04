"""HTTP integration: envelope settings must reach the Blender subprocess."""
import base64,json,os,sys,threading,unittest,urllib.request,urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
import server
from test_marker_rig import payload

NAMES=['pelvis','spine','chest','neck','head']+[f'{part}.{side}' for side in ('L','R') for part in ('shoulder','upper_arm','forearm','hand','thigh','shin','foot')]

class EnvelopeHttpTests(unittest.TestCase):
    def setUp(self):
        self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join(timeout=2)
    def post(self,body):
        # Wait until the previous test request releases the global processing lock.
        with server.PROCESS_LOCK: pass
        request=urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/auto-rig',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
        try:
            with urllib.request.urlopen(request,timeout=4) as resp:return resp.status,resp.read(),resp.headers
        except urllib.error.HTTPError as error:return error.code,error.read(),error.headers
    def test_forwards_actual_selected_capsules(self):
        settings={'format':'whiskeypose-skin-envelopes','version':1,'envelopes':{name:{'radius':.06,'mode':'smooth'} for name in NAMES}}
        settings['envelopes']['forearm.R']={'radius':.14,'mode':'rigid'}
        body={'name':'example.fbx','fbxBase64':base64.b64encode(b'Fake').decode(),
              'skeletonApproved':True,'markers':payload(),'method':'envelope','envelopes':settings}
        recorded=[]
        def blender(command,**kwargs):
            self.assertIn('--envelopes',command)
            with open(command[command.index('--envelopes')+1],encoding='utf-8') as stream: recorded.append(json.load(stream)['envelopes']['forearm.R'])
            with open(command[command.index('--output')+1],'wb') as stream: stream.write(b'FBX')
            with open(command[command.index('--report')+1],'w') as stream:json.dump({'template':'confirmed-markers','landmarkCount':16,'skinMode':'envelope','envelopeCount':19},stream)
            return type('Result',(),{'returncode':0,'stderr':'','stdout':''})()
        with patch.object(server,'find_blender',return_value='/blender'),patch.object(server.subprocess,'run',side_effect=blender):
            code,_,_=self.post({**body,'envelopes':None})
            self.assertEqual(code,400)
            code,data,headers=self.post(body)
            self.assertEqual(code,200);self.assertEqual(data,b'FBX')
            self.assertEqual(recorded,[{'radius':.14,'mode':'rigid'}])
            self.assertEqual(json.loads(headers['X-WhiskeyPose-Report'])['skinMode'],'envelope')
    def test_smart_auto_requires_no_envelope_payload(self):
        body={'name':'example.fbx','fbxBase64':base64.b64encode(b'Fake').decode(),
              'skeletonApproved':True,'markers':payload(),'method':'smart-auto'}
        def blender(command,**kwargs):
            self.assertIn('--method',command)
            self.assertEqual(command[command.index('--method')+1],'smart-auto')
            self.assertNotIn('--envelopes',command)
            with open(command[command.index('--output')+1],'wb') as stream:
                stream.write(b'FBX')
            with open(command[command.index('--report')+1],'w') as stream:
                json.dump({'template':'confirmed-markers','landmarkCount':16,
                           'skinMode':'smart-auto','envelopeCount':0},stream)
            return type('Result',(),{'returncode':0,'stderr':'','stdout':''})()
        with patch.object(server,'find_blender',return_value='/blender'),patch.object(server.subprocess,'run',side_effect=blender):
            code,data,headers=self.post(body)
            self.assertEqual(code,200)
            self.assertEqual(data,b'FBX')
            self.assertEqual(json.loads(headers['X-WhiskeyPose-Report'])['skinMode'],'smart-auto')

if __name__=='__main__':unittest.main()
