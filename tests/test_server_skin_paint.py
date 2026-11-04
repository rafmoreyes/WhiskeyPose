"""HTTP SIB endpoint must pass validated edits to Blender, not silently lose them."""
import base64,json,os,sys,threading,unittest,urllib.request,urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
import server

class SoftBrushHttpTest(unittest.TestCase):
 def setUp(self):
  self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
 def tearDown(self):
  self.http.shutdown();self.http.server_close();self.thread.join(timeout=2)
 def request(self,edits):
  with server.PROCESS_LOCK:pass
  body={'name':'rig.fbx','fbxBase64':base64.b64encode(b'FAKEFBX').decode(),'edits':edits}
  req=urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/skin-paint',
    data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
  try:
   with urllib.request.urlopen(req,timeout=5) as resp:return resp.status,resp.read(),resp.headers
  except urllib.error.HTTPError as exc:return exc.code,exc.read(),exc.headers
 def test_rejects_unbalanced_edits_and_forwards_valid_to_blender(self):
  valid={'format':'whiskeypose-sib-v1','version':1,'meshes':[{'name':'Body','samples':[
   {'p':[.4,.5,.3],'w':[['upper_arm.L',.7],['forearm.L',.3]]}]}]}
  seen=[]
  def fake_blender(command,**kwargs):
   self.assertIn('--edits',command)
   with open(command[command.index('--edits')+1],encoding='utf8') as f:seen.append(json.load(f))
   with open(command[command.index('--output')+1],'wb') as f:f.write(b'NEWFBX')
   with open(command[command.index('--report')+1],'w') as f:
    json.dump({'skinMode':'soft-influence-brush','matched':1,'verticesUpdated':2},f)
   return type('Job',(),{'returncode':0,'stdout':'','stderr':''})()
  with patch.object(server,'find_blender',return_value='/blender'),patch.object(server.subprocess,'run',side_effect=fake_blender):
   malformed=json.loads(json.dumps(valid));malformed['meshes'][0]['samples'][0]['w'][0][1]=.1
   status,_,_=self.request(malformed)
   self.assertEqual(status,400)
   status,data,headers=self.request(valid)
   self.assertEqual(status,200)
   self.assertEqual(data,b'NEWFBX')
   self.assertEqual(seen,[valid])
   self.assertEqual(json.loads(headers['X-WhiskeyPose-Report'])['matched'],1)
if __name__=='__main__':unittest.main()
