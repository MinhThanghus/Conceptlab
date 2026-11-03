"""Independently audit located references in live paper drafts against original PDF text."""
import json, re, unicodedata
from pathlib import Path
import pymupdf
from paper_study_batch import refs, WORK, SOURCES

def norm(s): return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s).casefold()).strip()
results=[]
for file in sorted(WORK.glob('*.analysis.json')):
 code=file.name.split('.')[0]; analysis=json.loads(file.read_text(encoding='utf-8')); citations=list(refs(analysis['paper']))
 full=partial=unmatched=none=substring=0; examples=[]
 with pymupdf.open(SOURCES/(code+'.pdf')) as doc:
  for r in citations:
   if r.get('located')=='none' or not r.get('page') or not r.get('quote'): none+=1; continue
   page=doc[r['page']-1]; quote=r['quote']; words=quote.split()
   if norm(quote) in norm(page.get_text()): substring+=1
   if page.search_for(quote): full+=1; continue
   found=next((n for n in (12,8,5,4) if len(words)>n and page.search_for(' '.join(words[:n]))),None)
   if found:
    partial+=1
    if len(examples)<3: examples.append({'page':r['page'],'quote':quote,'matched_prefix':' '.join(words[:found]),'original_label':r['located']})
   else: unmatched+=1
 results.append({'code':code,'citations':len(citations),'full_search_matches':full,'full_normalized_substring_matches':substring,'prefix_only_matches':partial,'unmatched_located':unmatched,'unlocated_or_missing_quote':none,'partial_examples':examples})
 print(code,'full',full,'prefix only',partial,'unlocated',none,flush=True)
(WORK/'independent-citation-audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
