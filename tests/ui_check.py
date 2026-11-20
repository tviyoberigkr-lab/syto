# Перевірка інтерфейсу в справжньому браузері (екран телефона). Запуск: python3 tests/ui_check.py
# Потрібні: python playwright + chromium. CoLaba Production
import asyncio, json, os, shutil, subprocess, sys, tempfile, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
fails = []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

async def main():
    subprocess.run(['node', 'tools/make_prototype.mjs'], cwd=ROOT, check=True, capture_output=True)
    tmp = tempfile.mkdtemp()
    shutil.copytree(os.path.join(ROOT, 'site'), os.path.join(tmp, 'site'))
    proto = open(os.path.join(ROOT, 'prototype/syto-prototype.html'), encoding='utf8').read()
    start = proto.index('window.__SYTO_DATA__ = ') + len('window.__SYTO_DATA__ = ')
    data = json.loads(proto[start:proto.index(';</script>', start)])
    data.pop('demo')
    os.makedirs(os.path.join(tmp, 'site/data'), exist_ok=True)
    json.dump(data, open(os.path.join(tmp, 'site/data/news.json'), 'w', encoding='utf8'), ensure_ascii=False)
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=os.path.join(tmp, 'site'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for scheme in ['light', 'dark']:
                ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme=scheme, locale='uk-UA')
                page = await ctx.new_page()
                errors = []
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                page.on('pageerror', lambda e: errors.append(str(e)))
                print(f'[{scheme}] сайт')
                await page.goto(f'http://127.0.0.1:{PORT}/')
                await page.wait_for_selector('.card')
                n_all = await page.locator('.card').count()
                check(n_all >= 5, f'вкладка Україна показує картки ({n_all})')
                first = await page.locator('.card').first.inner_text()
                check('Підтверджено' in first, 'першою стоїть підтверджена новина')
                check(await page.locator('.b-loud').count() == 1, 'крикливий заголовок позначено')
                check(await page.locator('.b-state').count() >= 1, 'державне ЗМІ позначено')
                await page.click('[data-filter="confirmed"]')
                n_conf = await page.locator('.card').count()
                check(0 < n_conf < n_all, f'фільтр «Лише підтверджені» працює ({n_conf} з {n_all})')
                check(await page.locator('.card .b-single, .card .b-state').count() == 0, 'у фільтрі лишилися тільки підтверджені')
                await page.reload(); await page.wait_for_selector('.card')
                check(await page.locator('.card').count() == n_conf, 'фільтр запам’ятався після перезавантаження')
                await page.click('[data-filter="all"]')
                await page.locator('.card details summary').first.click()
                check(await page.locator('.card details[open] .srcs li').count() >= 3, 'список «Хто про це пише» розкривається')
                links = await page.eval_on_selector_all('.card a', "els => els.map(a => [a.getAttribute('href'), a.target, a.rel])")
                check(all(h and h.startswith('http') and t == '_blank' and 'noopener' in r for h, t, r in links), f'усі {len(links)} посилань — http(s), у новій вкладці, noopener')
                for tab, must, head in [('world', 'підводн', 'Світ'), ('tech', 'ШІ', 'Технології та ШІ'), ('fakes', 'Спростування', 'Фейки')]:
                    await page.click(f'.tabs a[data-tab="{tab}"]')
                    await page.wait_for_function(f"document.getElementById('view-title').textContent === '{head}'")
                    txt = await page.locator('#feed-view').inner_text()
                    check(must in txt and await page.locator('.card').count() > 0, f'вкладка {tab} показує свої новини')
                check(await page.locator('#filters').is_hidden(), 'у «Фейках» фільтр приховано')
                await page.click('.tabs a[data-tab="method"]')
                await page.wait_for_selector('.srctable li')
                check(await page.locator('.srctable li').count() == len(data['sources']), 'сторінка «Як це працює» показує всі джерела')
                check(await page.locator('.dot.bad').count() == 1, 'стрічку, що не відповіла, позначено червоним')
                for tab in ['ukraine', 'method']:
                    await page.goto(f'http://127.0.0.1:{PORT}/#{tab}'); await page.wait_for_timeout(200)
                    over = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
                    check(over <= 0, f'немає горизонтальної прокрутки ({tab})')
                    small = await page.evaluate("[...document.querySelectorAll('button, .tabs a, summary')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 44)).length")
                    check(small == 0, f'усі кнопки не менші за 44px ({tab})')
                    await page.screenshot(path=os.path.join(ROOT, f'tests/shot-{scheme}-{tab}.png'))
                if scheme == 'light':
                    # офлайн: службовий працівник має віддати збережене
                    await page.goto(f'http://127.0.0.1:{PORT}/'); await page.wait_for_selector('.card')
                    await page.evaluate('navigator.serviceWorker.ready'); await page.reload(); await page.wait_for_selector('.card')
                    await ctx.set_offline(True)
                    await page.reload(); await page.wait_for_selector('.card', timeout=8000)
                    check(await page.locator('.card').count() == n_all, 'без інтернету показує збережені новини')
                    check('Немає зв’язку' in await page.locator('#notice').inner_text(), 'без інтернету є попередження')
                    await ctx.set_offline(False)
                    # зіпсований файл даних не ламає застосунок
                    await page.route('**/data/news.json', lambda r: r.fulfill(status=200, body='{"oops":1}', content_type='application/json'))
                    await page.click('#refresh'); await page.wait_for_timeout(500)
                    check(await page.locator('.card').count() == n_all, 'зіпсовані дані ігноруються, лишається попередня стрічка')
                    await page.unroute('**/data/news.json')
                errors = [e for e in errors if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to load resource' not in e]
                check(not errors, 'немає помилок у консолі' + (': ' + '; '.join(errors[:3]) if errors else ''))
                print(f'[{scheme}] прототип (один файл)')
                p2 = await ctx.new_page(); perr = []
                p2.on('pageerror', lambda e: perr.append(str(e)))
                await p2.goto('file://' + os.path.join(ROOT, 'prototype/syto-prototype.html'))
                await p2.wait_for_selector('.card')
                check('ДЕМО' in await p2.locator('#notice').inner_text(), 'прототип показує попередження про демо-дані')
                check(not perr, 'прототип без помилок')
                await p2.screenshot(path=os.path.join(ROOT, f'tests/shot-{scheme}-prototype.png'))
                await ctx.close()
            await b.close()
    finally:
        srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
    print('\nПІДСУМОК:', 'усе пройдено' if not fails else f'{len(fails)} не пройдено')
    sys.exit(1 if fails else 0)

asyncio.run(main())
