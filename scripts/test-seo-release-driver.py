#!/usr/bin/env python3
"""Source-test driver only: real compiled app on loopback, never actual production proof."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit, urljoin
from urllib.request import HTTPRedirectHandler, Request, build_opener

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('seo_source_verifier', HERE / 'verify-seo-production.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs): return None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', required=True)
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    database = urlsplit(os.environ.get('DATABASE_URL', ''))
    if (os.environ.get('RUN_SEO_RELEASE_E2E') != '1' or database.scheme not in ['postgres', 'postgresql']
            or database.hostname not in ['localhost', '127.0.0.1', '::1'] or not database.path.endswith('_test')):
        raise ValueError('Explicit owned loopback test configuration required')
    base = 'https://sammlerraum.de'
    local = 'http://localhost:3000'
    opener = build_opener(NoRedirect())
    def transport(path, kind='html'):
        if not path.startswith('/') or path.startswith('//') or '?' in path or '#' in path:
            raise ValueError('Closed source-test route required')
        current = path
        for _ in range(6):
            try: res = opener.open(Request(local + current, headers={'User-Agent': 'Sammlerraum-ReadOnly-SEO-Smoke/1'}), timeout=5)
            except HTTPError as error: res = error
            with res:
                if res.code in [301, 302, 303, 307, 308]:
                    target = urljoin(base + current, res.headers.get('location', ''))
                    current = m.relative_owned(base, target)
                    continue
                limit = m.MAX_XML if kind == 'xml' else 5 * 1024 * 1024 if kind == 'image' else 1048576
                body = res.read(limit + 1)
                if len(body) > limit: raise ValueError('Source response exceeded bounded limit')
                return m.Fetched(res.code, res.headers.get('content-type', ''), body, base + current, res.headers.get('cache-control', ''))
        raise ValueError('Source redirect budget exhausted')
    result = m.verify(base, m.validate_fixtures(json.loads(Path(args.fixtures).read_text())), fetch=transport)
    result['scope'] = 'Actual compiled local application with owned test DB and loopback-only transport; NOT a production deployment receipt'
    Path(args.receipt).write_text(json.dumps(result, indent=2) + '\n')
    for check in result['checks']:
        print(('PASS ' if check['passed'] else 'FAIL ') + check['check'])
    return 0 if result['passed'] else 1

if __name__ == '__main__': raise SystemExit(main())
