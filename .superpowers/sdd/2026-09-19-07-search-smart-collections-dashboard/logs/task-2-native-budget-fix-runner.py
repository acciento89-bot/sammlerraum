from pathlib import Path
import os,subprocess,json,time,hashlib
root=Path.cwd();logs=root/'.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/logs'
frozen=json.loads((logs/'task-2-native-budget-fix-source.json').read_text())['currentOwnedSha256']
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in frozen.items())
workflow=(root/'.github/workflows/ci.yml').read_text().split('RUN_DATABASE_INTEGRATION=1 pnpm vitest run --no-file-parallelism',1)[1].split('      - name:',1)[0]
allowlist=workflow.split();assert len(allowlist)==46
prefix=['npm','exec','--yes','--package=node@24.19.0','--package=pnpm@10.17.1','--','pnpm']
runs=[]
for label,args,native in [('native',['vitest','run','--no-file-parallelism',*allowlist],True),('types',['typecheck'],False),('lint',['lint'],False),('owned-format',['exec','prettier','--check',*frozen.keys()],False)]:
 env=os.environ.copy();env['RUN_DATABASE_INTEGRATION']='1' if native else '0'
 for k in ['SEARCH_BUDGET_DATABASE_URL','SEARCH_BUDGET_EVIDENCE_DIR','SEARCH_BUDGET_PREFLIGHT']:env.pop(k,None)
 start=time.time();command=prefix+args;log=logs/f'task-2-native-budget-fix-{label}.log'
 with log.open('w') as out:r=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
 runs.append({'label':label,'command':command,'exitCode':r.returncode,'durationSeconds':round(time.time()-start,3),'log':log.name})
 (logs/'task-2-native-budget-fix-runs.json').write_text(json.dumps(runs,indent=2)+'\n')
 print(label,r.returncode,runs[-1]['durationSeconds'],flush=True)
 if r.returncode:raise SystemExit(r.returncode)
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in frozen.items())
