"""Check five published chip lessons open their intended 3D teaching mode without editing data."""
from playwright.sync_api import sync_playwright
CASES={
 'CHNASH':('Transistor','Nanosheets'),
 'CHNWRE':('Transistor','Vertical nanowire'),
 'CHCMPS':('CMOS inverter',None),
 'CHMSTE':('Transistor','Planar'),
 'CHMEMS':('Resistive memory',None),
}
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for code,(mode,geometry) in CASES.items():
   context=browser.new_context(viewport={'width':1440,'height':900})
   context.add_init_script("localStorage.setItem('cl.lang','en')")
   page=context.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
   page.goto('http://127.0.0.1:5300/s/'+code,wait_until='networkidle')
   page.get_by_role('button',name='Explore the idea in 3D',exact=False).click()
   lab=page.locator('.semiconductor')
   lab.wait_for(state='visible',timeout=15000)
   lab.locator('.semiconductor-host canvas').wait_for(state='visible',timeout=15000)
   active=lab.locator('.semiconductor-modes button[aria-pressed=true]').inner_text()
   assert active==mode,(code,active,mode)
   if geometry:
    actual=lab.get_by_role('group',name='Device geometry').locator('button[aria-pressed=true]').inner_text()
    assert actual==geometry,(code,actual,geometry)
   assert not errors,(code,errors)
   print('PASS',code,mode,geometry,flush=True)
   context.close()
 finally:
  browser.close()
