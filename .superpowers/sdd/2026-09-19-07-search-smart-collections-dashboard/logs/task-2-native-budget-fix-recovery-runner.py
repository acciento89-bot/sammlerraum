from pathlib import Path
import os,subprocess,json,time,hashlib
root=Path.cwd();logs=root/'.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/logs';frozen=json.loads((logs/'task-2-native-budget-fix-source.json').read_text())['currentOwnedSha256']
prefix=['npm','exec','--yes','--package=node@24.19.0','--package=pnpm@10.17.1','--','pnpm']
runs=[]
for label,args in [('typegen',['--filter','@sammlerraum/web','exec','next','typegen']),('types-recovered',['typecheck']),('lint',['lint']),('owned-format',['exec','prettier','--check',*frozen.keys()])]:
 start=time.time();command=prefix+args;log=logs/f'task-2-native-budget-fix-{label}.log'
 with log.open('w') as out:r=subprocess.run(command,stdout=out,stderr=subprocess.STDOUT)
 runs.append({'label':label,'command':command,'exitCode':r.returncode,'durationSeconds':round(time.time()-start,3),'log':log.name})
 (logs/'task-2-native-budget-fix-recovery-runs.json').write_text(json.dumps(runs,indent=2)+'\n');print(label,r.returncode,runs[-1]['durationSeconds'],flush=True)
 if r.returncode:raise SystemExit(r.returncode)
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in frozen.items())
