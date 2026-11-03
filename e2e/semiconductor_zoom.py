"""Verify the real semiconductor 3D camera and linked schematic."""
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path('.build-check/semiconductor-zoom')
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for width,lang in [(1440,'en'),(375,'vi')]:
   ctx=b.new_context(viewport={'width':width,'height':900 if width==1440 else 812},is_mobile=width==375,has_touch=width==375)
   ctx.add_init_script(f"localStorage.setItem('cl.lang','{lang}')")
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
   page.goto('http://127.0.0.1:5300/learn/3d?model=semiconductor_chip',wait_until='networkidle')
   lab=page.locator('.semiconductor')
   lab.locator('.semiconductor-modes button').nth(1).click()
   canvas=lab.locator('.semiconductor-host canvas')
   canvas.wait_for(state='visible')
   controls=lab.locator('.semiconductor-view-controls')
   output=controls.locator('output')
   stage=lab.locator('.semiconductor-stage')
   page.wait_for_timeout(300)
   initial=stage.screenshot(path=str(OUT/f'cmos-{width}-{lang}.png'))
   assert lab.locator('.semiconductor-circuit').is_visible()
   rects=lab.locator('.semiconductor-circuit .part-input, .semiconductor-circuit .part-output').evaluate_all('(els) => els.map(el => {const r=el.getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]})')
   a,c=rects
   assert a[1]<=c[0] or c[1]<=a[0] or a[3]<=c[2] or c[3]<=a[2], f'Schematic labels overlap: {rects}'
   assert lab.locator('.semiconductor-table').is_visible()
   assert lab.locator('.semiconductor-annotations button').count()==6
   for badge in lab.locator('.semiconductor-annotations button').all():
    assert float(badge.evaluate("el=>parseFloat(getComputedStyle(el).fontSize)"))>=13
   controls.get_by_role('button',name='Zoom in' if lang=='en' else 'Phóng to').click()
   assert output.inner_text()=='120%'
   assert stage.screenshot()!=initial,'Camera zoom button does not affect scene'
   controls.get_by_role('button',name='Top view' if lang=='en' else 'Nhìn từ trên').click()
   page.wait_for_timeout(100)
   assert stage.screenshot()!=initial,'Top view did not change camera orientation'
   controls.get_by_role('button',name='Isometric view' if lang=='en' else 'Nhìn phối cảnh').click()
   controls.get_by_role('button',name='Reset view' if lang=='en' else 'Đặt lại góc nhìn').click()
   assert output.inner_text()=='100%'
   canvas.scroll_into_view_if_needed()
   if width==1440:
    bounds=canvas.bounding_box()
    page.mouse.move(bounds['x']+10,bounds['y']+10)
    page.mouse.wheel(0,-300)
    page.wait_for_timeout(200)
    assert output.inner_text()!='100%','Mouse wheel zoom failed'
   else:
    cdp=ctx.new_cdp_session(page)
    bounds=canvas.bounding_box()
    cdp.send('Input.synthesizePinchGesture',{'x':bounds['x']+bounds['width']/2,'y':bounds['y']+bounds['height']/2,'scaleFactor':1.5,'relativeSpeed':600,'gestureSourceType':'touch'})
    page.wait_for_timeout(300)
    assert output.inner_text()!='100%','Two-finger pinch zoom failed'
   controls.get_by_role('button',name='Reset view' if lang=='en' else 'Đặt lại góc nhìn').click()
   assert output.inner_text()=='100%'
   stage.focus()
   page.keyboard.press('+')
   assert output.inner_text()=='120%', 'Keyboard camera zoom failed'
   controls.get_by_role('button',name='Reset view' if lang=='en' else 'Đặt lại góc nhìn').click()
   pred=lab.locator('.semiconductor-predict .semiconductor-input').nth(1)
   pred.locator('button').nth(1).click(); pred.locator('button').nth(2).click()
   assert lab.locator('.semiconductor-circuit-wire.is-p').count()==2
   assert lab.locator('.semiconductor-circuit-wire.is-n').count()==0
   lab.locator('.semiconductor-circuit .part-pmos').click()
   assert lab.locator('.semiconductor-circuit p').inner_text()
   lab.screenshot(path=str(OUT/f'full-{width}-{lang}.png'))
   dims=page.evaluate("() => [document.documentElement.scrollWidth,document.documentElement.clientWidth]")
   assert dims[0]<=dims[1]+1,(width,dims)
   assert not errors,errors
   print('PASS',width,lang,flush=True)
   ctx.close()
 finally: b.close()
