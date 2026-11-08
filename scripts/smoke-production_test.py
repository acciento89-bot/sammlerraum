import http.server
import importlib.util
from pathlib import Path
import threading
import unittest
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('smoke-production.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class LocaleSmoke(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  class Site(http.server.BaseHTTPRequestHandler):
   def do_GET(self):
    redirects={'/de/wrong-locale':'/en/login','/de/foreign':f'http://127.0.0.1:{self.server.server_port}/de/pricing','/de/alias':'/de/preise'}
    if self.path in redirects:
     self.send_response(302);self.send_header('Location',redirects[self.path]);self.end_headers();return
    body=('<html lang="en"><h1>Log in</h1></html>' if self.path=='/en/login' else
          '<html lang="de"><h1>Anmelden</h1></html>' if self.path=='/de/wrong-page' else
          '<html lang="de"><h1>Tarife &amp; Leistungen</h1></html>')
    self.send_response(200);self.end_headers();self.wfile.write(body.encode())
   def log_message(self,*_):pass
  cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Site)
  cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
  cls.base=f'http://localhost:{cls.server.server_port}'
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
 def test_home_marker_matches_collector_hub(self):
  self.assertEqual(m.page_marker('de',''), 'Willkommen im Sammlerraum!')
  self.assertEqual(m.page_marker('en',''), 'Welcome to Sammlerraum!')
 def test_correct_real_html_locale_and_page_marker(self):
  self.assertTrue(m.probe_page(self.base,'/de/pricing','de','Tarife & Leistungen'))
 def test_wrong_page_and_language_fail(self):
  self.assertFalse(m.probe_page(self.base,'/de/wrong-page','de','Tarife & Leistungen'))
  self.assertFalse(m.probe_page(self.base,'/de/pricing','en','Tarife & Leistungen'))
 def test_cross_locale_and_unrelated_host_redirects_fail(self):
  self.assertFalse(m.probe_page(self.base,'/de/wrong-locale','de','Tarife & Leistungen'))
  self.assertFalse(m.probe_page(self.base,'/de/foreign','de','Tarife & Leistungen'))
 def test_redirect_to_wrong_path_does_not_count_as_requested_page(self):
  self.assertFalse(m.probe_page(self.base,'/de/alias','de','Tarife & Leistungen'))
if __name__=='__main__':unittest.main(verbosity=2)
