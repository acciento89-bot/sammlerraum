#!/usr/bin/env python3
"""Bounded anonymous release smoke. No login, purchases, mail or customer writes."""
import argparse
import datetime
import json
import sys
import uuid
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError


OWNED_HOSTS = {'sammlerraum.de', 'www.sammlerraum.de'}


def same_owned_origin(base, target):
    a, b = urlsplit(base), urlsplit(target)
    same_host = a.hostname == b.hostname or {a.hostname, b.hostname}.issubset(OWNED_HOSTS)
    return same_host and a.scheme == b.scheme and a.port == b.port and not b.username and not b.password


class OwnedRedirect(HTTPRedirectHandler):
    def __init__(self, base):
        self.base = base

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not same_owned_origin(self.base, newurl):
            raise ValueError('Redirect left the expected owned origin')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class PageContent(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.language, self.headings, self.current = None, [], None

    def handle_starttag(self, tag, attrs):
        if tag == 'html': self.language = dict(attrs).get('lang')
        if tag == 'h1': self.current = []

    def handle_data(self, data):
        if self.current is not None: self.current.append(data)

    def handle_endtag(self, tag):
        if tag == 'h1' and self.current is not None:
            self.headings.append(' '.join(''.join(self.current).split()))
            self.current = None


def page_contract(base, path, final_url, body, locale, marker):
    final = urlsplit(final_url)
    allowed_paths = {path}
    if path == '/de/pricing': allowed_paths.add('/de/preise')
    if not same_owned_origin(base, final_url) or final.path not in allowed_paths or final.query or final.fragment:
        return False
    parser = PageContent()
    parser.feed(body.decode('utf-8'))
    return bool(parser.language and parser.language.lower().split('-')[0] == locale
                and ' '.join(marker.split()) in parser.headings)


def probe_page(base, path, locale, marker):
    try:
        with build_opener(OwnedRedirect(base)).open(base + path, timeout=10) as response:
            body = response.read(1048577)
            return response.status == 200 and len(body) <= 1048576 and page_contract(base, path, response.geturl(), body, locale, marker)
    except (OSError, ValueError, URLError):
        return False


def page_marker(locale, suffix):
    messages = json.loads((Path(__file__).resolve().parents[1] / 'apps/web/messages' / (locale + '.json')).read_text())
    if suffix == '/login': return messages['Auth']['loginTitle']
    if suffix == '/pricing': return messages['Billing']['pricingTitle']
    return messages['Home']['title']


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='https://sammlerraum.de')
    parser.add_argument('--receipt')
    args=parser.parse_args()
    base=args.base_url.rstrip('/')
    url=urlsplit(base)
    if url.scheme!='https' or url.port not in (None,443) or url.hostname not in ('sammlerraum.de','www.sammlerraum.de') or url.username or url.password or url.path or url.query or url.fragment:
        raise ValueError('Only the explicitly owned production HTTPS host is allowed')
    checks=[]
    def request(path,expect,kind=None,method='GET',locale=None,marker=None):
        try:
            req=Request(base+path,method=method,headers={'User-Agent':'Sammlerraum-ReadOnly-Release-Smoke/1','Accept':'application/json' if kind=='json' else 'text/html'})
            if method=='POST':
                # Empty unsigned request must be rejected before any receipt/provider work.
                req.data=b''
                req.add_header('Content-Type','application/json')
            try:
                response=build_opener(OwnedRedirect(base)).open(req,timeout=10)
            except HTTPError as error:
                response=error
            with response:
                status=response.code
                body=response.read(1048577)
                ok=status in expect and len(body)<=1048576
                if ok and kind=='json':
                    value=json.loads(body)
                    ok=value.get('status')=='ok' and value.get('dependencies',{}).get('database')=='up'
                elif ok and kind=='openapi':
                    value=json.loads(body)
                    ok=value.get('openapi')=='3.1.0' and isinstance(value.get('paths'),dict) and len(value['paths'])>0
                elif ok and kind=='html':
                    ok=page_contract(base,path,response.geturl(),body,locale,marker)
                checks.append({'path':path,'method':method,'status':status,'passed':ok})
        except (OSError,ValueError,URLError):
            checks.append({'path':path,'method':method,'status':None,'passed':False,'reason':'TLS, network or response contract failed'})
    request('/api/health',{200},'json')
    for locale in ('de','en'):
        for suffix in ('','/login','/pricing'):
            request('/'+locale+suffix,{200},'html',locale=locale,marker=page_marker(locale,suffix))
    request('/api/openapi.json',{200},'openapi')
    request('/api/v1/billing/webhook',{400,401,403,404},method='POST')
    request('/api/v1/media/'+str(uuid.uuid4())+'/original',{404})
    for path in ('/api/v1/marketplace/checkout','/api/v1/payouts','/api/v1/escrow'):
        request(path,{404})
    result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseURL':base,'scope':'anonymous public release smoke; no production changes','passed':all(c['passed'] for c in checks),'checks':checks}
    if args.receipt:
        path=Path(args.receipt)
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'passed':result['passed'],'checks':len(checks),'failed':[c['path'] for c in checks if not c['passed']]}))
    return 0 if result['passed'] else 1


if __name__=='__main__':
    try:
        sys.exit(main())
    except (OSError,ValueError):
        print('Production smoke refused invalid target or could not write its receipt',file=sys.stderr)
        sys.exit(1)
