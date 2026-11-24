// Тести конвеєра. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanText, safeUrl, parseFeed, normalizeItems, stems, similarity, isClickbait, isTech, clusterItems, buildStory } from '../pipeline/lib.mjs';
import { parseReply, parseEntries, pickProvider, translateItems, plausible } from '../pipeline/translate.mjs';
import { build } from '../pipeline/build.mjs';
import { demoSources, demoFetch } from '../tools/demo_feeds.mjs';

const NOW = Date.parse('2026-11-20T12:00:00Z');

async function run(env = {}, fetchOpts = {}, dir) {
  dir ??= await mkdtemp(join(tmpdir(), 'syto-'));
  const sourcesPath = join(dir, 'sources.json');
  await writeFile(sourcesPath, JSON.stringify({ sources: demoSources }));
  const fetchImpl = demoFetch(NOW, fetchOpts);
  const logs = [];
  const r = await build({ sourcesPath, outPath: join(dir, 'out/news.json'), cachePath: join(dir, 'cache/tr.json'), storePath: join(dir, 'cache/items.json'), retryPauseMs: 0, env, fetchImpl, now: NOW, log: (l) => logs.push(l) });
  return { ...r, dir, fetchImpl, logs };
}
const byTitle = (data, part) => data.stories.find((s) => s.title.includes(part));

test('cleanText прибирає теги, скрипти й сутності', () => {
  assert.equal(cleanText('<p>А&amp;Б <b>тест</b></p><script>x()</script>'), 'А&Б тест');
  assert.equal(cleanText('&lt;script&gt;alert(1)&lt;/script&gt; ок'), 'ок');
  assert.ok(cleanText('слово '.repeat(100), 50).length <= 51);
});

test('safeUrl пропускає лише http/https', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,x'), '');
  assert.equal(safeUrl('не посилання'), '');
  assert.equal(safeUrl('https://example.org/a'), 'https://example.org/a');
});

test('велика стрічка з тисячами сутностей розбирається (збій NV і The Guardian 20.11)', () => {
  const item = (i) => `<item><title>Новина ${i} &amp; ще &#8217;щось&#8217; &quot;тут&quot;</title><link>https://e.org/a?x=1&amp;y=${i}</link><description>&lt;p&gt;Опис &amp;amp; текст&lt;/p&gt;</description><pubDate>${new Date(NOW - 3600e3).toUTCString()}</pubDate></item>`;
  const xml = `<?xml version="1.0"?><rss><channel>${Array.from({ length: 600 }, (_, i) => item(i)).join('')}</channel></rss>`;
  const raw = parseFeed(xml);
  assert.equal(raw.length, 600);
  const { items } = normalizeItems(raw, { id: 'x', lang: 'uk' }, NOW);
  assert.equal(items[0].title.replace(/\d+/, 'N'), 'Новина N & ще ’щось’ "тут"');
  assert.match(items[0].url, /^https:\/\/e\.org\/a\?x=1&y=\d+$/);
  assert.equal(items[0].summary, 'Опис & текст');
});

test('parseFeed кидає помилку на не-стрічці', () => {
  assert.throws(() => parseFeed('<html><body>404</body></html>'));
});

test('normalizeItems відкидає записи без дати, старі та з майбутнього', () => {
  const src = { id: 'x', lang: 'uk' };
  const raw = [
    { title: 'Нормальний заголовок новини', link: 'https://e.org/1', date: new Date(NOW - 3600e3).toUTCString() },
    { title: 'Без дати заголовок новини', link: 'https://e.org/2', date: '' },
    { title: 'Із майбутнього заголовок', link: 'https://e.org/3', date: new Date(NOW + 5 * 3600e3).toUTCString() },
    { title: 'Старий заголовок новини', link: 'https://e.org/4', date: new Date(NOW - 80 * 3600e3).toUTCString() },
  ];
  const { items, dropped } = normalizeItems(raw, src, NOW);
  assert.equal(items.length, 1);
  assert.equal(dropped, 3);
});

test('схожість: та сама подія іншими словами схожа, різні події — ні', () => {
  const a = stems('У місті Н відкрили відбудований міст через річку');
  const b = stems('Відбудований міст через річку відкрили у місті Н');
  const c = stems('Школи області переходять на новий розклад дзвінків');
  assert.ok(similarity(a, b) >= 0.5);
  assert.ok(similarity(a, c) < 0.2);
});

test('крикливі заголовки розпізнаються, звичайні — ні', () => {
  assert.ok(isClickbait('ШОК!!! Ви не повірите, що сталося'));
  assert.ok(isClickbait('ТЕРМІНОВА НОВИНА ПРО ДУЖЕ ВАЖЛИВУ ПОДІЮ'));
  assert.ok(!isClickbait('Уряд ухвалив бюджет на наступний рік'));
  assert.ok(!isClickbait('НАТО та ЄС погодили новий пакет допомоги'));
});

test('розпізнавання теми технологій', () => {
  assert.ok(isTech('Нова модель ШІ пише код'));
  assert.ok(isTech('OpenAI releases new model'));
  assert.ok(!isTech('Шість областей без світла'));
  assert.ok(!isTech('Робота транспорту відновлена, роботи тривають'));
  assert.ok(!isTech('ШІСТЬ людей врятовано'));
  assert.ok(!isTech('Ukraine air defence intercepts drones'));
});

test('одне джерело не підтверджує саме себе', () => {
  const mk = (id, src, title) => ({ id, src, title, cmp: title, ts: NOW });
  const g = clusterItems([mk('1', 'a', 'Відкрили міст через річку у місті'), mk('2', 'a', 'Відкрили міст через річку у місті Н')]);
  assert.equal(g.length, 2);
});

test('parseReply перевіряє довжину відповіді перекладача', () => {
  assert.deepEqual(parseReply('Ось: ["а","б"]', 2), ['а', 'б']);
  assert.throws(() => parseReply('["а"]', 2));
  assert.throws(() => parseReply('вибачте', 1));
});

test('parseEntries: змішаний масив рядків і об’єктів із термінами', () => {
  const reply = 'Ось: ' + JSON.stringify([
    'Звичайний переклад',
    { t: 'Хакери використали «вразливість нульового дня»', g: [{ w: 'вразливість нульового дня', e: 'Вразливість нульового дня — помилка, про яку розробник ще не знає.' }] },
    { t: 'Переклад без термінів у вигляді об’єкта' },
  ]);
  const out = parseEntries(reply, 3);
  assert.deepEqual(out[0], { t: 'Звичайний переклад' });
  assert.equal(out[1].g.length, 1);
  assert.equal(out[1].g[0].w, 'вразливість нульового дня');
  assert.deepEqual(out[2], { t: 'Переклад без термінів у вигляді об’єкта' });
  assert.deepEqual(parseReply(reply, 3), ['Звичайний переклад', 'Хакери використали «вразливість нульового дня»', 'Переклад без термінів у вигляді об’єкта']);
});

test('parseEntries: термін, якого немає в перекладі, відкидається, переклад лишається', () => {
  const out = parseEntries(JSON.stringify([{ t: 'Уряд ухвалив бюджет', g: [
    { w: 'канарки', e: 'Чого немає в тексті.' },
    { w: '«бюджет»', e: 'Бюджет — план доходів і витрат.' },  // лапки навколо терміна знімаються
  ] }]), 1);
  assert.equal(out[0].t, 'Уряд ухвалив бюджет');
  assert.deepEqual(out[0].g.map((x) => x.w), ['бюджет']);
});

test('parseEntries: зіпсоване g не валить пакет, зайві й задовгі терміни обрізаються', () => {
  const t = 'Текст із термінами альфа, бета і гамма';
  const out = parseEntries(JSON.stringify([
    { t: 'Перший', g: 'не масив' },
    { t: 'Другий', g: [null, 5, { w: 7, e: 'x' }, { w: 'Другий' }] },
    { t, g: [{ w: 'альфа', e: 'А'.repeat(500) }, { w: 'бета', e: 'Б.' }, { w: 'гамма', e: 'В.' }] },
    { t: 'Четвертий текст', g: [{ w: 'Четвертий ' + 'дуже '.repeat(20), e: 'задовгий термін' }] },
  ]), 4);
  assert.deepEqual(out[0], { t: 'Перший' });
  assert.deepEqual(out[1], { t: 'Другий' });
  assert.equal(out[2].g.length, 2, 'не більше 2 термінів');
  assert.ok(out[2].g[0].e.length <= 161, 'задовге пояснення обрізане');
  assert.deepEqual(out[3], { t: 'Четвертий текст' });
  // а от зіпсований сам переклад — це помилка пакета (далі він ділиться навпіл)
  assert.throws(() => parseEntries(JSON.stringify([{ g: [] }]), 1));
});

test('кеш без поля g (старі записи) працює як раніше', async () => {
  const items = [{ lang: 'en', title: 'Old cached title' }];
  const { createHash } = await import('node:crypto');
  const k = createHash('sha1').update('Old cached title').digest('hex').slice(0, 16);
  const cache = { [k]: { t: 'Старий переклад', ts: NOW } };
  const st = await translateItems(items, cache, { provider: null, now: NOW });
  assert.equal(items[0].titleUk, 'Старий переклад');
  assert.equal(items[0].titleGloss, undefined);
  assert.equal(st.fromCache, 1);
});

test('ЗБІРКА: терміни доходять до картки в news.json і беруться з кешу без платних викликів', async () => {
  const first = await run({ ANTHROPIC_API_KEY: 'test' });
  const saved = JSON.parse(await readFile(join(first.dir, 'out/news.json'), 'utf8'));
  const s = byTitle(saved, 'секретів-приманок');
  assert.ok(s, 'демо-новина з терміном є');
  assert.deepEqual(s.gloss.title.map((x) => x.w), ['секретів-приманок']);
  assert.match(s.gloss.title[0].e, /^Секрети-приманки — /);
  assert.deepEqual(s.gloss.summary.map((x) => x.w), ['атаку на ланцюг постачання']);
  assert.ok(s.title.includes(s.gloss.title[0].w) && s.summary.includes(s.gloss.summary[0].w));
  assert.equal(saved.stories.filter((x) => x.gloss).length, 1, 'поле gloss лише там, де є терміни');
  const cache = JSON.parse(await readFile(join(first.dir, 'cache/tr.json'), 'utf8'));
  assert.equal(Object.values(cache).filter((x) => x.g).length, 2, 'g у кеші лише для двох текстів із термінами');
  const second = await run({ ANTHROPIC_API_KEY: 'test' }, {}, first.dir);
  assert.equal(second.fetchImpl.calls.translate, 0);
  assert.deepEqual(byTitle(second.data, 'секретів-приманок').gloss, s.gloss);
});

test('pickProvider: без ключа — null', () => {
  assert.equal(pickProvider({}), null);
  assert.equal(pickProvider({ GEMINI_API_KEY: 'k' }).name, 'gemini');
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: 'k' }).name, 'anthropic');
});

test('ЗБІРКА без перекладу: статуси, безпека, стан стрічок', async () => {
  const { data, written } = await run();
  assert.ok(written);
  const bridge = byTitle(data, 'міст через річку');
  assert.equal(bridge.status, 'confirmed');
  assert.equal(bridge.confirmations, 3, 'три незалежні українські джерела');
  assert.equal(byTitle(data, 'розклад дзвінків').status, 'single');
  const st = byTitle(data, 'ЦНАП');
  assert.equal(st.status, 'state', 'державне джерело не дає підтвердження');
  assert.ok(st.title.includes('держагентство'), 'windows-1251 прочитано без кракозябр');
  assert.ok(byTitle(data, 'ШОК').clickbait);
  // крикливий заголовок має бути нижче у вкладці, ніж підтверджена новина
  assert.ok(data.tabs.ukraine.indexOf(bridge.id) < data.tabs.ukraine.indexOf(byTitle(data, 'ШОК').id));
  assert.ok(!byTitle(data, 'стара новина'), 'старе відкинуто');
  assert.ok(!byTitle(data, 'небезпечним посиланням'), 'javascript:-посилання відкинуто');
  const all = JSON.stringify(data);
  assert.ok(!/<script|onerror=|javascript:/i.test(all), 'у даних немає HTML/скриптів');
  for (const s of data.stories) for (const x of s.sources) assert.match(x.url, /^https?:\/\//);
  // стан стрічок
  const h = Object.fromEntries(data.health.map((x) => [x.id, x]));
  assert.equal(h['d-broken'].ok && h['d-broken'].items, 0, 'обірвана стрічка не дала записів');
  assert.equal(h['d-down'].ok, false);
  assert.match(h['d-down'].error, /500/);
  assert.equal(data.tabs.fakes.length, 2);
  assert.ok(data.stories.filter((s) => s.status === 'factcheck').every((s) => !data.tabs.ukraine.includes(s.id)));
  // без перекладу англомовні заголовки лишаються оригіналом, але групуються між собою
  const cable = byTitle(data, 'undersea cable');
  assert.equal(cable.status, 'confirmed');
  assert.equal(cable.translated, false);
  assert.ok(data.tabs.tech.includes(byTitle(data, 'модель ШІ').id));
});

for (const [name, env] of [['Gemini', { GEMINI_API_KEY: 'test' }], ['Anthropic', { ANTHROPIC_API_KEY: 'test' }]]) {
  test(`ЗБІРКА з перекладом (${name}): міжмовне підтвердження і кеш`, async () => {
    const first = await run(env);
    const d = first.data;
    const bridge = byTitle(d, 'міст через річку');
    assert.equal(bridge.confirmations, 4, 'російськомовне джерело у вигнанні приєдналося після перекладу');
    assert.ok(bridge.sources.some((s) => s.lang === 'ru'));
    assert.ok(d.tabs.ukraine.includes(bridge.id) && !d.tabs.world.includes(bridge.id), 'внутрішня новина — лише в «Україні», навіть якщо її підхопило іноземне видання');
    const cable = byTitle(d, 'підводн');
    assert.ok(cable.translated && cable.status === 'confirmed');
    assert.equal(cable.summary, 'Демо-опис: кабель подвоює пропускну здатність інтернету.', 'короткий опис теж перекладено');
    assert.ok(cable.sources.every((s) => /undersea/.test(s.title)), 'оригінальні заголовки збережені');
    const ai = byTitle(d, 'модель ШІ');
    assert.equal(ai.confirmations, 2, 'англомовна й українська техноновина зійшлися');
    assert.equal(byTitle(d, 'рекордні').status, 'state');
    assert.equal(d.stats.translation.translated, 12, '9 старих текстів + опис мосту (рос.) + заголовок і опис демо-новини з термінами');
    // другий запуск: усе з кешу, платних викликів немає
    const second = await run(env, {}, first.dir);
    assert.equal(second.fetchImpl.calls.translate, 0);
    assert.equal(second.data.stats.translation.fromCache, 12);
    assert.equal(byTitle(second.data, 'міст через річку').confirmations, 4);
  });
}

test('ЗБІРКА: пауза перекладу (TRANSLATE_MAX_NEW=0) не робить платних викликів', async () => {
  const r = await run({ ANTHROPIC_API_KEY: 'test', TRANSLATE_MAX_NEW: '0' });
  assert.equal(r.fetchImpl.calls.translate, 0);
  assert.equal(r.data.stats.translation.translated, 0);
  assert.ok(r.written);
});

test('ЗБІРКА: збій перекладача не валить збірку', async () => {
  const { data, written } = await run({ ANTHROPIC_API_KEY: 'test' }, { translatorFails: true });
  assert.ok(written);
  assert.equal(data.stats.translation.failed, 12);
  assert.ok(byTitle(data, 'undersea cable'));
});

test('ЗБІРКА: якщо впали майже всі стрічки — старий файл не затирається', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'syto-'));
  const sourcesPath = join(dir, 'sources.json');
  await writeFile(sourcesPath, JSON.stringify({ sources: demoSources }));
  const outPath = join(dir, 'news.json');
  await writeFile(outPath, '{"keep":true}');
  const r = await build({ sourcesPath, outPath, cachePath: join(dir, 'c.json'), storePath: join(dir, 'i.json'), retryPauseMs: 0, env: {}, fetchImpl: async () => { throw new Error('мережі немає'); }, now: NOW, log: () => {} });
  assert.equal(r.written, false);
  assert.equal(await readFile(outPath, 'utf8'), '{"keep":true}');
});

test('ЗБІРКА: якщо стрічка цього разу відмовила (403), її новини лишаються зі сховища', async () => {
  const first = await run();
  const before = byTitle(first.data, 'міст через річку');
  assert.equal(before.confirmations, 3);
  const second = await run({}, { failFeeds: ['https://demo.invalid/a.rss'] }, first.dir);
  const h = Object.fromEntries(second.data.health.map((x) => [x.id, x]));
  assert.equal(h['d-a'].ok, false, 'стрічку чесно показано як таку, що не відповіла');
  const after = byTitle(second.data, 'міст через річку');
  assert.equal(after.confirmations, 3, 'підтвердження не зникло');
  assert.ok(after.sources.some((x) => x.id === 'd-a'));
  assert.ok(byTitle(second.data, 'маршрут приміської електрички'), 'новина лише з цієї стрічки теж лишилась');
});

// ---------- безпека (аудит 21.11) ----------
test('БЕЗПЕКА: ворожий величезний запис не зупиняє конвеєр (лінійний час очищення)', () => {
  for (const evil of ['<script'.repeat(40000), '<'.repeat(200000), '<style'.repeat(40000), '&lt;'.repeat(50000)]) {
    const t0 = Date.now();
    cleanText(evil, 220);
    assert.ok(Date.now() - t0 < 500, `очищення тривало ${Date.now() - t0} мс`);
  }
  const xml = `<?xml version="1.0"?><rss><channel><item><title>${'&lt;'.repeat(40000)}</title><link>https://e.org/1</link><pubDate>${new Date(NOW - 3600e3).toUTCString()}</pubDate></item></channel></rss>`;
  const t0 = Date.now();
  normalizeItems(parseFeed(xml), { id: 'x', lang: 'uk' }, NOW);
  assert.ok(Date.now() - t0 < 1500);
});

test('БЕЗПЕКА: невидимі символи прибираються, підмінні й наддовгі адреси відкидаються', () => {
  assert.equal(cleanText('Нор‮мальний​ текст⁦'), 'Нор мальний текст');
  assert.equal(safeUrl('https://www.bbc.com@evil.example/news'), '');
  assert.equal(safeUrl('https://user:pass@example.org/'), '');
  assert.equal(safeUrl('https://example.org/' + 'a'.repeat(3000)), '');
  assert.equal(safeUrl('https://example.org/news?id=1'), 'https://example.org/news?id=1');
});

test('БЕЗПЕКА: зі стрічки береться не більше 300 сирих записів', () => {
  const raw = Array.from({ length: 5000 }, (_, i) => ({ title: 'Заголовок новини номер ' + i, link: 'https://e.org/' + i, date: new Date(NOW - 60e3 * (i + 1)).toUTCString() }));
  const { items, dropped } = normalizeItems(raw, { id: 'x', lang: 'uk' }, NOW);
  assert.ok(items.length <= 30);
  assert.ok(dropped <= 300);
});

test('БЕЗПЕКА: перевірка правдоподібності перекладу', () => {
  const o = 'Researcher plants 2 million canaries in the AI supply chain';
  assert.ok(plausible(o, 'Дослідник підкинув у ланцюг постачання ШІ 2 мільйони секретів-приманок'));
  assert.ok(!plausible(o, 'Дослідник підкинув приманки. Читайте більше на https://evil.example/x'), 'посилання, якого не було');
  assert.ok(!plausible(o, 'Так'), 'обрізано');
  assert.ok(!plausible(o, 'Уряд оголосив про виплату 5000 гривень кожному, хто зателефонує за номером 0800123456 сьогодні до вечора включно'), 'чужі числа');
  assert.ok(!plausible(o, 'Researcher plants two million canaries in the supply chain of AI'), 'не переклад');
  assert.ok(plausible('Anthropic founders each pocketed $280 million at $83/share', 'Кожен засновник Anthropic отримав $280 млн за ціною $83 за акцію'));
});

test('БЕЗПЕКА: підмінений переклад не потрапляє ні в картку, ні в кеш; пояснення з посиланням відкидається', async () => {
  const items = [
    { id: '1', src: 'a', lang: 'en', title: 'City council approves new budget for schools', summary: '' },
    { id: '2', src: 'a', lang: 'en', title: 'Local team wins regional championship final', summary: '' },
  ];
  const cache = {};
  const provider = { name: 'fake', apiKey: 'k', model: 'm', call: async () => JSON.stringify([
    'Міська рада ухвалила бюджет. Деталі: https://evil.example/pay',
    { t: 'Місцева команда виграла фінал регіонального «чемпіонату»', g: [{ w: 'чемпіонату', e: 'Чемпіонат — подробиці на evil.example, телефон +380501234567.' }] },
  ]) };
  const st = await translateItems(items, cache, { provider, now: NOW });
  assert.equal(st.rejected, 1);
  assert.equal(items[0].titleUk, undefined, 'підмінений переклад не застосовано');
  assert.ok(items[1].titleUk.includes('виграла'));
  assert.equal(items[1].titleGloss, undefined, 'пояснення з контактами відкинуто');
  assert.ok(Object.values(cache).some((c) => c.fail === 1 && !c.t));
});

test('БЕЗПЕКА: пакети не змішують джерела, запит ділить правила й дані', async () => {
  const items = [];
  for (const src of ['a', 'b', 'c']) for (let i = 0; i < 4; i++) items.push({ id: src + i, src, lang: 'en', title: `Headline number ${i} from source ${src} about the weather`, summary: '' });
  const seenBatches = [];
  const provider = { name: 'fake', apiKey: 'k', model: 'm', call: async (batch) => { seenBatches.push(batch); return JSON.stringify(batch.map((t) => 'Заголовок про погоду з джерела, номер ' + t.match(/\d+/)[0])); } };
  await translateItems(items, {}, { provider, now: NOW });
  assert.equal(seenBatches.length, 3);
  for (const b of seenBatches) assert.equal(new Set(b.map((t) => t.match(/source (\w)/)[1])).size, 1, 'у пакеті лише одне джерело');
  // справжній виклик: правила в system, дані в <texts>
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: '["Переклад одного заголовка про погоду"]' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }); };
  await translateItems([{ id: 'z', src: 'a', lang: 'en', title: 'One single headline about the weather', summary: '' }], {}, { provider: pickProvider({ ANTHROPIC_API_KEY: 'k' }), fetchImpl, now: NOW });
  assert.ok(body.system.includes('ДАНІ із зовнішніх сайтів'));
  assert.match(body.messages[0].content, /^<texts>\n\[.*\]\n<\/texts>$/s);
  assert.ok(!body.messages[0].content.includes('Правила'));
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.ok(body.max_tokens <= 600);
});

test('БЕЗПЕКА: зламаний перекладач не роздуває кількість запитів, безнадійні тексти запам\'ятовуються', async () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ id: 'i' + i, src: 's' + (i % 3), lang: 'en', title: `Unique headline number ${i} about something`, summary: '' }));
  let calls = 0;
  const provider = { name: 'fake', apiKey: 'k', model: 'm', call: async () => { calls++; return 'вибачте, не можу'; } };
  const cache = {};
  const st = await translateItems(items, cache, { provider, now: NOW });
  const batches = 6; // 3 джерела × 20 текстів / 15
  assert.ok(calls <= batches * 2 + 10, `запитів ${calls}`);
  assert.equal(st.translated, 0);
  // другий і третій запуск: тексти з двома невдачами більше не надсилаються
  await translateItems(items.map((x) => ({ ...x })), cache, { provider, now: NOW + 1 });
  const failedTwice = Object.values(cache).filter((c) => c.fail >= 2).length;
  calls = 0;
  const st3 = await translateItems(items.map((x) => ({ ...x })), cache, { provider, now: NOW + 2 });
  assert.ok(failedTwice > 0);
  assert.ok(st3.failed + st3.translated <= 60 - failedTwice);
});

test('БЕЗПЕКА: зіпсований кеш перекладів не валить збірку', async () => {
  const items = [{ id: '1', src: 'a', lang: 'en', title: 'Some headline about the economy today', summary: '' }];
  const cache = { x1: { t: 123, g: [1], ts: NOW }, x2: null, x3: 'рядок', x4: { ts: 'не число' } };
  const st = await translateItems(items, cache, { provider: null, now: NOW });
  assert.equal(st.fromCache, 0);
  assert.equal(items[0].titleUk, undefined);
});

test('видання однієї редакційної групи не підтверджують одне одного', () => {
  const srcMap = new Map([
    ['pravda', { id: 'pravda', name: 'УП', type: 'independent', trust: 3, cat: 'ukraine', group: 'up' }],
    ['euro', { id: 'euro', name: 'ЄП', type: 'independent', trust: 3, cat: 'ukraine', group: 'up' }],
    ['nv', { id: 'nv', name: 'NV', type: 'independent', trust: 3, cat: 'ukraine' }],
  ]);
  const m = (id, src) => ({ id, src, title: 'Подія', lang: 'uk', url: 'https://e.org/' + id, ts: NOW, summary: '' });
  const two = buildStory([m('1', 'pravda'), m('2', 'euro')], srcMap, NOW);
  assert.equal(two.status, 'single', 'УП + ЄП — одне джерело');
  assert.equal(two.confirmations, 1);
  const three = buildStory([m('1', 'pravda'), m('2', 'euro'), m('3', 'nv')], srcMap, NOW);
  assert.equal(three.status, 'confirmed');
  assert.equal(three.confirmations, 2);
});

test('спростування живуть тиждень, звичайні новини — 48 год', () => {
  const raw = [{ title: 'Спростування старого фейку про школи', link: 'https://e.org/f', date: new Date(NOW - 100 * 3600e3).toUTCString() }];
  assert.equal(normalizeItems(raw, { id: 'fc', lang: 'uk', cat: 'fakes' }, NOW).items.length, 1);
  assert.equal(normalizeItems(raw, { id: 'n', lang: 'uk', cat: 'ukraine' }, NOW).items.length, 0);
});

test('справжній sources.json коректний', async () => {
  const { sources } = JSON.parse(await readFile(new URL('../sources.json', import.meta.url), 'utf8'));
  const ids = new Set();
  for (const s of sources) {
    assert.ok(!ids.has(s.id), `дубль id ${s.id}`); ids.add(s.id);
    assert.match(s.feed, /^https?:\/\//);
    assert.ok(['independent', 'public', 'state', 'exile', 'factcheck'].includes(s.type));
    assert.ok(['ukraine', 'world', 'tech', 'fakes'].includes(s.cat));
    assert.ok(['uk', 'en', 'ru'].includes(s.lang));
    assert.ok(s.trust >= 1 && s.trust <= 3);
    if (s.group !== undefined) assert.match(s.group, /^[a-z0-9-]+$/);
  }
});

test('cleanText прибирає рекламні вставки видань', () => {
  const raw = 'Former officer pleaded not guilty Get our breaking news email , free app or daily news podcast Beau knew he had murdered';
  assert.equal(cleanText(raw), 'Former officer pleaded not guilty Beau knew he had murdered');
});

test('Sonnet 5.5: замість «disabled» надсилається between_tools (без міркувань)', async () => {
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: '["Переклад одного заголовка про погоду"]' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }); };
  const provider = pickProvider({ ANTHROPIC_API_KEY: 'k', TRANSLATE_MODEL: 'claude-sonnet-5-5' });
  await translateItems([{ id: 'z', src: 'a', lang: 'en', title: 'One single headline about the weather', summary: '' }], {}, { provider, fetchImpl, now: NOW });
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.deepEqual(body.thinking, { type: 'between_tools' });
  assert.ok(body.max_tokens <= 600);
});

// Розділи «Україна» / «Світ» — за змістом новини (правило Романа 23.11.2026). Заголовки — справжні, зі стрічки Syto 23.11.
test('topicOf: «Україна» — про Україну, «Світ» — решта світу', async () => {
  const { topicOf } = await import('../pipeline/lib.mjs');
  const UA = { cat: 'ukraine' }, WD = { cat: 'world' };
  const t = (title, lang = 'uk', source = UA, summary = '') => topicOf([{ title, lang, source, summary }]);
  const ukraine = [
    'Мерц назвав помилкою рішення НАТО 2008 року не приймати Україну до Альянсу',
    'У Києві серед постраждалих через атаку РФ є громадянин США – влада',
    'На Гуляйпільському напрямку тривають бої за Верхню Терсу – 7 корпус ДШВ',
    'ТСК проголосувала за примусовий привід Федорова на засідання 7 грудня',
    'На Житомирщині РФ атакувала дронами дитячий садок та залізницю',
    'Ткаченко: кількість загиблих через удар РФ по Димеру зросла до трьох',
    'ВАКС оголосив вирок у справі депутата Лабазюка. Він заявив про намір його оскаржити',
    'Українська команда стала чемпіоном світу з Brawl Stars і виграла 450 тисяч доларів',
    'Сили Оборони відкинули росіян біля Устинівки на Харківщині – DeepState',
    'СБУ про "зустріч Дуки під СІЗО": "Альфа" була при виконанні, решті вказівок не давали',
    'Демо: в області запрацював новий маршрут приміської електрички',
  ];
  const world = [
    'Таджикистан заявив, що вийшов з Міжнародного кримінального суду в день візиту Путіна',
    'ЗМІ: Росія готується розмістити ядерну зброю у космосі',
    'Італійський ювелір і бізнесмен Паоло Булгарі помер у віці 89 років',
    'Збій у Delta Air Lines спричинив масові затримки рейсів у США',
    'ЗМІ: Кіпр вислав двох російських дипломатів за підозрою у шпигунстві',
    'Рекордна більшість з 1992-го: демократи отримають щонайменше 258 місць у Палаті представників',
    'Дженсен Хуанг повертається на посаду президента NVIDIA',
    'У Канаді посміялися з Трампа. На вечерю парламентської пресгалереї запросили коміка',
    'Ціни на газ у Європі різко зросли через прогноз різкого похолодання',
  ];
  for (const x of ukraine) assert.equal(t(x), 'ukraine', x);
  for (const x of world) assert.equal(t(x), 'world', x);
  // іноземне видання про Україну — у «Україні»; іноземне без ознак України — у «Світі»
  assert.equal(t('Zelensky says Ukraine sank a Russian warship off Libya', 'en', WD), 'ukraine');
  assert.equal(t('Murmansk governor detained', 'en', WD), 'world');
  assert.equal(t('Затримано губернатора Мурманської області Андрія Чибіса', 'ru', WD), 'world');
  // звичайні слова не плутаються з назвами
  assert.equal(t('Кримінальна справа щодо банкіра у Франції', 'uk', WD), 'world');
  assert.equal(t('Ціна газу для населення не зміниться до весни'), 'ukraine');
  // правила 23.11 (після скріна Романа): Тайсон Ф'юрі — не про Україну, хоч в описі Кличко і новину дало BBC Україна
  const fury = [
    { title: '"Чув голоси". Боксер Тайсон Ф\'юрі розповів, що йому діагностували шизофренію', lang: 'uk', source: UA,
      summary: 'Тайсон Ф\'юрі розповів, що йому діагностували шизофренію невдовзі після перемоги над Володимиром Кличком у 2015 році.' },
    { title: 'Тайсон Фьюри рассказал, что слышал голоса', lang: 'ru', source: WD, summary: '' },
  ];
  assert.equal(topicOf(fury), 'world');
  // Україна лише в описі: якщо заголовок про іншу країну — «Світ», якщо ні — «Україна»
  assert.equal(t('Фінляндія викликала посла Росії через порушення повітряного простору', 'uk', UA, 'Минулого тижня дрони атакували Україну.'), 'world');
  assert.equal(t('Відкрили новий міст після ремонту', 'en', WD, 'The bridge near Kyiv was destroyed in 2022.'), 'ukraine');
  // внутрішня новина, яку дали лише українськомовні редакції (DW українською — теж), — «Україна»
  assert.equal(topicOf([{ title: 'Ексвіцепрем\'єру Чернишову оголосили нову підозру', lang: 'uk', source: WD }, { title: 'Чернишову повідомили про нову підозру', lang: 'uk', source: UA }]), 'ukraine');
});

test('PROMO: прибирає й політичну розсилку Guardian', async () => {
  const { cleanText } = await import('../pipeline/lib.mjs');
  const r = cleanText('Nearly half say no. Get our daily political email , free app or daily news podcast A new poll shows');
  assert.ok(!/Get our|podcast/.test(r), r);
  assert.ok(/A new poll shows/.test(r));
});
test('fixMixed: латинські двійники виправляє, зіпсоване слово відкидає, слова з оригіналу не чіпає', async () => {
  const { fixMixed } = await import('../pipeline/translate.mjs');
  assert.deepEqual(fixMixed('x', 'у мерiях Ослo'), { t: 'у меріях Осло', bad: false });
  assert.equal(fixMixed('x', 'селище Дímер').bad, true);
  assert.equal(fixMixed('x', 'треба переклbasти').bad, true);
  assert.equal(fixMixed('iPhoneом', 'з iPhoneом').t, 'з iPhoneом');
  assert.deepEqual(fixMixed('x', 'Apple і Google'), { t: 'Apple і Google', bad: false });
});
