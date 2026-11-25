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

async def wait_title(page, head, timeout=8.0):
    # Без page.wait_for_function: політика безпеки вмісту сайту забороняє eval, і це правильно.
    t0 = time.time()
    while time.time() - t0 < timeout:
        if await page.locator('#view-title').inner_text() == head: return
        await page.wait_for_timeout(50)
    raise AssertionError(f'заголовок вкладки не став «{head}»')

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
                # рубрики (25.11): ряд кнопок, фільтр, пам'ять вибору, пустий стан
                subs = page.locator('#subs .sub')
                check(await subs.count() == 10 and await subs.first.inner_text() == 'Усе', f'ряд рубрик у «Україні» ({await subs.count()} кнопок)')
                check(await page.locator('#subs .sub[aria-pressed="true"]').inner_text() == 'Усе', 'типово вибрано «Усе»')
                await page.click('#subs .sub[data-sub="economy"]')
                n_eco = await page.locator('.card').count()
                check(0 < n_eco < n_all and 'електричк' in await page.locator('.card').first.inner_text(), f'рубрика «Економіка» показує лише свої новини ({n_eco})')
                check(all('Економіка' in t for t in await page.locator('.card .meta').all_inner_texts()), 'у картці видно назву рубрики')
                await page.reload(); await page.wait_for_selector('.card')
                check(await page.locator('#subs .sub[aria-pressed="true"]').get_attribute('data-sub') == 'economy', 'вибір рубрики запам’ятався після перезавантаження')
                await page.click('#subs .sub[data-sub="auto"]')  # у демо-даних авто-новин немає
                check(await page.locator('.card').count() == 0 and 'Авто' in await page.locator('#empty').inner_text(), 'порожня рубрика пояснює, що робити')
                await page.click('#subs .sub[data-sub="garden"]')
                check(await page.locator('.card').count() == 1 and 'часник' in await page.locator('.card').first.inner_text(), 'садова порада десятиденної давнини показується (вікно 30 днів)')
                await page.click('#subs .sub[data-sub="all"]')
                check(await page.locator('.card').count() == n_all, '«Усе» повертає весь розділ')
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
                    await wait_title(page, head)
                    txt = await page.locator('#feed-view').inner_text()
                    check(must in txt and await page.locator('.card').count() > 0, f'вкладка {tab} показує свої новини')
                check(await page.locator('#filters').is_hidden(), 'у «Фейках» фільтр приховано')
                check(await page.locator('#subs').is_hidden(), 'у «Фейках» рубрик немає')
                await page.click('.tabs a[data-tab="world"]'); await wait_title(page, 'Світ')
                check(await page.locator('#subs .sub').count() == 8 and await page.locator('#subs .sub[data-sub="garden"]').count() == 0, 'у «Світі» 7 рубрик без саду та ІТ')
                await page.click('.tabs a[data-tab="tech"]'); await wait_title(page, 'Технології та ШІ')
                check(await page.locator('#subs').is_hidden(), 'у «Техно» рубрик немає')
                # терміни з поясненнями (демо-новина у вкладці «Технології та ШІ»)
                await page.click('.tabs a[data-tab="tech"]')
                await wait_title(page, 'Технології та ШІ')
                terms = page.locator('.card .term')
                check(await terms.count() >= 2, f'сині слова-терміни є ({await terms.count()})')
                tt = await terms.first.inner_text()
                check(tt.startswith('«') and tt.endswith('»') and '««' not in tt and '»»' not in tt, f'термін у лапках, без подвоєння ({tt})')
                st = await page.eval_on_selector('.card .term', """b => { const c = b.closest('.card'); const a = c.querySelector('h3 a');
                    const cs = getComputedStyle(b); const lum = s => { const v = s.match(/[\\d.]+/g).slice(0,3).map(x => { x = x/255; return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); }); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; };
                    const L1 = lum(cs.color), L2 = lum(getComputedStyle(c).backgroundColor);
                    return { term: cs.color, text: getComputedStyle(a).color, deco: cs.textDecorationLine, tag: b.tagName, inLink: !!b.closest('a'),
                             contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), h: b.getBoundingClientRect().height }; }""")
                check(st['term'] != st['text'], f"колір терміна відрізняється від звичайного тексту ({st['term']} проти {st['text']})")
                check(st['contrast'] >= 4.5, f"термін читається на тлі картки (контраст {st['contrast']:.1f}:1)")
                check(st['deco'] == 'none', 'термін без підкреслення')
                check(st['tag'] == 'BUTTON' and not st['inLink'], 'термін — справжня кнопка, не всередині посилання')
                check(st['h'] >= 36, f"зона натискання терміна зручна ({st['h']:.0f}px заввишки)")
                url0, pages0 = page.url, len(ctx.pages)
                await terms.first.click(); await page.wait_for_timeout(200)
                box = page.locator('.card .gloss:visible')
                gtxt = await box.first.inner_text() if await box.count() else ''
                check(await box.count() == 1 and 'Секрети-приманки' in gtxt, f'клік показує пояснення ({gtxt[:40]}…)')
                check(await terms.first.get_attribute('aria-expanded') == 'true', 'aria-expanded=true після кліку')
                check(page.url == url0 and len(ctx.pages) == pages0, 'клік по терміну не відкриває статтю й не змінює адресу')
                await terms.nth(1).click(); await page.wait_for_timeout(200)
                gtxt2 = await page.locator('.card .gloss:visible').first.inner_text() if await page.locator('.card .gloss:visible').count() else ''
                check(await page.locator('.card .gloss:visible').count() == 1 and 'Атака на ланцюг' in gtxt2 and await terms.first.get_attribute('aria-expanded') == 'false', 'інший термін перемикає пояснення')
                await terms.nth(1).click(); await page.wait_for_timeout(200)
                check(await page.locator('.card .gloss:visible').count() == 0 and await terms.nth(1).get_attribute('aria-expanded') == 'false', 'повторний клік ховає пояснення')
                # словник скорочень: українська новина (без перекладу) теж має синє слово, але без примітки «Пояснення ШІ»
                await page.click('.tabs a[data-tab="ukraine"]')
                await wait_title(page, 'Україна')
                await page.click('#subs .sub[data-sub="all"]')
                dict_term = page.locator('.card .term[data-dict="1"]')
                check(await dict_term.count() >= 1, f'скорочення зі словника підсвічене ({await dict_term.count()})')
                check(await dict_term.first.inner_text() == '«NYT»', f'термін у лапках ({await dict_term.first.inner_text()})')
                await dict_term.first.click(); await page.wait_for_timeout(200)
                gl = page.locator('.card .gloss:visible').first
                check('The New York Times' in await gl.inner_text(), 'пояснення скорочення показується')
                check(await page.locator('.card .gloss:visible .gloss-note').count() == 0, 'для словника немає примітки «Пояснення ШІ»')
                await dict_term.first.click()
                await page.click('.tabs a[data-tab="method"]')
                await page.wait_for_selector('.srctable li')
                check(await page.locator('.srctable li').count() == len(data['sources']), 'сторінка «Як це працює» показує всі джерела')
                check(await page.locator('.dot.bad').count() == 1, 'стрічку, що не відповіла, позначено червоним')
                for tab in ['ukraine', 'tech', 'method']:
                    await page.goto(f'http://127.0.0.1:{PORT}/#{tab}'); await page.wait_for_timeout(200)
                    over = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
                    check(over <= 0, f'немає горизонтальної прокрутки ({tab})')
                    # .term — кнопка в рядку тексту: 44px заввишки вона розсунула б рядки заголовка; її зону натискання
                    # перевіряємо окремо вище (padding із від'ємним margin), тут виключаємо
                    small = await page.evaluate("[...document.querySelectorAll('button:not(.term), .tabs a, summary')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 44)).length")
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
            # ---- комп'ютер: вікно 1280x800, мишка (25.11) ----
            print('[desktop] сайт у вікні 1280x800')
            ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, locale='uk-UA')
            page = await ctx.new_page()
            derr = []
            page.on('pageerror', lambda e: derr.append(str(e)))
            await page.goto(f'http://127.0.0.1:{PORT}/')
            await page.wait_for_selector('.card')
            subs = await page.evaluate("(() => { const b = document.getElementById('subs'); const r = b.getBoundingClientRect();"
                                       " return { hidden: b.hidden, scroll: b.scrollWidth - b.clientWidth, rows: new Set([...b.children].map(c => Math.round(c.getBoundingClientRect().top))).size,"
                                       " last: b.lastElementChild.getBoundingClientRect().right <= r.right + 1 }; })()")
            check(subs['scroll'] <= 1, f"рубрики не ховаються за прокруткою (приховано {subs['scroll']}px)")
            check(subs['last'], 'остання рубрика («Сад і город») видна без гортання')
            check(subs['rows'] >= 1, f"рубрики стоять рядками ({subs['rows']})")
            await page.click('#subs .sub[data-sub="economy"]')
            check(await page.locator('.card').count() > 0, 'рубрика перемикається мишею')
            over = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            check(over <= 0, 'немає горизонтальної прокрутки сторінки')
            tabs = await page.evaluate("(() => { const t = document.querySelector('.tabs').getBoundingClientRect();"
                                       " return { w: Math.round(t.width), centered: Math.abs((t.left + t.right) / 2 - window.innerWidth / 2) < 2 }; })()")
            check(tabs['w'] <= 800 and tabs['centered'], f"панель розділів по центру, не на весь екран ({tabs['w']}px)")
            align = await page.evaluate("(() => { const b = document.querySelector('.brand').getBoundingClientRect();"
                                        " const c = document.querySelector('.card').getBoundingClientRect();"
                                        " const r = document.getElementById('refresh').getBoundingClientRect();"
                                        " return { left: Math.round(b.left - c.left), right: Math.round(c.right - r.right) }; })()")
            check(abs(align['left']) <= 14 and abs(align['right']) <= 14, f"шапка в одній колонці з новинами (зсув {align['left']}/{align['right']}px)")
            await page.click('.tabs a[data-tab="world"]')
            await wait_title(page, 'Світ')
            check(await page.locator('#subs .sub').count() == 8, 'у «Світі» рубрики теж на місці')
            await page.screenshot(path=os.path.join(ROOT, 'tests/shot-desktop-ukraine.png'), full_page=False)
            check(not derr, 'немає помилок сторінки на комп\'ютері' + (': ' + derr[0] if derr else ''))
            await ctx.close()
            await b.close()
    finally:
        srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
    print('\nПІДСУМОК:', 'усе пройдено' if not fails else f'{len(fails)} не пройдено')
    sys.exit(1 if fails else 0)

asyncio.run(main())
