# Syto — скріни для Google Play: python3 tools/store_screens.py (сайт з даними має бути на 127.0.0.1:8766). CoLaba Production
import asyncio, sys
from playwright.async_api import async_playwright
OUT='/home/claude/shots/out'
async def main():
    import os; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':360,'height':640}, device_scale_factor=3, color_scheme='dark', locale='uk-UA')
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        for i,(tab,name) in enumerate([('ukraine','1_ukraine'),('world','2_world'),('tech','3_tech'),('fakes','4_fakes'),('method','5_about')]):
            await pg.goto(f'http://127.0.0.1:8766/#{tab}'); await asyncio.sleep(1.2)
            if tab=='world':
                t=pg.locator('button.term').first
                if await t.count():
                    await t.click(); await asyncio.sleep(0.4)
                    await t.evaluate("el => { const c = el.closest('.card'); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 70); }"); await asyncio.sleep(0.4)
            await pg.screenshot(path=f'{OUT}/{name}.png')
        print('errors',errs); await b.close()
asyncio.run(main())
