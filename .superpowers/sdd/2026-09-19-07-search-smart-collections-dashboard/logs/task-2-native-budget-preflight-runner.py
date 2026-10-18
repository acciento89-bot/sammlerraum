from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
import os,subprocess,json,time
root=Path.cwd();logs=root/'.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/logs';u=urlsplit(os.environ['DATABASE_URL'])
env=os.environ.copy();env['SEARCH_BUDGET_DATABASE_URL']=urlunsplit(u._replace(path='/sammlerraum_budget_20261018_test'));env['DATABASE_URL']=env['SEARCH_BUDGET_DATABASE_URL'];env['SEARCH_BUDGET_EVIDENCE_DIR']=str(logs);env['RUN_DATABASE_INTEGRATION']='1';env['SEARCH_BUDGET_PREFLIGHT']='1'
command=['npm','exec','--yes','--package=node@24.19.0','--package=pnpm@10.17.1','--','pnpm','vitest','run','--no-file-parallelism','--config='+str(logs/'task-2-native-budget-vitest.config.ts'),'packages/domain/src/search/search-native-budget-preflight.test.ts']
start=time.time()
with (logs/'task-2-native-budget-preflight.log').open('w') as out:r=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
results=json.loads((logs/'task-2-native-budget-runs.json').read_text());results.append({'label':'actual-db-preflight','command':command,'database':'sammlerraum_budget_20261018_test','exitCode':r.returncode,'durationSeconds':round(time.time()-start,3),'log':'task-2-native-budget-preflight.log'})
(logs/'task-2-native-budget-runs.json').write_text(json.dumps(results,indent=2)+'\n');print('preflight',r.returncode);assert r.returncode==0
