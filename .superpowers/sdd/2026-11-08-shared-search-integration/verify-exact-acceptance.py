from pathlib import Path
import json,subprocess,hashlib
base=Path(__file__).parent
candidate='77b69f9478e06db09d04df173b7b6b9df6535354'
run=json.loads((base/'task-6-exact-ci-run.json').read_text())
assert run['head_sha']==candidate and run['id']==42433316774 and run['status']=='completed' and run['conclusion']=='success'
jobs=json.loads((base/'task-6-exact-ci-jobs.json').read_text())['jobs']
assert jobs and all(j['status']=='completed' and j['conclusion']=='success' for j in jobs)
assert all(s['conclusion'] in ['success','skipped'] for j in jobs for s in j['steps'])
receipt=json.loads(subprocess.check_output(['git','show',f'{candidate}:.superpowers/sdd/2026-11-08-shared-search-integration/task-6-gate-receipt.json']))
assert (receipt['regularPassed'],receipt['nativePassed'],receipt['nativeSkipped'],receipt['browserPassed'])==(1659,2832,0,234)
for name,digest in receipt['logs'].items():
 blob=subprocess.check_output(['git','show',f'{candidate}:.superpowers/sdd/2026-11-08-shared-search-integration/{name}'])
 assert hashlib.sha256(blob).hexdigest()==digest,name
print('Exact reviewed/corrected77b69f9: CI42433316774 SUCCESS; immutable local gate hashes and all job steps verified. Independent local Phase11 changes receive no acceptance credit.')
