import hashlib
import http.server
import importlib.util
from pathlib import Path
import tempfile
import threading
import time
import unittest
spec=importlib.util.spec_from_file_location('restored',Path(__file__).with_name('verify-restored-app.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RestoredProtocol(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.original=b'owned original bytes';cls.variant=b'owned variant bytes';cls.fault=None
  class App(http.server.BaseHTTPRequestHandler):
   def do_GET(self):
    if self.path=='/api/health':
     self.send_response(200);self.end_headers();self.wfile.write(b'{"status":"ok","service":"sammlerraum-web","dependencies":{"database":"up"}}');return
    authorized='owned=synthetic-session' in self.headers.get('Cookie','')
    if not authorized and cls.fault!='public-leak' or cls.fault=='auth-failure':
     self.send_response(404);self.end_headers();return
    self.send_response(200);self.send_header('Cache-Control','private, no-store');self.end_headers()
    self.wfile.write(b'corrupt' if cls.fault=='corrupt' else cls.original if self.path.endswith('/original') else cls.variant)
   def log_message(self,*_):pass
  cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),App)
  threading.Thread(target=cls.server.serve_forever,daemon=True).start()
  cls.base=f'http://127.0.0.1:{cls.server.server_port}'
  cls.temp=tempfile.TemporaryDirectory(prefix='sammlerraum-recovered-http-')
  cls.jar=Path(cls.temp.name)/'cookies'
  cls.jar.write_text('# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t'+str(int(time.time()+3600))+'\towned\tsynthetic-session\n')
  cls.assets=[dict(id='00000000-0000-4000-8000-000000000001',variant=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()) for name,data in [('original',cls.original),('thumbnail',cls.variant)]]
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.temp.cleanup()
 def tearDown(self):type(self).fault=None
 def test_authenticated_exact_original_variant_and_anonymous_denials(self):
  self.assertTrue(m.verify_restored_app(self.base,self.jar,self.assets)['passed'])
 def test_select1_style_health_without_usable_auth_is_insufficient(self):
  type(self).fault='auth-failure'
  with self.assertRaises(ValueError):m.verify_restored_app(self.base,self.jar,self.assets)
 def test_corrupt_bytes_fail_despite_healthy_database(self):
  type(self).fault='corrupt'
  with self.assertRaises(ValueError):m.verify_restored_app(self.base,self.jar,self.assets)
 def test_anonymous_bytes_are_a_privacy_failure(self):
  type(self).fault='public-leak'
  with self.assertRaises(ValueError):m.verify_restored_app(self.base,self.jar,self.assets)
if __name__=='__main__':unittest.main(verbosity=2)
