"""Browser smoke test (Playwright): loads dist/index.html, walks every tab for several jobs, fails on JS errors or stray undefined/NaN/null text.
Setup once: pip install playwright && playwright install chromium
Run: python tests/e2e/smoke.py
"""
from playwright.sync_api import sync_playwright
import os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'dist' / 'index.html'      # run `npm run build` first
OUT = ROOT / 'tests' / 'e2e' / 'out'; OUT.mkdir(exist_ok=True)   # screenshots (gitignored)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':900})
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text else None)
    pg.goto(PAGE.as_uri()); pg.wait_for_timeout(600)
    pg.click('[data-tab=math]'); pg.wait_for_timeout(200)
    print('piece rows',pg.locator('#p-out tbody tr').count(), pg.inner_text('#jobinfo'))
    pg.click('[data-tab=math]'); pg.click('[data-sub=sync]'); pg.click('#s-valid summary'); pg.wait_for_timeout(300)
    print(pg.inner_text('#s-valid-out')[:700].replace('\n',' | '))
    pg.click('[data-tab=pool]'); pg.wait_for_timeout(300)
    print('browse',pg.inner_text('#b-count'),'pool rows',pg.locator('#pool-table tbody tr').count())
    pg.fill('#b-q','Dreadwyrm'); pg.fill('#b-min','125'); pg.wait_for_timeout(200)
    print('dreadwyrm',pg.inner_text('#b-count'))
    pg.select_option('#b-sort','spd'); pg.fill('#b-q',''); pg.fill('#b-min','100'); pg.fill('#b-max','160'); pg.wait_for_timeout(200)
    print('100-160',pg.inner_text('#b-count')); pg.click('#b-addall'); pg.wait_for_timeout(300)
    print(pg.inner_text('#pool-count')[:80])
    pg.click('[data-tab=opt]'); pg.wait_for_timeout(800)
    print(pg.inner_text('#o-out .readout').replace('\n',' | '))
    pg.screenshot(path=str(OUT/'optimizer.png'),full_page=True)
    pg.select_option('#job','WAR'); pg.wait_for_timeout(400)
    print('WAR',pg.inner_text('#jobinfo')[:120])
    pg.select_option('#job','PLD'); pg.wait_for_timeout(300); pg.click('[data-tab=pool]'); pg.wait_for_timeout(200)
    print('PLD',pg.inner_text('#pool-count')[:140])
    pg.screenshot(path=str(OUT/'pool.png'),full_page=True)
    pg.set_viewport_size({'width':400,'height':800}); hs=pg.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'); print('hscroll',hs)
    if hs: errs.append('BAD horizontal scroll at 400px')
    for job in ['SGE','WAR','PLD','BLM','NIN','DRG']:
        pg.select_option('#job',job); pg.wait_for_timeout(200)
        for tab in ['pool','opt','math','math:sync']:
            pg.click('[data-tab='+tab.split(':')[0]+']'); pg.wait_for_timeout(250)
            if ':' in tab: pg.click('[data-sub=sync]'); pg.wait_for_timeout(150)
            txt=pg.inner_text('body')
            for bad in ['undefined','NaN','null']:
                if bad in txt: errs.append(f'BAD {bad} in {job}/{tab}')
    b.close()
print('\n'.join(errs) or 'no errors')
sys.exit(1 if errs else 0)
