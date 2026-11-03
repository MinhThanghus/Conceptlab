"""Correct legacy citation locations in isolated live-test labs without rerunning AI.
Only intended for http://127.0.0.1:18511 from PAPER_STUDY_LIVE.md.
"""
import copy, json, re, unicodedata
import httpx, pymupdf
from paper_study_batch import BASE, WORK, SOURCES, EMAIL, PASSWORD, ok, write, refs
c=httpx.Client(timeout=180,trust_env=False)
auth=ok(c.post(BASE+'/api/auth/login',json={'email':EMAIL,'password':PASSWORD})); c.headers['X-CSRF-Token']=auth['csrf_token']
example=json.loads((WORK/'AGFARM.json').read_text(encoding='utf-8'))
check=ok(c.post(BASE+f"/api/sources/{example['source_id']}/locate",json={'page':4,'quote':'is calculated based on Eq. (3), accounting for CH4 and N2O emissions'}))
assert check['located']=='approximate',f'backend is not running updated locator: {check}'
print('locator regression: partial → approximate',flush=True)
summary=[]
manifest=json.loads((WORK.parent.parent/'shared/paper_study_batch.json').read_text(encoding='utf-8'))
codes={p['share_code'] for p in manifest}
for f in sorted(WORK.glob('*.json')):
 if f.name.count('.')!=1 or f.stem not in codes: continue
 state=json.loads(f.read_text(encoding='utf-8'))
 if not state.get('completed'): continue
 code=state['code']; labid=state['lab_id']; sid=state['source_id']; lab=ok(c.get(BASE+f'/api/labs/{labid}'))
 before={'analysis':lab['analysis'],'spec':lab['spec']}; beforepath=WORK/(code+'.before-locator-fix.json')
 if not beforepath.exists(): write(beforepath,before)
 fixed=copy.deepcopy(before); cache={}; changes={}; nrefs=0
 with pymupdf.open(SOURCES/(code+'.pdf')) as doc:
  for ref in refs(fixed):
   if ref.get('source_id')!=sid or ref.get('located')!='exact' or not ref.get('quote'): continue
   nrefs+=1; quote=ref['quote']; key=(quote,ref.get('page'))
   if key not in cache:
    located=ok(c.post(BASE+f'/api/sources/{sid}/locate',json={'quote':quote,'page':ref.get('page')}))
    trimmed=quote
    if located['located']=='approximate':
     cleaned=re.sub(r'\s+',' ',unicodedata.normalize('NFC',quote).replace('\u00ad','').replace('ﬁ','fi').replace('ﬂ','fl')).strip(); words=cleaned.split(' ')
     pg=doc[located['page']-1]
     trimmed=next((' '.join(words[:n]) for n in (12,8,5,4) if len(words)>n and pg.search_for(' '.join(words[:n]))),None)
     assert trimmed, f'cannot reproduce matched prefix {code} page {located["page"]}'
    elif located['located']=='none': trimmed=None
    cache[key]=(located,trimmed)
   location,trimmed=cache[key]
   if location['located']!='exact':
    changes[location['located']]=changes.get(location['located'],0)+1
    ref['located']=location['located']; ref['quote']=trimmed; ref['page']=location.get('page'); ref['bbox']=location.get('bbox')
  payload={'version':lab['version'],'analysis':fixed['analysis'],'spec':fixed['spec']}
  if state['domain']=='agriculture': payload['subject']='agriculture'
  ok(c.patch(BASE+f'/api/labs/{labid}',json=payload))
  after=ok(c.get(BASE+f'/api/labs/{labid}')); write(WORK/(code+'.after-locator-fix.json'),{'analysis':after['analysis'],'spec':after['spec']})
  checks=ok(c.post(BASE+f'/api/labs/{labid}/validate'))['checks']; assert not [x for x in checks if x['status']=='fail'], checks
  share=ok(c.post(BASE+f'/api/labs/{labid}/publish',json={'visibility':'link','allow_tutor':False})); assert share['share_code']==state['published_code']
  result={'code':code,'unique_quotes_checked':len(cache),'original_exact_refs_checked':nrefs,'downgraded':changes,'share_code':share['share_code']}; summary.append(result); print(json.dumps(result),flush=True)
write(WORK/'locator-fix-report.json',summary)
print('updated',len(summary),'isolated lessons; original AI drafts retained',flush=True)
