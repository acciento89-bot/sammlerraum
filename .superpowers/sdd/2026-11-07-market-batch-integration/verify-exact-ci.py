import json, subprocess
from pathlib import Path
w=Path(__file__).resolve().parent
run=json.loads(subprocess.check_output(['gh','api','repos/acciento89-bot/sammlerraum/actions/runs/42393762009'],text=True))
assert run['head_sha']=='617aa5cbea0584905563a731ff0c2d1c371f164c'
assert run['status']=='completed' and run['conclusion']=='success'
jobs=json.loads(subprocess.check_output(['gh','api','repos/acciento89-bot/sammlerraum/actions/runs/42393762009/jobs'],text=True))['jobs']
assert jobs and all(j['conclusion']=='success' for j in jobs)
assert any(s['name']=='Run real database health and pg-boss singleton integration tests' and s['conclusion']=='success' for j in jobs for s in j['steps'])
safe={k:run[k] for k in ['id','head_sha','status','conclusion','event','created_at','updated_at']}
(w/'task-5-exact-ci-success.json').write_text(json.dumps(safe,indent=2)+'\n')
(w/'task-5-exact-ci-success-jobs.json').write_text(json.dumps([{'id':j['id'],'name':j['name'],'conclusion':j['conclusion'],'steps':[{'name':s['name'],'status':s['status'],'conclusion':s['conclusion']} for s in j['steps']]} for j in jobs],indent=2)+'\n')
print('Exact market candidate617aa5c run42393762009 completedSUCCESS; native and all remaining job gates passed.')
