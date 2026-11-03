from pathlib import Path
from uuid import uuid4
from playwright.sync_api import sync_playwright
root=Path('frontend')
name='__flow_slide_'+uuid4().hex+'.html'
path=root/name
html='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root" style="max-width:1100px;margin:auto;padding:1rem"></div><script type="module">
import '@fontsource-variable/lexend/wght.css'; import '/src/styles/tokens.css'; import '/src/styles/base.css'; import '/src/styles/components.css'; import '/src/styles/layout.css';
import React from 'react'; import {createRoot} from 'react-dom/client';
import {I18nProvider,ensureDict} from '/src/i18n/index.jsx';
import {BlockEnvProvider} from '/src/features/blocks/BlockEnv.jsx';
import FlowSlide from '/src/features/blocks/flow/FlowSlide.jsx';
await ensureDict('en'); const lab=await fetch('/api/share/CHNWRE?lang=en').then(r=>r.json());
const block=lab.spec.blocks.find(b=>b.type==='flow');
const q=new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,
 React.createElement(BlockEnvProvider,{value:{shareCode:'CHNWRE',visualContext:{visual3d:'semiconductor_chip'},sourcesAtTop:true,sourceById:(id)=>lab.sources.find(s=>s.id===id)}},
 React.createElement(FlowSlide,{block,kind:q.get('kind')||'flow-node',itemId:q.get('id')||'n1',nodeIds:block.nodes.map(n=>n.id),edgeIds:block.edges.map(e=>e.id),onSelect:(item)=>{document.body.dataset.selected=JSON.stringify(item)}}))));
</script></body></html>'''
path.write_text(html,encoding='utf8')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  try:
   for width in [1440,375]:
    for kind,item in [('flow-group',''),('flow-overview',''),('flow-node','n1'),('flow-edge','e1')]:
     page=browser.new_page(viewport={'width':width,'height':900 if width==1440 else 812})
     page.add_init_script("localStorage.setItem('cl.lang','en')")
     errors=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(f'http://127.0.0.1:5300/{name}?kind={kind}&id={item}',wait_until='networkidle')
     component=page.locator('.flow-slide')
     component.wait_for()
     page.wait_for_timeout(150)
     out=Path('.build-check/flow-slide')
     out.mkdir(parents=True,exist_ok=True)
     component.screenshot(path=str(out/f'{kind}-{width}.png'))
     dims=page.evaluate('() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]')
     assert dims[1]<=dims[0]+1,(kind,width,dims)
     assert not errors,(kind,width,errors)
     if kind=='flow-group':
      assert component.locator('.flow-group-nodes li').count()==4
      component.locator('.flow-group-nodes button').nth(1).click()
      assert component.locator('.flow-group-nodes button').nth(1).get_attribute('aria-pressed')=='true'
     if kind=='flow-overview':
      component.get_by_role('button',name='Make the channel',exact=True).click()
      assert '"id":"n1"' in page.locator('body').get_attribute('data-selected')
     print('PASS',kind,width,flush=True)
     page.close()
  finally: browser.close()
finally:
 if path.is_file() and path.read_text(encoding='utf8')==html: path.unlink()
