import json, subprocess
from pathlib import Path
w=Path(__file__).resolve().parent
run=json.loads(subprocess.check_output(['gh','api','repos/acciento89-bot/sammlerraum/actions/runs/42424946639'],text=True))
assert run['head_sha']=='616cc29451129e3d8cb1c3f4a505ad01a9a9b0a2'
assert run['status']=='completed' and run['conclusion']=='success'
jobs=json.loads(subprocess.check_output(['gh','api','repos/acciento89-bot/sammlerraum/actions/runs/42424946639/jobs'],text=True))['jobs']
assert jobs and all(j['conclusion']=='success' for j in jobs)
assert any(s['name']=='Run real database health and pg-boss singleton integration tests' and s['conclusion']=='success' for j in jobs for s in j['steps'])
(w/'task-3-exact-ci-success.json').write_text(json.dumps({k:run[k] for k in ['id','head_sha','status','conclusion','event','created_at','updated_at']},indent=2)+'\n')
(w/'task-3-exact-ci-success-jobs.json').write_text(json.dumps([{'id':j['id'],'name':j['name'],'conclusion':j['conclusion'],'steps':[{'name':s['name'],'status':s['status'],'conclusion':s['conclusion']} for s in j['steps']]} for j in jobs],indent=2)+'\n')
print('Exact duplicate candidate616cc29 run42424946639 completedSUCCESS, including native and all compiled browser gates. This receipt does not cover later unpublished shared-search changes.')
