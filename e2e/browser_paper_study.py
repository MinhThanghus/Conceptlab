"""Browser smoke test for a real AI-generated isolated semiconductor lesson."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path('.build-check/paper-study-live'); state=json.loads((OUT/'CHNASH.json').read_text(encoding='utf-8'))
url='http://127.0.0.1:18512/s/'+state['published_code']; results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for mode,width in [('desktop-3d',1440),('mobile-3d',375),('mobile-fallback',375)]:
  ctx=browser.new_context(viewport={'width':width,'height':900}); ctx.add_init_script("localStorage.setItem('cl.lang','en')")
  if mode=='mobile-fallback': ctx.add_init_script("const get=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/i.test(t)?null:get.call(this,t,...a)};")
  page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url,wait_until='domcontentloaded')
  if width<600: page.get_by_role('button',name='Lesson contents').click()
  page.get_by_text('Teacher Note: Stress Bending and Multi-Step Release of Si Nanosheets',exact=True).first.click()
  scene=page.locator('.semiconductor'); scene.wait_for(timeout=30000)
  if mode.endswith('3d'): scene.locator('canvas').wait_for(timeout=30000)
  else: scene.locator('.semiconductor-fallback-note').wait_for(timeout=30000)
  scene.get_by_role('button',name='Nanosheets',exact=True).click(); scene.get_by_role('button',name='Gate high',exact=True).click()
  assert scene.get_by_role('button',name='Nanosheets',exact=True).get_attribute('aria-pressed')=='true'
  assert scene.get_by_role('button',name='Gate high',exact=True).get_attribute('aria-pressed')=='true'
  scene.scroll_into_view_if_needed(); page.screenshot(path=str(OUT/(mode+'-chip.png')))
  overflow=page.evaluate('document.documentElement.scrollWidth')-width
  assert overflow<=0,f'overflow {overflow}px'; assert not errors,errors
  results.append({'mode':mode,'width':width,'canvas':scene.locator('canvas').count(),'fallback':scene.locator('.semiconductor-fallback-note').count(),'overflow':overflow,'page_errors':errors})
  print(mode,'OK',flush=True); ctx.close()
 browser.close()
(OUT/'browser-chip-report.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
