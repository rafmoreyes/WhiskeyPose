"""HTTP-to-worker integration without Blender: checks marker payload reaches subprocess."""
import base64
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import server
from test_marker_rig import payload

class WorkerMarkerTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url=f'http://127.0.0.1:{self.server.server_port}/api/auto-rig'
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
    def post(self, body):
        data=json.dumps(body).encode('utf-8')
        request=urllib.request.Request(self.url,data=data,headers={'Content-Type':'application/json'},method='POST')
        try:
            with urllib.request.urlopen(request,timeout=4) as response:
                return response.status,response.read(),response.headers
        except urllib.error.HTTPError as error:
            return error.code,error.read(),error.headers
    def test_post_requires_markers_and_passes_them_to_blender(self):
        seen=[]
        def fake_blender(command, **kwargs):
            marker_file=command[command.index('--markers')+1]
            result_file=command[command.index('--output')+1]
            report_file=command[command.index('--report')+1]
            with open(marker_file,encoding='utf-8') as handle:points=json.load(handle)
            seen.append(points['markers']['elbow.R'])
            with open(result_file,'wb') as handle:handle.write(b'fake-FBX')
            with open(report_file,'w') as handle:json.dump({'template':'confirmed-markers','landmarkCount':13},handle)
            return type('Result',(),{'returncode':0,'stdout':'','stderr':''})()
        body={'name':'Demo.fbx','fbxBase64':base64.b64encode(b'FAKE-FBX').decode('ascii'), 'method':'auto'}
        with patch.object(server,'find_blender',return_value='/fake/blender.exe'), patch.object(server.subprocess,'run',side_effect=fake_blender):
            code,data,_=self.post(body)
            self.assertEqual(code,400)
            self.assertIn('marker',data.decode().lower())
            body['markers']=payload()
            body['markers']['markers']['elbow.R']=[.19,.61,.65]
            code,data,headers=self.post(body)
            self.assertEqual(code,200)
            self.assertEqual(data,b'fake-FBX')
            self.assertEqual(seen,[[.19,.61,.65]])
            self.assertEqual(json.loads(headers['X-WhiskeyPose-Report'])['landmarkCount'],13)
if __name__=='__main__':unittest.main()
