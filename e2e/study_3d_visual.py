"""Public-route read-only visual and interaction checks for three study models."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.build-check' / 'study-3d-visual'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:5300'
KINDS = ['agriculture_field', 'reaction_diffusion', 'porous_adsorption']

def exercise(browser, kind, width, lang, fallback):
    context = browser.new_context(viewport={'width':width,'height':900 if width > 500 else 812})
    context.add_init_script(f"localStorage.setItem('cl.lang','{lang}')")
    if fallback:
        context.add_init_script("""(() => { const original=HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext=function(kind,...args) {
                return ['webgl','webgl2','experimental-webgl'].includes(kind) ? null : original.call(this,kind,...args)
            } })();""")
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda e: errors.append(e.text) if e.type=='error' else None)
    page.goto(f'{BASE}/learn/3d?model={kind}',wait_until='networkidle')
    lab=page.locator('.study-explorer')
    lab.wait_for()
    frame=lab.locator('.study-linked') if fallback else lab.locator('.study-stage')
    if not fallback:
        canvas=lab.locator('.study-host canvas')
        canvas.wait_for(state='visible',timeout=20000)
        canvas.evaluate("""c=>{ const gl=c.getContext('webgl2') || c.getContext('webgl'); if(!gl) throw Error('WebGL context missing') }""")
        page.wait_for_timeout(200)
    marker=f'{kind}-{width}-{lang}'+('-2d' if fallback else '')
    def shot(name):
        page.wait_for_timeout(150)
        return frame.screenshot(path=str(OUT/f'{marker}-{name}.png'),animations='disabled')
    first=shot('initial')
    controls=lab.locator('.study-controls')
    if kind=='agriculture_field':
        selects=controls.locator('select')
        selects.nth(0).select_option('draining')
        draining=shot('draining')
        selects.nth(0).select_option('drained')
        drained=shot('drained')
        assert len({first,draining,drained})==3, 'Water stages do not change the scene'
        selects.nth(1).select_option('broadcast')
        scattered=shot('broadcast')
        assert scattered!=drained, 'Planting layout does not change the scene'
        selects.nth(2).select_option('maize')
        maize=shot('maize')
        assert maize!=scattered, 'Crop does not change the scene'
        controls.locator('input[type=checkbox]').check()
        microbes=shot('maize-microbes')
        assert microbes!=maize, 'Microorganism symbols do not change the scene'
        if not fallback:
            lab.locator('.study-view-controls button').nth(1).click()
            assert shot('rotated')!=microbes, 'Rotation does not change the scene'
    elif kind=='reaction_diffusion':
        initial_points=lab.locator('.study-linked polyline').nth(1).get_attribute('points')
        switches=controls.locator('input[type=checkbox]')
        switches.nth(0).uncheck()
        switches.nth(1).check()
        slider=controls.locator('input[type=range]')
        slider.focus()
        page.keyboard.press('End')
        assert slider.input_value()=='1'
        for _ in range(10): controls.locator('button').nth(0).click()
        stepped=shot('step10')
        assert stepped!=first, 'Numerical advance did not change plot'
        assert '20' in controls.locator('output').inner_text()
        controls.locator('button').nth(1).click()
        assert '0' in controls.locator('output').inner_text()
        shot('reset')
        assert lab.locator('.study-linked polyline').nth(1).get_attribute('points')==initial_points, 'Reset did not restore initial concentrations'
    else:
        ranges=controls.locator('input[type=range]')
        ranges.nth(0).focus()
        page.keyboard.press('End')
        assert ranges.nth(0).input_value()=='24'
        assert ranges.nth(1).input_value()=='0'
        filled=shot('co2-filled')
        assert filled!=first, 'CO2 site allocation did not change scene'
        ranges.nth(0).focus()
        page.keyboard.press('Home')
        ranges.nth(1).focus()
        page.keyboard.press('End')
        water=shot('h2o-filled')
        assert water!=filled, 'Water site allocation did not change scene'
        controls.locator('input[type=checkbox]').check()
        assert shot('lifted')!=water, 'Lift control did not change scene'
    dims=page.evaluate("() => ({width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth})")
    assert dims['scroll']<=dims['width']+1, f'{kind}: horizontal overflow {dims}'
    assert not errors, f'{kind}: browser errors {errors}'
    print(f'PASS {marker}')
    context.close()

def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            for kind in KINDS:
                exercise(browser,kind,1440,'en',False)
                exercise(browser,kind,375,'vi',False)
                exercise(browser,kind,375,'vi',True)
        finally:
            browser.close()

if __name__=='__main__':
    main()
