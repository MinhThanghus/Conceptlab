from pathlib import Path
import concurrent.futures, hashlib, json, os, re, time
import fitz, httpx
ROOT=Path(__file__).resolve().parent.parent
MANIFEST=ROOT/'shared/paper_study_batch.json'
OUT=ROOT/'.build-check/paper-study-sources'
OUT.mkdir(parents=True,exist_ok=True)
def run(p):
 code=p['share_code']; pmc=re.search(r'PMC\d+',p['pdf_url']).group(); dest=OUT/(code+'.pdf'); last=''
 for ver in range(1,5):
  url=f'https://pmc-oa-opendata.s3.amazonaws.com/{pmc}.{ver}/{pmc}.{ver}.pdf'
  try:
   if not dest.exists():
    tmp=dest.with_suffix('.part')
    with httpx.stream('GET',url,timeout=httpx.Timeout(180,connect=20),follow_redirects=True) as r:
     if r.status_code!=200:
      last=f'HTTP {r.status_code}'; continue
     with tmp.open('wb') as f:
      for chunk in r.iter_bytes(65536): f.write(chunk)
    if tmp.read_bytes()[:5]!=b'%PDF-':
     tmp.unlink(missing_ok=True); last='not PDF'; continue
    os.replace(tmp,dest)
   with fitz.open(dest) as pdf:
    result={'code':code,'pmcid':pmc,'url':url,'bytes':dest.stat().st_size,'pages':len(pdf),'first_page_chars':len(pdf[0].get_text()),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
   print(json.dumps(result),flush=True); return result
  except Exception as e:
   last=f'{type(e).__name__}: {e}'
 print(json.dumps({'code':code,'error':last}),flush=True); return {'code':code,'error':last}
papers=json.loads(MANIFEST.read_text(encoding='utf-8'))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results=list(pool.map(run,papers))
(OUT/'pdf-download-report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
