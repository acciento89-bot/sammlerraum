#!/usr/bin/env python3
"""Bounded read-only owned production SEO checks; never creates accounts or requests indexing."""
import argparse
import datetime
import json
import re
import runpy
import ssl
import struct
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
SECURITY = runpy.run_path(str(ROOT / 'scripts/smoke-production.py'))
OwnedRedirect = SECURITY['OwnedRedirect']
MAX_XML = 16 * 1024 * 1024

class Fetched(NamedTuple):
    status: int
    mime: str
    body: bytes
    final_url: str
    cache_control: str = ''

def production_origin(value):
    parsed = urlsplit(value.rstrip('/'))
    if (parsed.scheme != 'https' or parsed.hostname not in {'sammlerraum.de', 'www.sammlerraum.de'}
            or parsed.port not in (None, 443) or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment):
        raise ValueError('Owned production HTTPS origin only')
    return 'https://' + parsed.hostname

def marketing_pages():
    rows = []
    for key, paths in [('home', {'de': '/de', 'en': '/en'}), ('features', {'de': '/de/funktionen', 'en': '/en/features'}), ('pricing', {'de': '/de/preise', 'en': '/en/pricing'}), ('coins', {'de': '/de/sammeln/muenzen', 'en': '/en/collecting/coins'})]:
        for locale in ['de', 'en']:
            text = json.loads((ROOT / 'apps/web/messages' / (locale + '.json')).read_text())
            heading = text['Home']['title'] if key == 'home' else text['SEO']['featuresTitle'] if key == 'features' else text['Billing']['pricingTitle'] if key == 'pricing' else text['Categories']['pages']['coins']['title']
            rows.append({'path': paths[locale], 'paths': paths, 'locale': locale, 'heading': heading})
    return rows

def curated_paths():
    paths = {p['path'] for p in marketing_pages()}
    for de, en in [('sammelkarten', 'trading-cards'), ('uhren', 'watches'), ('schallplatten', 'vinyl'), ('comics', 'comics'), ('briefmarken', 'stamps')]:
        paths.update(['/de/sammeln/' + de, '/en/collecting/' + en])
    return paths

PUBLIC = re.compile(r'^/(?:de|en)/@[a-z0-9][a-z0-9-]{2,63}(?:/collection-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:/items/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?)?$')
FIXTURE_KEYS = ['optedInProfile', 'optedInCollection', 'optedInItem', 'optedOutProfile', 'privateItem', 'unlistedItem']
def validate_fixtures(value):
    if not isinstance(value, dict) or value.get('ownedFixture') is not True or set(value) != {'ownedFixture', 'expectedHeadings', *FIXTURE_KEYS}:
        raise ValueError('Complete owned privacy fixture manifest required')
    headings = value.get('expectedHeadings')
    if not isinstance(headings, dict) or set(headings) != set(FIXTURE_KEYS[:4]) or any(not isinstance(v, str) or not v.strip() or len(v) > 300 for v in headings.values()):
        raise ValueError('Explicit public fixture page headings required')
    for key in FIXTURE_KEYS:
        if not isinstance(value[key], str) or not PUBLIC.fullmatch(value[key]):
            raise ValueError('Fixtures must be owned public-route identities, never tokens/auth/API URLs')
    if len({value[k] for k in FIXTURE_KEYS}) != len(FIXTURE_KEYS):
        raise ValueError('Distinct fixture states required')
    if '/collection-' in value['optedInProfile'] or '/collection-' in value['optedOutProfile']:
        raise ValueError('Profile fixture identity required')
    if '/collection-' not in value['optedInCollection'] or '/items/' in value['optedInCollection']:
        raise ValueError('Collection fixture identity required')
    if any('/items/' not in value[k] for k in ['optedInItem', 'privateItem', 'unlistedItem']):
        raise ValueError('Item fixture identity required')
    return value

class HtmlFacts(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.lang, self.canonical, self.languages, self.robots, self.images, self.headings = '', [], {}, [], [], []
        self.current = None
        self.feed(body.decode('utf-8'))
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html': self.lang = a.get('lang', '')
        if tag == 'link' and a.get('rel') == 'canonical': self.canonical.append(a.get('href', ''))
        if tag == 'link' and a.get('rel') == 'alternate':
            lang = a.get('hreflang', '')
            self.languages.setdefault(lang, []).append(a.get('href', ''))
        if tag == 'meta' and a.get('name') == 'robots': self.robots.append(a.get('content', '').lower())
        if tag == 'meta' and a.get('property') == 'og:image': self.images.append(a.get('content', ''))
        if tag == 'h1': self.current = []
    def handle_data(self, value):
        if self.current is not None: self.current.append(value)
    def handle_endtag(self, tag):
        if tag == 'h1' and self.current is not None:
            self.headings.append(' '.join(''.join(self.current).split())); self.current = None

def live_fetch(base):
    opener = build_opener(OwnedRedirect(base))
    def fetch(path, kind='html'):
        if not path.startswith('/') or path.startswith('//') or '?' in path or '#' in path:
            raise ValueError('Closed relative route required')
        request = Request(base + path, headers={'User-Agent': 'Sammlerraum-ReadOnly-SEO-Smoke/1', 'Accept': 'application/xml' if kind == 'xml' else 'image/png' if kind == 'image' else 'text/html'})
        try: response = opener.open(request, timeout=10)
        except HTTPError as error: response = error
        with response:
            limit = MAX_XML if kind == 'xml' else 5 * 1024 * 1024 if kind == 'image' else 1024 * 1024
            body = response.read(limit + 1)
            if len(body) > limit: raise ValueError('Response exceeded bounded verification budget')
            return Fetched(response.code, response.headers.get('content-type', ''), body, response.geturl(), response.headers.get('cache-control', ''))
    return fetch

def xml_locations(body, expected_root):
    from xml.etree import ElementTree
    if len(body) > MAX_XML or re.search(br'<!\s*(DOCTYPE|ENTITY)', body, re.I):
        raise ValueError('Unsafe or oversized sitemap XML')
    root = ElementTree.fromstring(body)
    ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    if root.tag != ns + expected_root: raise ValueError('Unexpected sitemap document')
    children = root.findall(ns + ('sitemap' if expected_root == 'sitemapindex' else 'url'))
    maximum = 50000 if expected_root == 'sitemapindex' else 10000
    if len(children) > maximum: raise ValueError('Sitemap protocol capacity exceeded')
    locs = [child.findtext(ns + 'loc', '') for child in children]
    if len(set(locs)) != len(locs) or any(not v for v in locs): raise ValueError('Missing or duplicate sitemap identities')
    return locs

def relative_owned(base, value):
    u = urlsplit(value)
    if u.scheme != 'https' or u.netloc != urlsplit(base).netloc or u.query or u.fragment or u.username or u.password:
        raise ValueError('Sitemap or preview left the canonical owned origin')
    return u.path

def verify(base, fixtures=None, fetch=None):
    base = production_origin(base)
    transport = fetch or live_fetch(base)
    checks, deadline = [], time.monotonic() + 120
    def check(label, work):
        try:
            if time.monotonic() > deadline: raise TimeoutError('Verification deadline exceeded')
            passed = bool(work()); error = None if passed else 'UNEXPECTED_RESPONSE'
        except (URLError, ssl.SSLError) as error_value:
            passed = False; error = 'TLS_CERTIFICATE_ERROR' if 'CERTIFICATE' in str(error_value).upper() else 'NETWORK_UNAVAILABLE'
        except Exception:
            passed = False; error = 'INVALID_RESPONSE_OR_VERIFICATION_BUDGET'
        checks.append({'check': label, 'passed': passed, **({'error': error} if error else {})})
        return passed
    def page(path):
        res = transport(path)
        if res.status != 200 or 'text/html' not in res.mime or len(res.body) > 1048576: raise ValueError('Expected HTML page')
        final = urlsplit(res.final_url)
        if not SECURITY['same_owned_origin'](base, res.final_url) or final.path != path or final.query or final.fragment:
            raise ValueError('Unexpected final page identity')
        return HtmlFacts(res.body)
    check('robots', lambda: (lambda r: r.status == 200 and 'text/plain' in r.mime and all(path in r.body.decode() for path in ['/api/', '/share/', '/invite/', '/de/account/', '/en/account/', '/de/login', '/en/login']) and base + '/sitemap.xml' in r.body.decode() and relative_owned(base, r.final_url) == '/robots.txt')(transport('/robots.txt', 'text')))
    for target in marketing_pages():
        def marketing(target=target):
            facts = page(target['path'])
            return (facts.lang == target['locale'] and target['heading'] in facts.headings and facts.canonical == [base + target['path']]
                    and facts.robots == ['index, follow'] and all(facts.languages.get(k) == [base + v] for k, v in [('de-DE', target['paths']['de']), ('en', target['paths']['en']), ('x-default', target['paths']['de'])]))
        check('marketing_' + target['path'].strip('/').replace('/', '_'), marketing)
    for locale in ['de', 'en']:
        def auth_guard(locale=locale):
            res = transport('/' + locale + '/search')
            final = urlsplit(res.final_url)
            return (res.status == 200 and SECURITY['same_owned_origin'](base, res.final_url)
                    and final.path in ['/' + locale + '/search', '/' + locale + '/login']
                    and not final.query and not final.fragment and any('noindex' in value for value in HtmlFacts(res.body).robots))
        check('noindex_search_or_its_auth_guard_' + locale, auth_guard)
        def image(locale=locale):
            res = transport('/' + locale + '/opengraph-image', 'image')
            return (res.status == 200 and 'image/png' in res.mime and res.body.startswith(b'\x89PNG\r\n\x1a\n')
                    and len(res.body) >= 33 and res.body[12:16] == b'IHDR' and struct.unpack('>II', res.body[16:24]) == (1200, 630)
                    and relative_owned(base, res.final_url) == '/' + locale + '/opengraph-image')
        check('actual_png_preview_' + locale, image)
    urls = set()
    def sitemaps():
        response = transport('/sitemap.xml', 'xml')
        if response.status != 200 or 'xml' not in response.mime or 'no-store' not in response.cache_control: return False
        links = xml_locations(response.body, 'sitemapindex')
        paths = [relative_owned(base, link) for link in links]
        if '/sitemaps/marketing' not in paths or len(paths) > 128: raise ValueError('Sitemap coverage exceeds bounded release-smoke budget')
        if any(not (p == '/sitemaps/marketing' or re.fullmatch(r'/sitemaps/community/[pci]-[0-9a-f]{1,32}', p)) for p in paths): return False
        total_bytes = 0
        curated = curated_paths()
        for path in paths:
            if time.monotonic() > deadline: raise TimeoutError('Sitemap verification deadline exceeded')
            res = transport(path, 'xml'); total_bytes += len(res.body)
            if res.status != 200 or 'xml' not in res.mime or 'no-store' not in res.cache_control or total_bytes > 32 * 1024 * 1024: return False
            for value in xml_locations(res.body, 'urlset'):
                resource = relative_owned(base, value)
                if path.endswith('marketing') and resource not in curated: return False
                if not path.endswith('marketing') and not PUBLIC.fullmatch(resource): return False
                if value in urls: return False
                urls.add(value)
        return all(base + path in urls for path in curated)
    sitemap_ok = check('all_bounded_sitemap_segments_and_safe_identities', sitemaps)
    valid_fixtures = None
    if fixtures is not None:
        try: valid_fixtures = validate_fixtures(fixtures)
        except ValueError: pass
    check('owned_privacy_fixtures_present', lambda: valid_fixtures is not None)
    if valid_fixtures:
        for key in ['optedInProfile', 'optedInCollection', 'optedInItem', 'optedOutProfile']:
            def public_fixture(key=key):
                facts = page(valid_fixtures[key]); desired = 'noindex' if key == 'optedOutProfile' else 'index'
                actual = {part.strip() for robots in facts.robots for part in robots.split(',')}
                expected_path = valid_fixtures[key]
                suffix = re.sub(r'^/(?:de|en)', '', expected_path)
                alternatives = {'de-DE': base + '/de' + suffix, 'en': base + '/en' + suffix, 'x-default': base + '/de' + suffix}
                canonical = relative_owned(base, facts.canonical[0]) if len(facts.canonical) == 1 else ''
                return (facts.lang == expected_path.split('/')[1] and ' '.join(valid_fixtures['expectedHeadings'][key].split()) in facts.headings
                        and canonical in ['/de' + suffix, '/en' + suffix] and all(facts.languages.get(k) == [v] for k, v in alternatives.items())
                        and desired in actual and ('index' not in actual if desired == 'noindex' else 'noindex' not in actual))
            check('fixture_' + key, public_fixture)
        for key in ['privateItem', 'unlistedItem']:
            check('fixture_' + key + '_unavailable', lambda key=key: transport(valid_fixtures[key]).status in [404, 410])
        # Match underlying identity across the two public locale/chrome routes.
        identity = lambda value: re.sub(r'^/(?:de|en)/', '/', urlsplit(value).path)
        indexed = {identity(value) for value in urls}
        check('opted_in_fixture_sitemap_presence', lambda: sitemap_ok and all(identity(valid_fixtures[k]) in indexed for k in ['optedInProfile', 'optedInCollection', 'optedInItem']))
        check('opted_out_private_unlisted_absent_from_sitemaps', lambda: sitemap_ok and all(identity(valid_fixtures[k]) not in indexed for k in ['optedOutProfile', 'privateItem', 'unlistedItem']))
    return {'scope': 'Read-only owned HTTPS verification; no DNS, indexing requests, account creation or customer transactions', 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': all(c['passed'] for c in checks), 'checks': checks, 'searchConsoleOwnershipProven': False, 'searchConsoleSitemapProcessed': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://sammlerraum.de')
    parser.add_argument('--fixtures', help='Private owner-controlled fixture manifest, never Git')
    parser.add_argument('--receipt')
    args = parser.parse_args()
    base = production_origin(args.base_url)
    fixtures = json.loads(Path(args.fixtures).read_text()) if args.fixtures else None
    result = verify(base, fixtures)
    if args.receipt:
        path = Path(args.receipt); path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(result, indent=2) + '\n')
    for check in result['checks']: print(('PASS ' if check['passed'] else 'FAIL ') + check['check'] + (': ' + check['error'] if check.get('error') else ''))
    return 0 if result['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
