#!/usr/bin/env python3
"""Bounded anonymous release smoke. No login, purchases, mail or customer writes."""
import argparse
import datetime
import json
import sys
import uuid
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='https://sammlerraum.de')
    parser.add_argument('--receipt')
    args=parser.parse_args()
    base=args.base_url.rstrip('/')
    url=urlsplit(base)
    if url.scheme!='https' or url.hostname not in ('sammlerraum.de','www.sammlerraum.de') or url.username or url.password or url.path or url.query or url.fragment:
        raise ValueError('Only the explicitly owned production HTTPS host is allowed')
    checks=[]
    def request(path,expect,kind=None,method='GET'):
        try:
            req=Request(base+path,method=method,headers={'User-Agent':'Sammlerraum-ReadOnly-Release-Smoke/1','Accept':'application/json' if kind=='json' else 'text/html'})
            if method=='POST':
                # Empty unsigned request must be rejected before any receipt/provider work.
                req.data=b''
                req.add_header('Content-Type','application/json')
            try:
                response=urlopen(req,timeout=10)
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
                    ok=b'<html' in body.lower() and b'</html>' in body.lower()
                checks.append({'path':path,'method':method,'status':status,'passed':ok})
        except (OSError,ValueError,URLError):
            checks.append({'path':path,'method':method,'status':None,'passed':False,'reason':'TLS, network or response contract failed'})
    request('/api/health',{200},'json')
    for locale in ('de','en'):
        for suffix in ('','/login','/pricing'):
            request('/'+locale+suffix,{200},'html')
    request('/api/openapi.json',{200},'openapi')
    request('/api/v1/billing/webhook',{400,401,403,404},method='POST')
    request('/api/v1/media/'+str(uuid.uuid4())+'/original',{404})
    for path in ('/api/v1/marketplace/checkout','/api/v1/payouts','/api/v1/escrow'):
        request(path,{404})
    result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseURL':base,'scope':'anonymous public release smoke; no production changes','passed':all(c['passed'] for c in checks),'checks':checks}
    if args.receipt:
        from pathlib import Path
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
