// Тести конвеєра. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanText, safeUrl, parseFeed, normalizeItems, stems, similarity, isClickbait, isTech, clusterItems } from '../pipeline/lib.mjs';
import { parseReply, pickProvider } from '../pipeline/translate.mjs';
import { build } from '../pipeline/build.mjs';
import { demoSources, demoFetch } from '../tools/demo_feeds.mjs';

const NOW = Date.parse('2026-11-20T12:00:00Z');

async function run(env = {}, fetchOpts = {}, dir) {
  dir ??= await mkdtemp(join(tmpdir(), 'syto-'));
  const sourcesPath = join(dir, 'sources.json');
  await writeFile(sourcesPath, JSON.stringify({ sources: demoSources }));
  const fetchImpl = demoFetch(NOW, fetchOpts);
  const logs = [];
  const r = await build({ sourcesPath, outPath: join(dir, 'out/news.json'), cachePath: join(dir, 'cache/tr.json'), env, fetchImpl, now: NOW, log: (l) => logs.push(l) });
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
    assert.ok(d.tabs.ukraine.includes(bridge.id) && d.tabs.world.includes(bridge.id));
    const cable = byTitle(d, 'підводн');
    assert.ok(cable.translated && cable.status === 'confirmed');
    assert.equal(cable.summary, 'Демо-опис: кабель подвоює пропускну здатність інтернету.', 'короткий опис теж перекладено');
    assert.ok(cable.sources.every((s) => /undersea/.test(s.title)), 'оригінальні заголовки збережені');
    const ai = byTitle(d, 'модель ШІ');
    assert.equal(ai.confirmations, 2, 'англомовна й українська техноновина зійшлися');
    assert.equal(byTitle(d, 'рекордні').status, 'state');
    assert.equal(d.stats.translation.translated, 9);
    // другий запуск: усе з кешу, платних викликів немає
    const second = await run(env, {}, first.dir);
    assert.equal(second.fetchImpl.calls.translate, 0);
    assert.equal(second.data.stats.translation.fromCache, 9);
    assert.equal(byTitle(second.data, 'міст через річку').confirmations, 4);
  });
}

test('ЗБІРКА: збій перекладача не валить збірку', async () => {
  const { data, written } = await run({ ANTHROPIC_API_KEY: 'test' }, { translatorFails: true });
  assert.ok(written);
  assert.equal(data.stats.translation.failed, 9);
  assert.ok(byTitle(data, 'undersea cable'));
});

test('ЗБІРКА: якщо впали майже всі стрічки — старий файл не затирається', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'syto-'));
  const sourcesPath = join(dir, 'sources.json');
  await writeFile(sourcesPath, JSON.stringify({ sources: demoSources }));
  const outPath = join(dir, 'news.json');
  await writeFile(outPath, '{"keep":true}');
  const r = await build({ sourcesPath, outPath, cachePath: join(dir, 'c.json'), env: {}, fetchImpl: async () => { throw new Error('мережі немає'); }, now: NOW, log: () => {} });
  assert.equal(r.written, false);
  assert.equal(await readFile(outPath, 'utf8'), '{"keep":true}');
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
  }
});
