"""Opt-in real AI full-paper E2E; only talks to isolated localhost:18511.
Run after starting the isolated server described in .build-check/paper-study-live.
Persists checkpoints and AI drafts; test approvals do NOT constitute expert review.
"""
import argparse, concurrent.futures, copy, json, re, threading, time, traceback, unicodedata
from pathlib import Path
import httpx, pymupdf
ROOT=Path(__file__).resolve().parent.parent
WORK=ROOT/'.build-check/paper-study-live'; WORK.mkdir(parents=True,exist_ok=True)
SOURCES=ROOT/'.build-check/paper-study-sources'; BASE='http://127.0.0.1:18511'
EMAIL='paper-live@conceptlab.invalid'; PASSWORD='isolated-paper-study-only'
lock=threading.Lock()
def write(path,obj):
 p=path.with_suffix('.tmp'); p.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8'); p.replace(path)
def checkpoint(code):
 p=WORK/(code+'.json'); return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'code':code,'stages':{},'failures':[]}
def save(data):
 with lock: write(WORK/(data['code']+'.json'),data)
def ok(r):
 if r.status_code not in (200,201): raise RuntimeError(f'HTTP {r.status_code}: {r.text[:1200]}')
 return r.json()
def refs(n):
 if isinstance(n,dict):
  if 'located' in n and 'source_id' in n: yield n
  for v in n.values(): yield from refs(v)
 elif isinstance(n,list):
  for v in n: yield from refs(v)
def do(c,data,name,method,url,**kwargs):
 start=time.perf_counter(); r=c.request(method,BASE+url,timeout=480,**kwargs); sec=round(time.perf_counter()-start,2)
 data['stages'][name]={'http':r.status_code,'seconds':sec}; save(data); print(data['code'],name,r.status_code,sec,flush=True)
 return ok(r)
def run(p,cookies,csrf,skip_visual,analysis_only):
 code=p['share_code']; data=checkpoint(code)
 if data.get('completed'): print(code,'already completed',flush=True); return data
 c=httpx.Client(cookies=cookies,headers={'X-CSRF-Token':csrf},timeout=480,trust_env=False)
 anon=httpx.Client(timeout=120,trust_env=False)
 try:
  pdf=SOURCES/(code+'.pdf')
  with pymupdf.open(pdf) as doc:
   pages=len(doc); assert 1<=pages<=30, f'{pages} pages exceeds 30 page analysis limit'; page_text=[x.get_text() for x in doc]
  data['pdf_pages']=pages; data['pdf_bytes']=pdf.stat().st_size; data['source_url']=p['pdf_url']; data['doi']=p['doi']; data['domain']=p['domain']; save(data)
  if 'lab_id' not in data:
   subject={'agriculture':'agriculture','physical_chemistry':'chemistry','semiconductors':'engineering'}[p['domain']]
   lab=do(c,data,'create','POST','/api/labs',json={'space':'paper2explorer','title':p['title'][:160],'topic':p['title'][:200],'subject':subject,'grade':'university','language':'en','goal':'explore_paper','level':'detailed'})
   data['lab_id']=lab['id']; save(data)
  labid=data['lab_id']
  if 'source_id' not in data:
   with pdf.open('rb') as f: source=do(c,data,'upload','POST',f'/api/labs/{labid}/sources',files={'file':(pdf.name,f,'application/pdf')})
   data['source_id']=source['id']; save(data)
  sid=data['source_id']
  if not (WORK/(code+'.analysis.json')).exists():
   analysis=do(c,data,'paper_structure','POST',f'/api/labs/{labid}/ai/paper-structure',json={'source_id':sid})['analysis']; write(WORK/(code+'.analysis.json'),analysis)
  else: analysis=json.loads((WORK/(code+'.analysis.json')).read_text(encoding='utf-8'))
  paper=analysis['paper']; assert paper['title'] and paper['summary']; citations=list(refs(paper)); assert citations, 'AI provided no references'
  assert all(r['source_id']==sid for r in citations); assert all(not r.get('page') or 1<=r['page']<=pages for r in citations)
  loc={x:sum(r['located']==x for r in citations) for x in ('exact','approximate','none')}; assert loc['exact']+loc['approximate']>0, 'no located references'
  def norm(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC',s).casefold()).strip()
  checked=[r for r in citations if r['located']=='exact' and r.get('page') and r.get('quote')]
  independently_found=sum(norm(r['quote']) in norm(page_text[r['page']-1]) for r in checked)
  data['analysis_review']={'independent_exact_quote_checks':len(checked),'independent_exact_quote_matches':independently_found,'model':analysis['model'],'title':paper['title'],'citation_count':len(citations),'located':loc,'sections':len(paper['sections']),'equations':len(paper['equations']),'figures':len(paper['figures']),'warnings':paper['warnings'],'limitations':'Automated citation checks only; scientific expert review remains necessary.'}; save(data)
  if analysis_only:
   print(code,'analysis checkpointed',flush=True); return data
  genpath=WORK/(code+'.generated.json')
  if not genpath.exists():
   payload={'block_types':['steps','flow','text','quiz']}
   if not skip_visual: payload['visual3d']=p['visual_kind']
   response=do(c,data,'generate','POST',f'/api/labs/{labid}/ai/generate',json=payload); write(genpath,response)
  else: response=json.loads(genpath.read_text(encoding='utf-8'))
  lab=response['lab']; blocks=lab['spec']['blocks']; types={b['type'] for b in blocks}; assert {'steps','flow','text','quiz'}<=types, f'incomplete blocks: {types}; warnings={response.get("warnings")}'
  if not skip_visual: assert any(b.get('visual3d')==p['visual_kind'] for b in blocks), 'missing requested 3D'
  data['generation']={'types':[b['type'] for b in blocks],'visuals':[b.get('visual3d') for b in blocks if b.get('visual3d')], 'warnings':response.get('warnings',[])}; save(data)
  spec=copy.deepcopy(lab['spec'])
  for b in spec['blocks']:
   b['confirmed']=True
   if b['type']=='steps': b['sequence_confirmed']=True
   for q in b.get('questions',[]): q['approved']=True
  latest=ok(c.get(BASE+f'/api/labs/{labid}')); lab=do(c,data,'test_only_confirm','PATCH',f'/api/labs/{labid}',json={'version':latest['version'],'spec':spec}); data['test_only_confirmation']=True; save(data)
  validation=do(c,data,'validate','POST',f'/api/labs/{labid}/validate'); data['validation']=validation; save(data); assert not [x for x in validation['checks'] if x['status']=='fail'], 'validation failed'
  if 'published_code' not in data:
   data['published_code']=do(c,data,'publish','POST',f'/api/labs/{labid}/publish',json={'visibility':'link','allow_tutor':False})['share_code']; save(data)
  sc=data['published_code']; shared=do(anon,data,'anonymous_read','GET',f'/api/share/{sc}'); assert any(x['id']==sid for x in shared['sources']); assert any(b['type']=='quiz' for b in shared['spec']['blocks'])
  if not skip_visual: assert any(b.get('visual3d')==p['visual_kind'] for b in shared['spec']['blocks'])
  file=anon.get(BASE+f'/api/share/{sc}/sources/{sid}/file'); assert file.status_code==200 and file.content[:5]==b'%PDF-'; data['anonymous_source_bytes']=len(file.content)
  qb=next(b for b in spec['blocks'] if b['type']=='quiz'); assert qb['questions']; q=qb['questions'][0]
  result=do(anon,data,'quiz','POST',f'/api/share/{sc}/quiz-attempts',json={'block_id':qb['id'],'phase':'practice','answers':[{'question_id':q['id'],'answer':0}]}); assert result['total']>0
  data['quiz_result']={'score':result['score'],'total':result['total']}; data['completed']=True; save(data)
 except Exception as e:
  data['failures'].append({'stage':next(reversed(data['stages']),None),'error':f'{type(e).__name__}: {e}'}); save(data); print(code,'FAILED',type(e).__name__,str(e)[:1000],flush=True)
 finally: c.close(); anon.close()
 return data
if __name__=='__main__':
 ap=argparse.ArgumentParser(); ap.add_argument('--live',action='store_true'); ap.add_argument('--skip-visual',action='store_true'); ap.add_argument('--analysis-only',action='store_true'); ap.add_argument('--codes',nargs='*'); ap.add_argument('--workers',type=int,default=2); args=ap.parse_args()
 if not args.live: ap.error('explicit --live required: this makes real AI calls against isolated server')
 assert 1<=args.workers<=2
 papers=json.loads((ROOT/'shared/paper_study_batch.json').read_text(encoding='utf-8')); assert len(papers)==10
 if args.codes: papers=[p for p in papers if p['share_code'] in args.codes]
 client=httpx.Client(timeout=120,trust_env=False)
 me=ok(client.get(BASE+'/api/auth/me')); assert me['ai']['configured'], 'real AI not configured'
 r=client.post(BASE+'/api/auth/register',json={'email':EMAIL,'password':PASSWORD,'name':'Isolated paper test','role':'researcher','locale':'en'})
 if r.status_code==409: r=client.post(BASE+'/api/auth/login',json={'email':EMAIL,'password':PASSWORD})
 csrf=ok(r)['csrf_token']; cookies=client.cookies
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool: out=list(pool.map(lambda p:run(p,cookies,csrf,args.skip_visual,args.analysis_only),papers))
 write(WORK/'report.json',{'only_isolated_test_server':BASE,'papers':out,'completed':sum(bool(x.get('completed')) for x in out),'expert_reviewed':False})
 print('COMPLETED',sum(bool(x.get('completed')) for x in out),'/',len(out),flush=True)
