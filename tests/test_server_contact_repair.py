"""HTTP route forwards guarded opt-in to headless Blender; never on legacy skin."""
import base64,json,os,sys,threading,unittest,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
import server
from test_marker_rig import payload as markers

class ContactRepairHttpTests(unittest.TestCase):
 def setUp(self):
  self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  self.thread=threading.Thread(target=self.http.serve_forever,daemon=True)
  self.thread.start()
 def tearDown(self):
  self.http.shutdown()
  self.http.server_close()
  self.thread.join(timeout=2)
 def post(self,method='smart-auto',repair=True):
  with server.PROCESS_LOCK:pass
  body={'name':'female athletic figure 3d model.fbx',
   'fbxBase64':base64.b64encode(b'Mock FBX').decode(),
   'skeletonApproved':True,'markers':markers(),
   'method':method,'contactRepair':repair}
  request=urllib.request.Request('http://127.0.0.1:%d/api/auto-rig'%self.http.server_port,
   data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
  try:
   with urllib.request.urlopen(request,timeout=5) as response:
    return response.status,response.read(),response.headers
  except urllib.error.HTTPError as error:return error.code,error.read(),error.headers
 def test_explicit_boolean_opt_in_reaches_blender(self):
  calls=[]
  def mock_blender(command,**kwargs):
   calls.append(command)
   with open(command[command.index('--output')+1],'wb') as f:f.write(b'FBX')
   with open(command[command.index('--report')+1],'w') as f:
    json.dump({'template':'confirmed-markers','landmarkCount':16,'skinMode':'smart-auto',
     'envelopeCount':0,'contactRepair':{'status':'repaired','facesRemoved':42,
        'watertightTopologyCheck':True}},f)
   return type('BlenderResult',(),{'returncode':0,'stdout':'','stderr':''})()
  with patch.object(server,'find_blender',return_value='/blender'),\
       patch.object(server.subprocess,'run',side_effect=mock_blender):
   code,data,headers=self.post()
   self.assertEqual(code,200)
   self.assertIn('--contact-repair',calls[-1])
   self.assertEqual(data,b'FBX')
   self.assertEqual(json.loads(headers['X-WhiskeyPose-Report'])['contactRepair']['facesRemoved'],42)
   code,data,_=self.post(repair=False)
   self.assertEqual(code,200)
   self.assertNotIn('--contact-repair',calls[-1])
 def test_repair_rejected_with_legacy_skin(self):
  with patch.object(server,'find_blender',return_value='/blender'):
   code,body,_=self.post(method='envelope')
   self.assertEqual(code,400)
   self.assertIn(b'Contact repair requires',body)

if __name__=='__main__':unittest.main()
