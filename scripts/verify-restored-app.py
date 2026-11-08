#!/usr/bin/env python3
"""CI-only recovered real-app health, private bytes and anonymous-denial probe."""
import argparse
import hashlib
import http.cookiejar
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from urllib.request import build_opener, Request, HTTPRedirectHandler, HTTPCookieProcessor
from urllib.error import HTTPError


class RecoveredProofError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise RecoveredProofError('A recovered API must not redirect')


def fetch(opener, url, limit):
    try:
        response=opener.open(Request(url,headers={'Accept':'application/json, image/*'}),timeout=10)
    except HTTPError as error:
        response=error
    with response:
        body=response.read(limit+1)
        if len(body)>limit: raise RecoveredProofError('Recovered response exceeded its byte bound')
        return response.code,body,response.headers


def verify_restored_app(base, cookie_jar, assets):
    target=urlsplit(base)
    if target.scheme!='http' or target.hostname not in ('127.0.0.1','localhost','::1') or target.path or target.query or target.fragment or target.username or target.password:
        raise RecoveredProofError('Owned isolated loopback app required')
    if len(assets)<2 or not any(a['variant']=='original' for a in assets) or not any(a['variant']!='original' for a in assets):
        raise RecoveredProofError('Original and processed variant are required')
    jar=http.cookiejar.MozillaCookieJar(str(cookie_jar))
    jar.load(ignore_discard=True)
    owner=build_opener(NoRedirect(),HTTPCookieProcessor(jar))
    guest=build_opener(NoRedirect())
    status,body,_=fetch(guest,base+'/api/health',65536)
    health=json.loads(body)
    if status!=200 or health.get('status')!='ok' or health.get('service')!='sammlerraum-web' or health.get('dependencies',{}).get('database')!='up':
        raise RecoveredProofError('Actual recovered Sammlerraum web health required')
    for asset in assets:
        if not re.fullmatch(r'[a-f0-9-]{36}',asset['id']) or asset['variant'] not in ('original','thumbnail','medium','large') or not re.fullmatch(r'[a-f0-9]{64}',asset['sha256']) or not 0<int(asset['bytes'])<=4194304:
            raise RecoveredProofError('Invalid owned media witness')
        path='/api/v1/media/'+asset['id']+'/'+asset['variant']
        denied,_,_=fetch(guest,base+path,1048576)
        if denied!=404: raise RecoveredProofError('Recovered private media leaked to anonymous client')
        status,body,headers=fetch(owner,base+path,int(asset['bytes']))
        cache=headers.get('Cache-Control','').lower()
        if status!=200 or len(body)!=int(asset['bytes']) or hashlib.sha256(body).hexdigest()!=asset['sha256'] or 'private' not in cache or 'no-store' not in cache:
            raise RecoveredProofError('Recovered authenticated bytes/cache contract failed')
    return {'passed':True,'actualWebHealth':True,'authenticatedExactReads':len(assets),'anonymousDenials':len(assets),'scope':'isolated recovered real web app; own synthetic media only'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--cookie-jar',type=Path,required=True)
    parser.add_argument('--assets',type=Path,required=True)
    parser.add_argument('--receipt',type=Path,required=True)
    args=parser.parse_args()
    result=verify_restored_app(args.base_url,args.cookie_jar,json.loads(args.assets.read_text()))
    args.receipt.write_text(json.dumps(result,indent=2)+'\n')
    print('PASS: actual recovered web health, protected original/variant bytes and anonymous denials')


if __name__=='__main__':
    try: main()
    except RecoveredProofError as error:
        print('Recovered application proof failed: '+str(error),file=sys.stderr)
        sys.exit(1)
    except (OSError,ValueError,KeyError,TypeError):
        print('Recovered application proof failed; health, authentication, bytes or privacy refused',file=sys.stderr)
        sys.exit(1)
