import importlib.util
import json
import struct
import threading
import unittest
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('seo_verifier', HERE / 'verify-seo-production.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BASE = 'https://sammlerraum.de'
PROFILE = '/de/@smoke-opted-in'
COLLECTION = PROFILE + '/collection-11111111-1111-4111-8111-111111111111'
ITEM = COLLECTION + '/items/22222222-2222-4222-8222-222222222222'
OFF = '/de/@smoke-opted-out'
PRIVATE = COLLECTION + '/items/33333333-3333-4333-8333-333333333333'
UNLISTED = COLLECTION + '/items/44444444-4444-4444-8444-444444444444'
FIXTURES = {'ownedFixture': True, 'optedInProfile': PROFILE, 'optedInCollection': COLLECTION, 'optedInItem': ITEM, 'optedOutProfile': OFF, 'privateItem': PRIVATE, 'unlistedItem': UNLISTED, 'expectedHeadings': {k: 'Owned public fixture' for k in ['optedInProfile', 'optedInCollection', 'optedInItem', 'optedOutProfile']}}

def png():
    def chunk(name, data): return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1200, 630, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + bytes([49, 93, 72, 255]) * 1200) * 630)) + chunk(b'IEND', b'')

class RealHttpProtocol(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mutation = None
        cls.methods = []
        cls.paths = []
        cls.image = png()
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                cls.methods.append('GET'); cls.paths.append(self.path)
                status, mime, body = cls.content(self.path)
                self.send_response(status); self.send_header('Content-Type', mime); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
            def log_message(self, *_args): pass
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
    @classmethod
    def tearDownClass(cls): cls.server.shutdown(); cls.thread.join(); cls.server.server_close()
    def setUp(self): type(self).mutation = None; type(self).methods = []; type(self).paths = []
    @classmethod
    def content(cls, path):
        if path == '/robots.txt': return 200, 'text/plain', ('User-agent: *\n' + ''.join('Disallow: '+p+'\n' for p in ['/api/', '/share/', '/invite/', '/de/account/', '/en/account/', '/de/login', '/en/login']) + 'Sitemap: ' + BASE + '/sitemap.xml\n').encode()
        if path == '/sitemap.xml': return 200, 'application/xml', ('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>' + BASE + '/sitemaps/marketing</loc></sitemap><sitemap><loc>' + BASE + '/sitemaps/community/p-a</loc></sitemap></sitemapindex>').encode()
        if path.startswith('/sitemaps/'):
            urls = [BASE + p for p in sorted(m.curated_paths())] if path.endswith('marketing') else [BASE + PROFILE, BASE + COLLECTION, BASE + ITEM]
            if cls.mutation == 'private-leak': urls.append(BASE + PRIVATE)
            if cls.mutation == 'foreign-url': urls.append('https://outside.invalid/private')
            return 200, 'application/xml', ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join('<url><loc>' + u + '</loc></url>' for u in urls) + '</urlset>').encode()
        if path.endswith('/opengraph-image'): return 200, 'image/png', cls.image if cls.mutation != 'bad-image' else b'<html>error</html>'
        if path in [PRIVATE, UNLISTED]: return 404, 'text/html', b'<html><head><meta name="robots" content="noindex"></head><body>Not found</body></html>'
        expected = next((p for p in m.marketing_pages() if p['path'] == path), None)
        locale = path.split('/')[1] if path.startswith(('/de/', '/en/')) else path[1:]
        title = expected['heading'] if expected else 'Owned public fixture'
        index = path not in [OFF] and not any(x in path for x in ['/login', '/register', '/search'])
        if path == OFF and cls.mutation == 'opted-out-indexed': index = True
        paths = expected['paths'] if expected else {'de': path.replace('/en/', '/de/', 1), 'en': path.replace('/de/', '/en/', 1)}
        canonical = BASE + (expected['path'] if expected else path)
        if cls.mutation == 'wrong-canonical': canonical = BASE + '/de/unrelated'
        if cls.mutation == 'wrong-locale': locale = 'xx'
        if cls.mutation == 'wrong-fixture-heading' and path in [PROFILE,COLLECTION,ITEM,OFF]: title = 'Wrong unrelated page'
        links = '<link rel="canonical" href="' + canonical + '">' + ''.join('<link rel="alternate" hreflang="' + lang + '" href="' + BASE + p + '">' for lang, p in [('de-DE', paths['de']), ('en', paths['en']), ('x-default', paths['de'])])
        html = '<html lang="' + locale + '"><head>' + links + '<meta name="robots" content="' + ('index, follow' if index else 'noindex, follow') + '"><meta property="og:image" content="' + BASE + '/' + locale + '/opengraph-image"></head><body><h1>' + title + '</h1></body></html>'
        return 200, 'text/html', html.encode()
    def fetch(self, path, _kind='html'):
        with urlopen('http://127.0.0.1:' + str(self.server.server_port) + path, timeout=3) as res:
            return m.Fetched(res.status, res.headers.get('content-type', ''), res.read(16777217), BASE + path, res.headers.get('cache-control', ''))
    def transport(self, path, kind='html'):
        from urllib.error import HTTPError
        try: return self.fetch(path, kind)
        except HTTPError as res: return m.Fetched(res.code, res.headers.get('content-type', ''), res.read(), BASE + path, res.headers.get('cache-control', ''))
    def run_gate(self, fixtures=FIXTURES): return m.verify(BASE, fixtures, fetch=self.transport)
    def test_01_real_http_valid_metadata_sitemaps_private_fixtures_and_png_pass_read_only(self):
        result = self.run_gate(); self.assertTrue(result['passed'], result); self.assertEqual(set(self.methods), {'GET'})
    def test_02_rejects_wrong_page_canonical_and_locale(self):
        for mutation in ['wrong-canonical', 'wrong-locale', 'wrong-fixture-heading']:
            type(self).mutation = mutation; self.assertFalse(self.run_gate()['passed'])
    def test_03_private_sitemap_leak_and_foreign_urls_fail_without_external_fetch(self):
        for mutation in ['private-leak', 'foreign-url']:
            type(self).mutation = mutation; self.assertFalse(self.run_gate()['passed']); self.assertFalse(any('outside' in p for p in self.paths))
    def test_04_opted_out_indexing_and_fake_image_fail(self):
        for mutation in ['opted-out-indexed', 'bad-image']:
            type(self).mutation = mutation; self.assertFalse(self.run_gate()['passed'])
    def test_05_missing_or_unsafe_fixtures_never_count_as_complete(self):
        self.assertFalse(self.run_gate(None)['passed'])
        for path in ['/api/private', '/share/token', '/de/@abc?token=secret', 'https://outside.invalid/de/@abc']:
            with self.assertRaises(ValueError): m.validate_fixtures({**FIXTURES, 'optedOutProfile': path})
    def test_06_refuses_nonowned_origin_or_credentials(self):
        for value in ['http://sammlerraum.de', 'https://outside.invalid', 'https://user:secret@sammlerraum.de', 'https://sammlerraum.de/private', 'https://sammlerraum.de?token=x']:
            with self.assertRaises(ValueError): m.production_origin(value)

if __name__ == '__main__': unittest.main(verbosity=2)
