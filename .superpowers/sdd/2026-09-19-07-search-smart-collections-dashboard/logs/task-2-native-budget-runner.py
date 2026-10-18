from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
import os,subprocess,json,time,hashlib
root=Path.cwd();logs=root/'.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/logs'
u=urlsplit(os.environ['DATABASE_URL']);assert u.hostname in ['localhost','127.0.0.1','::1']
env=os.environ.copy();env['DATABASE_URL']=urlunsplit(u._replace(path='/sammlerraum_budget_20261018_test'));env['SEARCH_BUDGET_EVIDENCE_DIR']=str(logs)
files=['packages/domain/src/search/search-retained-integrity.integration.test.ts','packages/domain/src/search/search-native-budget-diagnostic.ts']
patch=subprocess.check_output(['git','diff','--',files[0]])+subprocess.run(['git','diff','--no-index','/dev/null',files[1]],capture_output=True).stdout
(logs/'task-2-native-budget-observation.patch').write_bytes(patch)
(logs/'task-2-native-budget-source.json').write_text(json.dumps({'base':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'temporarySource':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files},'baseRetainedHash':hashlib.sha256(subprocess.check_output(['git','show','HEAD:'+files[0]])).hexdigest(),'sequencer':hashlib.sha256((logs/'task-2-native-budget-sequencer.ts').read_bytes()).hexdigest()},indent=2)+'\n')
order=json.loads((logs/'task-2-native-budget-order.json').read_text())
workflow=(root/'.github/workflows/ci.yml').read_text().split('RUN_DATABASE_INTEGRATION=1 pnpm vitest run --no-file-parallelism',1)[1].split('      - name:',1)[0]
allowlist=workflow.split();assert set(allowlist)==set(order) and len(allowlist)==46
prefix=['npm','exec','--yes','--package=node@24.19.0','--package=pnpm@10.17.1','--','pnpm']
commands=[('regular',prefix+['test'],'0'),('full-native',prefix+['vitest','run','--no-file-parallelism','--sequence.sequencer='+str(logs/'task-2-native-budget-sequencer.ts'),*allowlist],'1')]
results=[]
for label,command,enabled in commands:
 env['RUN_DATABASE_INTEGRATION']=enabled;start=time.time()
 with (logs/f'task-2-native-budget-{label}.log').open('w') as out:r=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
 results.append({'label':label,'command':command,'database':'sammlerraum_budget_20261018_test','RUN_DATABASE_INTEGRATION':enabled,'exitCode':r.returncode,'durationSeconds':round(time.time()-start,3)})
 (logs/'task-2-native-budget-runs.json').write_text(json.dumps(results,indent=2)+'\n')
 print(label,'exit',r.returncode,'seconds',results[-1]['durationSeconds'],flush=True)
 if r.returncode and label=='regular':break
